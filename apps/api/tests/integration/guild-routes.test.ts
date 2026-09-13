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
  createDatabaseClient,
  createUser,
  type DatabaseClient,
} from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { createApp } from "../../src/app.js";
import type { WorkerTokenSigningKeys } from "../../src/lib/worker-token.js";
import { FakeDiscordGuildProvider } from "../../src/discord/fake-discord-guild-provider.js";
import type { Auth } from "../../src/auth/index.js";

const SIGNING_KEYS: WorkerTokenSigningKeys = {
  current: "signing-key-guild-routes-test-at-least-32-chars",
  currentVersion: 1,
};

const WEB_APP_ORIGIN = "https://app.creatorcore.test";

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
  console.warn("[apps/api] guild-routes integration test SKIPPED — no reachable database.");
}

function testSnowflake(): bigint {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 999));
}

function fakeAuth(betterAuthUserId: string): Auth {
  return {
    api: {
      getSession: async () => ({ user: { id: betterAuthUserId } }),
    },
  } as unknown as Auth;
}

/**
 * End-to-end proof that the whole `/app/guilds` chain — origin-check ->
 * session resolution -> live Discord reverification -> transactional
 * connect — is actually wired together in `createApp()`, not just correct
 * in isolation (each piece already has its own focused tests above this
 * one in the suite).
 */
describe.skipIf(!dbAvailable)("POST /app/guilds/:discordGuildId/connect (real MySQL, full HTTP chain)", () => {
  let dbClient: DatabaseClient;
  let userId: bigint;
  let betterAuthUserId: string;
  let provider: FakeDiscordGuildProvider;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    userId = testSnowflake();
    betterAuthUserId = `better-auth-${userId}`;
    await createUser(dbClient.db, userId, "Guild Route Test User");
    await dbClient.pool.query(
      "INSERT INTO auth_users (id, email, email_verified, name) VALUES (?, ?, false, ?)",
      [betterAuthUserId, `discord-${userId}@users.creatorcore.internal`, "Guild Route Test User"],
    );
    await dbClient.pool.query(
      "INSERT INTO auth_accounts (id, user_id, provider_id, account_id) VALUES (?, ?, 'discord', ?)",
      [`account-${betterAuthUserId}`, betterAuthUserId, userId.toString()],
    );

    provider = new FakeDiscordGuildProvider();

    const logger = createLogger({ service: "guild-routes-test", write: (chunk) => console.log(chunk) });
    app = createApp({
      logger,
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
      auth: fakeAuth(betterAuthUserId),
      discordGuildProvider: provider,
      webAppOrigin: WEB_APP_ORIGIN,
    });
  });

  afterAll(async () => {
    await dbClient.pool.query(
      "DELETE FROM tenants WHERE id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = ?)",
      [userId],
    );
    await dbClient.pool.query("DELETE FROM auth_accounts WHERE user_id = ?", [betterAuthUserId]);
    await dbClient.pool.query("DELETE FROM auth_users WHERE id = ?", [betterAuthUserId]);
    await dbClient.pool.query("DELETE FROM users WHERE id = ?", [userId]);
    await dbClient.close();
  });

  it("rejects a state-changing request with no Origin header before touching auth/Discord/DB", async () => {
    const guildId = testSnowflake();
    const res = await app.request(`/app/guilds/${guildId}/connect`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "CSRF_ORIGIN_MISMATCH" });
    expect(provider.liveCallCount).toBe(0);
  });

  it("rejects when the user does not currently manage the guild on Discord", async () => {
    const guildId = testSnowflake();
    provider.setManageableGuilds(userId, []);

    const res = await app.request(`/app/guilds/${guildId}/connect`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "GUILD_ACCESS_DENIED" });
  });

  it("connects a guild end-to-end for an authorized, live-verified manager", async () => {
    const guildId = testSnowflake();
    provider.setManageableGuilds(userId, [{ id: guildId, name: "Route Test Guild" }]);

    const res = await app.request(`/app/guilds/${guildId}/connect`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: string; guildId: string; status: string };
    expect(body.status).toBe("created");
    expect(body.guildId).toBe(guildId.toString());

    // GET /app/guilds now shows it as connected.
    const listRes = await app.request("/app/guilds", { headers: { origin: WEB_APP_ORIGIN } });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { guilds: { id: string; connected: boolean }[] };
    const entry = listBody.guilds.find((g) => g.id === guildId.toString());
    expect(entry?.connected).toBe(true);
  });

  it("fails closed (503) when Discord is unreachable during the sensitive reverification", async () => {
    const guildId = testSnowflake();
    provider.setUnavailable(userId, true);

    const res = await app.request(`/app/guilds/${guildId}/connect`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "DISCORD_REVERIFICATION_FAILED" });

    provider.setUnavailable(userId, false);
  });
});
