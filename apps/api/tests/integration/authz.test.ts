import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "@creatorcore/config/database";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(fileURLToPath(import.meta.url), "../../../../../.env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}
import {
  checkDatabaseConnectivity,
  createBotApplication,
  createDatabaseClient,
  createGuild,
  createTenant,
  createTenantMembership,
  createUser,
  disableTenant,
  type DatabaseClient,
} from "@creatorcore/db";
import {
  requireBotApplicationAccess,
  requireCurrentDiscordGuildManager,
  requireGuildAccess,
  requireTenantMembership,
} from "../../src/authz/index.js";
import { FakeDiscordGuildProvider } from "../../src/discord/fake-discord-guild-provider.js";

async function probeDatabase(): Promise<boolean> {
  try {
    const client = createDatabaseClient(loadDatabaseConfig());
    const ok = await checkDatabaseConnectivity(client.pool);
    await client.close();
    return ok;
  } catch {
    return false;
  }
}

const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn("[apps/api] authz integration test SKIPPED — no reachable database.");
}

function testId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

function testSnowflake(): bigint {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 999));
}

describe.skipIf(!dbAvailable)("apps/api/src/authz (real MySQL, IDOR suite)", () => {
  let dbClient: DatabaseClient;

  // Tenant A: member user + guild + bot application.
  let tenantAId: string;
  let memberUserId: bigint;
  let outsiderUserId: bigint;
  let guildAId: bigint;
  let botApplicationAId: string;

  // Tenant B: wholly unrelated, used only to prove cross-tenant denial.
  let tenantBId: string;
  let guildBId: bigint;
  let botApplicationBId: string;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());

    memberUserId = testSnowflake();
    outsiderUserId = testSnowflake();
    await createUser(dbClient.db, memberUserId, "Member");
    await createUser(dbClient.db, outsiderUserId, "Outsider");

    const tenantA = await createTenant(dbClient.db, testId("tenant-authz-a"));
    tenantAId = tenantA.id;
    await createTenantMembership(dbClient.db, tenantAId, memberUserId, "owner");

    guildAId = testSnowflake();
    await createGuild(dbClient.db, tenantAId, guildAId, testId("guild-a"));

    const botAppA = await createBotApplication(
      dbClient.db,
      tenantAId,
      testSnowflake(),
      testId("bot-a"),
    );
    botApplicationAId = botAppA.id;

    const tenantB = await createTenant(dbClient.db, testId("tenant-authz-b"));
    tenantBId = tenantB.id;

    guildBId = testSnowflake();
    await createGuild(dbClient.db, tenantBId, guildBId, testId("guild-b"));

    const botAppB = await createBotApplication(
      dbClient.db,
      tenantBId,
      testSnowflake(),
      testId("bot-b"),
    );
    botApplicationBId = botAppB.id;
  });

  afterAll(async () => {
    await dbClient.pool.query("DELETE FROM tenants WHERE id IN (?, ?)", [tenantAId, tenantBId]);
    await dbClient.pool.query("DELETE FROM users WHERE id IN (?, ?)", [
      memberUserId,
      outsiderUserId,
    ]);
    await dbClient.close();
  });

  describe("requireTenantMembership", () => {
    it("allows a real member", async () => {
      const membership = await requireTenantMembership(dbClient.db, memberUserId, tenantAId);
      expect(membership.tenantId).toBe(tenantAId);
    });

    it("denies a user with no membership row", async () => {
      await expect(
        requireTenantMembership(dbClient.db, outsiderUserId, tenantAId),
      ).rejects.toMatchObject({ code: "TENANT_MEMBERSHIP_REQUIRED" });
    });

    it("denies membership in a disabled tenant, without distinguishing the reason", async () => {
      const disabledTenant = await createTenant(dbClient.db, testId("tenant-disabled"));
      await createTenantMembership(dbClient.db, disabledTenant.id, memberUserId, "owner");
      await disableTenant(dbClient.db, disabledTenant.id);

      await expect(
        requireTenantMembership(dbClient.db, memberUserId, disabledTenant.id),
      ).rejects.toMatchObject({ code: "TENANT_MEMBERSHIP_REQUIRED" });

      await dbClient.pool.query("DELETE FROM tenants WHERE id = ?", [disabledTenant.id]);
    });
  });

  describe("requireGuildAccess (IDOR)", () => {
    it("allows access to a guild that belongs to the caller's tenant", async () => {
      const guild = await requireGuildAccess(dbClient.db, memberUserId, tenantAId, guildAId);
      expect(guild.id).toBe(guildAId);
    });

    it("denies cross-tenant access: member of tenant A cannot reach tenant B's guild via a forged tenantId", async () => {
      // The caller supplies tenantBId (as if forged in a request body) but
      // is only ever a member of tenant A -- must be denied at the
      // membership check, before the guild lookup even runs.
      await expect(
        requireGuildAccess(dbClient.db, memberUserId, tenantBId, guildBId),
      ).rejects.toMatchObject({ code: "TENANT_MEMBERSHIP_REQUIRED" });
    });

    it("denies access when the guildId does not belong to the authorized tenant, even with real membership", async () => {
      // memberUserId legitimately belongs to tenant A, but guildB belongs
      // to tenant B -- the tenant+guild pairing itself must be checked, not
      // just "is this guildId real" or "is this user a member of some tenant".
      await expect(
        requireGuildAccess(dbClient.db, memberUserId, tenantAId, guildBId),
      ).rejects.toMatchObject({ code: "GUILD_ACCESS_DENIED" });
    });

    it("denies a non-member outright", async () => {
      await expect(
        requireGuildAccess(dbClient.db, outsiderUserId, tenantAId, guildAId),
      ).rejects.toMatchObject({ code: "TENANT_MEMBERSHIP_REQUIRED" });
    });
  });

  describe("requireBotApplicationAccess (IDOR)", () => {
    it("allows access to a BotApplication that belongs to the caller's tenant", async () => {
      const botApplication = await requireBotApplicationAccess(
        dbClient.db,
        memberUserId,
        tenantAId,
        botApplicationAId,
      );
      expect(botApplication.id).toBe(botApplicationAId);
    });

    it("denies cross-tenant BotApplication access even with a real, valid botApplicationId", async () => {
      await expect(
        requireBotApplicationAccess(dbClient.db, memberUserId, tenantAId, botApplicationBId),
      ).rejects.toMatchObject({ code: "BOT_APPLICATION_NOT_FOUND" });
    });

    it("a forged tenantId is rejected before the BotApplication lookup runs", async () => {
      await expect(
        requireBotApplicationAccess(dbClient.db, memberUserId, tenantBId, botApplicationAId),
      ).rejects.toMatchObject({ code: "TENANT_MEMBERSHIP_REQUIRED" });
    });
  });

  describe("requireCurrentDiscordGuildManager (always live, fail closed)", () => {
    it("allows when the fake provider reports current guild-management authority", async () => {
      const provider = new FakeDiscordGuildProvider();
      provider.setManageableGuilds(memberUserId, [{ id: guildAId, name: "guild-a" }]);

      await expect(
        requireCurrentDiscordGuildManager(provider, memberUserId, guildAId),
      ).resolves.toBeUndefined();
    });

    it("denies when the user no longer manages the guild on Discord's side (revocation)", async () => {
      const provider = new FakeDiscordGuildProvider();
      provider.setManageableGuilds(memberUserId, []); // no guilds -- permission revoked

      await expect(
        requireCurrentDiscordGuildManager(provider, memberUserId, guildAId),
      ).rejects.toMatchObject({ code: "GUILD_ACCESS_DENIED" });
    });

    it("a cached/stale grant from listManageableGuilds cannot substitute for a live reverification", async () => {
      const provider = new FakeDiscordGuildProvider();
      provider.setManageableGuilds(memberUserId, [{ id: guildAId, name: "guild-a" }]);
      // Simulate the cached read-only listing having already been served...
      const cachedList = await provider.listManageableGuilds(memberUserId);
      expect(cachedList).toHaveLength(1);
      // ...then Discord-side authority is revoked before the sensitive
      // action's OWN live check runs.
      provider.setManageableGuilds(memberUserId, []);

      await expect(
        requireCurrentDiscordGuildManager(provider, memberUserId, guildAId),
      ).rejects.toMatchObject({ code: "GUILD_ACCESS_DENIED" });
    });

    it("fails closed when Discord is unreachable, never falling back to a cached/prior decision", async () => {
      const provider = new FakeDiscordGuildProvider();
      provider.setManageableGuilds(memberUserId, [{ id: guildAId, name: "guild-a" }]);
      provider.setUnavailable(memberUserId, true);

      await expect(
        requireCurrentDiscordGuildManager(provider, memberUserId, guildAId),
      ).rejects.toMatchObject({ code: "DISCORD_REVERIFICATION_FAILED" });
    });
  });
});
