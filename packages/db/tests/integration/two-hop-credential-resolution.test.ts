import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createBotApplication,
  createGuild,
  createTenant,
  reassignBotForGuild,
  resolveBotApplicationForGuild,
  type DatabaseClient,
  type Tenant,
} from "../../src/index.js";
import {
  cleanupTenant,
  createTestClient,
  probeDatabase,
  randomSnowflake,
  testId,
} from "./helpers.js";

/**
 * The two-hop credential-resolution risk (docs/THREAT_MODEL.md,
 * docs/adr/0006's Consequences section): Guild -> GuildBotAssignment ->
 * BotApplication. Any code resolving a BotApplication via a Guild path must
 * verify that Guild's owning Tenant matches the caller's authorized Tenant
 * -- a two-hop IDOR is easy to miss if only the direct Tenant->
 * BotApplication path is tested. This is also where docs/TESTING.md
 * scenario 16 ("DB constraints reject invalid cross-tenant relationships")
 * is proven directly at the database level, independent of the repository
 * layer's own correctness.
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] two-hop-credential-resolution integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)(
  "two-hop Guild -> GuildBotAssignment -> BotApplication resolution (real database)",
  () => {
    let client: DatabaseClient;
    let tenantX: Tenant;
    let tenantY: Tenant;
    let guildUnderX: bigint;
    let botUnderX: string;
    let guildUnderY: bigint;
    let botUnderY: string;
    let unassignedGuildUnderX: bigint;

    beforeAll(async () => {
      client = createTestClient();
      tenantX = await createTenant(client.db, testId("tenant-x"));
      tenantY = await createTenant(client.db, testId("tenant-y"));

      const gx = await createGuild(client.db, tenantX.id, randomSnowflake(), testId("guild-x"));
      guildUnderX = gx.id;
      const bx = await createBotApplication(
        client.db,
        tenantX.id,
        randomSnowflake(),
        testId("bot-x"),
      );
      botUnderX = bx.id;
      await reassignBotForGuild(client.db, tenantX.id, guildUnderX, botUnderX);

      const gy = await createGuild(client.db, tenantY.id, randomSnowflake(), testId("guild-y"));
      guildUnderY = gy.id;
      const by = await createBotApplication(
        client.db,
        tenantY.id,
        randomSnowflake(),
        testId("bot-y"),
      );
      botUnderY = by.id;
      await reassignBotForGuild(client.db, tenantY.id, guildUnderY, botUnderY);

      // A second, still-unassigned guild under Tenant X, used only for the
      // raw-SQL constraint-rejection test below so it doesn't collide with
      // guildUnderX's existing PRIMARY KEY row in guild_bot_assignments.
      const gx2 = await createGuild(
        client.db,
        tenantX.id,
        randomSnowflake(),
        testId("guild-x-unassigned"),
      );
      unassignedGuildUnderX = gx2.id;
    });

    afterAll(async () => {
      await cleanupTenant(client.db, tenantX.id);
      await cleanupTenant(client.db, tenantY.id);
      await client.close();
    });

    it("resolves the full chain correctly when every hop is genuinely within the caller's authorized tenant", async () => {
      const result = await resolveBotApplicationForGuild(client.db, tenantX.id, guildUnderX);
      expect(result?.botApplicationId).toBe(botUnderX);
    });

    it("fails the chain when the Guild hop belongs to a different tenant than claimed", async () => {
      // Tenant X's caller tries to resolve via Tenant Y's guild.
      const result = await resolveBotApplicationForGuild(client.db, tenantX.id, guildUnderY);
      expect(result).toBeUndefined();
    });

    it("never returns a cross-tenant-mismatched BotApplication even if a guildId happens to collide with an unrelated tenant's data", async () => {
      // Defense in depth: confirm the resolver's own tenantId filter is
      // applied to BOTH joins (guilds and bot_applications), not just one.
      const result = await resolveBotApplicationForGuild(client.db, tenantY.id, guildUnderX);
      expect(result).toBeUndefined();
    });

    it("the database itself rejects a cross-tenant GuildBotAssignment row, independent of the repository layer (docs/TESTING.md #16)", async () => {
      // Bypasses reassignBotForGuild entirely -- a raw INSERT linking a real
      // Tenant X guild to Tenant Y's bot application under Tenant X's own
      // tenantId. The guild hop matches (guild really is tenantX's), but the
      // bot-application hop does not (botUnderY really belongs to tenantY) --
      // the composite FK (botApplicationId,tenantId)->bot_applications(id,
      // tenantId) has no matching row for (botUnderY, tenantX.id) and must
      // reject this outright.
      await expect(
        client.db.execute(
          sql`insert into guild_bot_assignments (guild_id, bot_application_id, tenant_id) values (${unassignedGuildUnderX}, ${botUnderY}, ${tenantX.id})`,
        ),
      ).rejects.toThrow();

      // Confirm nothing was actually written by the rejected attempt.
      const result = await resolveBotApplicationForGuild(
        client.db,
        tenantX.id,
        unassignedGuildUnderX,
      );
      expect(result).toBeUndefined();
    });
  },
);
