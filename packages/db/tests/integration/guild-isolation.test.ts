import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * Cross-guild isolation (docs/TESTING.md scenario 4): a caller supplying a
 * guessed Guild ID must never retrieve that guild's BotApplication
 * relationship unless it is genuinely the guild they are authorized for.
 * This holds both across tenants (reinforcing tenant isolation from the
 * guild axis) and within a single tenant that owns multiple guilds (proving
 * the resolver is specific to the exact guildId requested, not "any guild
 * this tenant owns").
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] guild-isolation integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("cross-guild isolation (real database)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let otherTenant: Tenant;
  let guildOneId: bigint;
  let guildTwoId: bigint;
  let botOneId: string;
  let botTwoId: string;
  let otherTenantGuildId: bigint;
  let otherTenantBotId: string;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("tenant-guild-iso"));
    otherTenant = await createTenant(client.db, testId("tenant-guild-iso-other"));

    const guildOne = await createGuild(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("guild-one"),
    );
    const guildTwo = await createGuild(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("guild-two"),
    );
    guildOneId = guildOne.id;
    guildTwoId = guildTwo.id;

    const botOne = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-one"),
    );
    const botTwo = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-two"),
    );
    botOneId = botOne.id;
    botTwoId = botTwo.id;

    await reassignBotForGuild(client.db, tenant.id, guildOneId, botOneId);
    await reassignBotForGuild(client.db, tenant.id, guildTwoId, botTwoId);

    const otherGuild = await createGuild(
      client.db,
      otherTenant.id,
      randomSnowflake(),
      testId("other-tenant-guild"),
    );
    otherTenantGuildId = otherGuild.id;
    const otherBot = await createBotApplication(
      client.db,
      otherTenant.id,
      randomSnowflake(),
      testId("other-tenant-bot"),
    );
    otherTenantBotId = otherBot.id;
    await reassignBotForGuild(client.db, otherTenant.id, otherTenantGuildId, otherTenantBotId);
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupTenant(client.db, otherTenant.id);
    await client.close();
  });

  it("resolves exactly the requested guild's assignment, never a sibling guild's under the same tenant", async () => {
    const resultOne = await resolveBotApplicationForGuild(client.db, tenant.id, guildOneId);
    const resultTwo = await resolveBotApplicationForGuild(client.db, tenant.id, guildTwoId);

    expect(resultOne?.botApplicationId).toBe(botOneId);
    expect(resultTwo?.botApplicationId).toBe(botTwoId);
    expect(resultOne?.botApplicationId).not.toBe(resultTwo?.botApplicationId);
  });

  it("a guessed, never-created guildId returns undefined, not an error or someone else's data", async () => {
    const guessed = randomSnowflake();
    const result = await resolveBotApplicationForGuild(client.db, tenant.id, guessed);
    expect(result).toBeUndefined();
  });

  it("guessing a real guildId that belongs to a different tenant does not leak its BotApplication", async () => {
    const result = await resolveBotApplicationForGuild(client.db, tenant.id, otherTenantGuildId);
    expect(result).toBeUndefined();
  });
});
