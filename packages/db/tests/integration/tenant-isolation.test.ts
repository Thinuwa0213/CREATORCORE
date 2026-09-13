import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createBotApplication,
  createGuild,
  createTenant,
  disableTenant,
  reassignBotForGuild,
  resolveBotApplicationForGuild,
  findBotApplicationByTenantAndId,
  findGuildByTenantAndId,
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
 * Cross-tenant isolation (docs/TESTING.md, docs/SECURITY.md's primary
 * security boundary): Tenant A must never be able to read or write Tenant
 * B's Guild/BotApplication/GuildBotAssignment through this package's
 * repository layer. Real MySQL only -- no mocking the isolation guarantee.
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] tenant-isolation integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("cross-tenant isolation (real database)", () => {
  let client: DatabaseClient;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let guildBId: bigint;
  let botBId: string;

  beforeAll(async () => {
    client = createTestClient();
    tenantA = await createTenant(client.db, testId("tenant-a"));
    tenantB = await createTenant(client.db, testId("tenant-b"));

    const guildB = await createGuild(client.db, tenantB.id, randomSnowflake(), testId("guild-b"));
    guildBId = guildB.id;

    const botB = await createBotApplication(
      client.db,
      tenantB.id,
      randomSnowflake(),
      testId("bot-b"),
    );
    botBId = botB.id;

    await reassignBotForGuild(client.db, tenantB.id, guildBId, botBId);
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenantA.id);
    await cleanupTenant(client.db, tenantB.id);
    await client.close();
  });

  it("Tenant A cannot read Tenant B's Guild", async () => {
    const result = await findGuildByTenantAndId(client.db, tenantA.id, guildBId);
    expect(result).toBeUndefined();
  });

  it("Tenant A cannot read Tenant B's BotApplication", async () => {
    const result = await findBotApplicationByTenantAndId(client.db, tenantA.id, botBId);
    expect(result).toBeUndefined();
  });

  it("Tenant A cannot read Tenant B's GuildBotAssignment", async () => {
    const result = await resolveBotApplicationForGuild(client.db, tenantA.id, guildBId);
    expect(result).toBeUndefined();
  });

  it("Tenant A cannot update Tenant B's GuildBotAssignment — rejected at the database level", async () => {
    const botA = await createBotApplication(
      client.db,
      tenantA.id,
      randomSnowflake(),
      testId("bot-a-for-cross-tenant-attempt"),
    );

    await expect(reassignBotForGuild(client.db, tenantA.id, guildBId, botA.id)).rejects.toThrow();

    // Confirm Tenant B's real assignment is untouched by the rejected attempt.
    const stillB = await resolveBotApplicationForGuild(client.db, tenantB.id, guildBId);
    expect(stillB?.botApplicationId).toBe(botBId);
  });
});

describe.skipIf(!dbAvailable)(
  "disabled tenants cannot perform privileged operations (real database)",
  () => {
    let client: DatabaseClient;
    let tenant: Tenant;
    let guildId: bigint;
    let botAId: string;
    let botBId: string;

    beforeAll(async () => {
      client = createTestClient();
      tenant = await createTenant(client.db, testId("tenant-disabled"));

      // Created while the tenant is still ACTIVE, so there is a real guild and
      // a real second BotApplication to attempt reassignment onto once the
      // tenant is disabled below (Phase 3 review finding M1).
      const guild = await createGuild(
        client.db,
        tenant.id,
        randomSnowflake(),
        testId("guild-for-disabled-tenant"),
      );
      guildId = guild.id;
      const botA = await createBotApplication(
        client.db,
        tenant.id,
        randomSnowflake(),
        testId("bot-a-for-disabled-tenant"),
      );
      botAId = botA.id;
      const botB = await createBotApplication(
        client.db,
        tenant.id,
        randomSnowflake(),
        testId("bot-b-for-disabled-tenant"),
      );
      botBId = botB.id;
      await reassignBotForGuild(client.db, tenant.id, guildId, botAId);

      await disableTenant(client.db, tenant.id);
    });

    afterAll(async () => {
      await cleanupTenant(client.db, tenant.id);
      await client.close();
    });

    it("cannot create a Guild under a disabled tenant", async () => {
      await expect(
        createGuild(client.db, tenant.id, randomSnowflake(), testId("guild-under-disabled")),
      ).rejects.toThrow(/not active/i);
    });

    it("cannot create a BotApplication under a disabled tenant", async () => {
      await expect(
        createBotApplication(client.db, tenant.id, randomSnowflake(), testId("bot-under-disabled")),
      ).rejects.toThrow(/not active/i);
    });

    it("cannot reassign a guild's BotApplication under a disabled tenant (Phase 3 review finding M1)", async () => {
      await expect(reassignBotForGuild(client.db, tenant.id, guildId, botBId)).rejects.toThrow(
        /not active/i,
      );

      // Confirm the original assignment survives the rejected attempt.
      const stillAssigned = await resolveBotApplicationForGuild(client.db, tenant.id, guildId);
      expect(stillAssigned?.botApplicationId).toBe(botAId);
    });
  },
);
