import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectGuildForUser, createUser, findTenantMembership, type DatabaseClient } from "../../src/index.js";
import { cleanupTenant, cleanupUser, createTestClient, probeDatabase, randomSnowflake, testId } from "./helpers.js";

/**
 * Amendment 5's global-uniqueness proof and the insert-first/catch-duplicate
 * guild-adoption flow (Phase 5, task §6/§11). Real MySQL only — the
 * concurrent-adoption race specifically needs InnoDB's own primary-key
 * uniqueness, not something a mock could stand in for.
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] guild-connection integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("connectGuildForUser (real MySQL)", () => {
  let client: DatabaseClient;
  let userA: bigint;
  let userB: bigint;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    client = createTestClient();
    userA = randomSnowflake();
    userB = randomSnowflake();
    await createUser(client.db, userA, "User A");
    await createUser(client.db, userB, "User B");
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(client.db, tenantId);
    }
    await cleanupUser(client.db, userA);
    await cleanupUser(client.db, userB);
    await client.close();
  });

  it("creates a new tenant, guild, and OWNER membership for a never-before-seen guild", async () => {
    const guildId = randomSnowflake();
    const result = await connectGuildForUser(client.db, userA, guildId, testId("guild-new"));
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;
    createdTenantIds.push(result.tenantId);

    const membership = await findTenantMembership(client.db, userA, result.tenantId);
    expect(membership?.role).toBe("owner");
  });

  it("is idempotent: the same user connecting the same already-owned guild again succeeds without duplicating anything", async () => {
    const guildId = randomSnowflake();
    const first = await connectGuildForUser(client.db, userA, guildId, testId("guild-idempotent"));
    expect(first.outcome).toBe("created");
    if (first.outcome !== "created") return;
    createdTenantIds.push(first.tenantId);

    const second = await connectGuildForUser(client.db, userA, guildId, testId("guild-idempotent"));
    expect(second).toEqual({ outcome: "already_connected", tenantId: first.tenantId });
  });

  it("denies (conflict) when a different user with no membership tries to connect an already-owned guild", async () => {
    const guildId = randomSnowflake();
    const first = await connectGuildForUser(client.db, userA, guildId, testId("guild-owned-by-a"));
    expect(first.outcome).toBe("created");
    if (first.outcome !== "created") return;
    createdTenantIds.push(first.tenantId);

    const attempt = await connectGuildForUser(client.db, userB, guildId, testId("guild-owned-by-a"));
    expect(attempt).toEqual({ outcome: "conflict" });

    // The guild must not have been silently transferred or duplicated.
    const membershipB = await findTenantMembership(client.db, userB, first.tenantId);
    expect(membershipB).toBeUndefined();
  });

  it("two concurrent connect attempts for the same never-before-seen guild produce exactly one tenant/guild, never two", async () => {
    const guildId = randomSnowflake();
    const guildName = testId("guild-concurrent");

    const [resultA, resultB] = await Promise.all([
      connectGuildForUser(client.db, userA, guildId, guildName),
      connectGuildForUser(client.db, userB, guildId, guildName),
    ]);

    // Exactly one of the two calls created the tenant; the other resolved
    // against it (either as a conflict, since userB has no membership in
    // userA's new tenant, or vice versa) -- never two independent tenants
    // both claiming the same Discord guild.
    const outcomes = [resultA.outcome, resultB.outcome].sort();
    expect(outcomes).toEqual(["conflict", "created"]);

    const created = resultA.outcome === "created" ? resultA : resultB;
    if (created.outcome === "created") {
      createdTenantIds.push(created.tenantId);
    }

    const [rows] = await client.pool.query("SELECT tenant_id FROM guilds WHERE id = ?", [guildId]);
    expect((rows as unknown[]).length).toBe(1);
  });
});
