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
  provisionWorker,
  type DatabaseClient,
} from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { randomBytes } from "node:crypto";
import { createApp } from "../../src/app.js";
import type { WorkerTokenSigningKeys } from "../../src/lib/worker-token.js";
import type { CredentialEncryptionKeys } from "../../src/lib/credential-crypto.js";
import { CredentialService } from "../../src/services/credential-service.js";
import { BotOnboardingService } from "../../src/services/bot-onboarding-service.js";
import { DiscordValidator } from "../../src/services/discord-validator.js";
import { FakeDiscordGuildProvider } from "../../src/discord/fake-discord-guild-provider.js";
import type { Auth } from "../../src/auth/index.js";

const SIGNING_KEYS: WorkerTokenSigningKeys = {
  current: "signing-key-onboarding-e2e-test-at-least-32-chars",
  currentVersion: 1,
};
const CREDENTIAL_KEYS: CredentialEncryptionKeys = {
  keyDomain: "bot_credential",
  current: randomBytes(32),
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
  console.warn(
    "[apps/api] onboarding-and-runtime-status integration test SKIPPED — no reachable database.",
  );
}

function testSnowflake(): bigint {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 999));
}

function testId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

function fakeAuth(betterAuthUserId: string): Auth {
  return {
    api: { getSession: async () => ({ user: { id: betterAuthUserId } }) },
  } as unknown as Auth;
}

/**
 * The full chain task §28 requires: authenticated user -> guild
 * authorization -> tenant creation -> membership -> BotApplication
 * creation -> encrypted credential storage -> worker eligibility ->
 * assignment -> runtime status retrieval. Real MySQL throughout; Discord
 * itself (guild authority + bot-token validation) is the deterministic
 * fake/injected boundary (task §29) — no live Discord accounts/tokens.
 */
describe.skipIf(!dbAvailable)("Gate 5C: onboarding -> worker claim -> runtime status (real MySQL)", () => {
  let dbClient: DatabaseClient;
  let userId: bigint;
  let betterAuthUserId: string;
  let provider: FakeDiscordGuildProvider;
  let app: ReturnType<typeof createApp>;
  let workerId: string;
  let workerToken: string;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    userId = testSnowflake();
    betterAuthUserId = `better-auth-${userId}`;
    await createUser(dbClient.db, userId, "Onboarding E2E User");
    await dbClient.pool.query(
      "INSERT INTO auth_users (id, email, email_verified, name) VALUES (?, ?, false, ?)",
      [betterAuthUserId, `discord-${userId}@users.creatorcore.internal`, "Onboarding E2E User"],
    );
    await dbClient.pool.query(
      "INSERT INTO auth_accounts (id, user_id, provider_id, account_id) VALUES (?, ?, 'discord', ?)",
      [`account-${betterAuthUserId}`, betterAuthUserId, userId.toString()],
    );

    provider = new FakeDiscordGuildProvider();
    const logger = createLogger({ service: "onboarding-e2e-test", write: (chunk) => console.log(chunk) });

    const discordApplicationId = testSnowflake();
    const mockValidator = new DiscordValidator({
      fetchFn: async () =>
        new Response(
          JSON.stringify({ id: discordApplicationId.toString(), username: "OnboardingTestBot" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const credentialService = new CredentialService({
      db: dbClient.db,
      keys: CREDENTIAL_KEYS,
      logger,
      validator: mockValidator,
    });
    const botOnboardingService = new BotOnboardingService({
      db: dbClient.db,
      keys: CREDENTIAL_KEYS,
      logger,
      validator: mockValidator,
    });

    app = createApp({
      logger,
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
      auth: fakeAuth(betterAuthUserId),
      discordGuildProvider: provider,
      webAppOrigin: WEB_APP_ORIGIN,
      botOnboardingService,
      credentialService,
    });

    workerId = testId("worker-onboarding-e2e");
    const provisioned = await provisionWorker(dbClient.db, workerId);
    const exchangeRes = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId, bootstrapSecret: provisioned.bootstrapSecret }),
    });
    workerToken = ((await exchangeRes.json()) as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await dbClient.pool.query(
      "DELETE FROM tenants WHERE id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = ?)",
      [userId],
    );
    await dbClient.pool.query("DELETE FROM auth_accounts WHERE user_id = ?", [betterAuthUserId]);
    await dbClient.pool.query("DELETE FROM auth_users WHERE id = ?", [betterAuthUserId]);
    await dbClient.pool.query("DELETE FROM users WHERE id = ?", [userId]);
    await dbClient.pool.query("DELETE FROM workers WHERE id = ?", [workerId]);
    await dbClient.close();
  });

  it("walks the whole chain: connect -> onboard -> claim -> report READY -> ONLINE", async () => {
    const guildId = testSnowflake();
    provider.setManageableGuilds(userId, [{ id: guildId, name: "Onboarding E2E Guild" }]);

    // 1. Connect the guild (creates tenant + guild + OWNER membership).
    const connectRes = await app.request(`/app/guilds/${guildId}/connect`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN },
    });
    expect(connectRes.status).toBe(200);
    const { tenantId } = (await connectRes.json()) as { tenantId: string };

    // 2. Before onboarding: NOT_CONFIGURED.
    const statusBefore = await app.request(`/app/tenants/${tenantId}/guilds/${guildId}/runtime-status`, {
      headers: { origin: WEB_APP_ORIGIN },
    });
    expect((await statusBefore.json())).toEqual({ status: "NOT_CONFIGURED", botApplicationId: null });

    // 3. Onboard the BotApplication + initial credential.
    const onboardRes = await app.request(`/app/tenants/${tenantId}/guilds/${guildId}/bot-application`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ token: "MTEyMjMzNDQ1NQ.OnboardE2E.Secret12345", name: "Onboarding E2E Bot" }),
    });
    expect(onboardRes.status).toBe(200);
    const onboardBody = (await onboardRes.json()) as { botApplicationId: string };
    const { botApplicationId } = onboardBody;
    expect(botApplicationId).toBeTruthy();

    // The submitted token must never appear anywhere in the response.
    expect(JSON.stringify(onboardBody)).not.toContain("Secret12345");

    // 4. Immediately after onboarding: credential exists, but no worker has
    //    claimed it yet -- UNASSIGNED (never ONLINE from a credential alone).
    const statusAfterOnboard = await app.request(
      `/app/tenants/${tenantId}/guilds/${guildId}/runtime-status`,
      { headers: { origin: WEB_APP_ORIGIN } },
    );
    expect((await statusAfterOnboard.json())).toEqual({ status: "UNASSIGNED", botApplicationId });

    // 5. The provisioned worker discovers and claims the assignment
    //    (eligibility was activated LAST inside the onboarding transaction).
    const eligibleRes = await app.request("/internal/worker-assignments/eligible", {
      headers: { authorization: `Bearer ${workerToken}` },
    });
    const { eligibleWork } = (await eligibleRes.json()) as { eligibleWork: { botApplicationId: string }[] };
    expect(eligibleWork.some((w) => w.botApplicationId === botApplicationId)).toBe(true);

    const claimRes = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(claimRes.status).toBe(200);

    // 6. Assignment is live but no runtime report yet -- ACTIVE_ASSIGNMENT,
    //    never ONLINE (Amendment 4's core distinction).
    const statusAfterClaim = await app.request(
      `/app/tenants/${tenantId}/guilds/${guildId}/runtime-status`,
      { headers: { origin: WEB_APP_ORIGIN } },
    );
    expect((await statusAfterClaim.json())).toEqual({ status: "ACTIVE_ASSIGNMENT", botApplicationId });

    // 7. The worker reports READY.
    const reportRes = await app.request(`/internal/bot-runtime-status/${botApplicationId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        state: "READY",
        connectedAt: new Date().toISOString(),
        discordBotUserId: "9999999999",
      }),
    });
    expect(reportRes.status).toBe(200);

    // 8. Now genuinely ONLINE.
    const statusOnline = await app.request(`/app/tenants/${tenantId}/guilds/${guildId}/runtime-status`, {
      headers: { origin: WEB_APP_ORIGIN },
    });
    expect((await statusOnline.json())).toEqual({ status: "ONLINE", botApplicationId });

    // 9. A DIFFERENT worker cannot report status for this BotApplication
    //    (not the current lease-holder).
    const otherWorkerId = testId("worker-onboarding-e2e-other");
    const otherProvisioned = await provisionWorker(dbClient.db, otherWorkerId);
    const otherExchange = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: otherWorkerId, bootstrapSecret: otherProvisioned.bootstrapSecret }),
    });
    const otherToken = ((await otherExchange.json()) as { accessToken: string }).accessToken;
    const forgedReport = await app.request(`/internal/bot-runtime-status/${botApplicationId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${otherToken}`, "content-type": "application/json" },
      body: JSON.stringify({ state: "READY" }),
    });
    expect(forgedReport.status).toBe(403);
    await dbClient.pool.query("DELETE FROM workers WHERE id = ?", [otherWorkerId]);

    // 10. Rotation, reusing the existing Phase 4 rotation path.
    const rotateRes = await app.request(
      `/app/tenants/${tenantId}/bot-applications/${botApplicationId}/credential/rotate`,
      {
        method: "POST",
        headers: { origin: WEB_APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ token: "MTEyMjMzNDQ1NQ.RotatedE2E.SecretABCDE" }),
      },
    );
    expect(rotateRes.status).toBe(200);
    expect(await rotateRes.json()).toEqual({ status: "rotation_requested" });
  });

  it("rejects onboarding the same Discord bot to a second tenant, leaving zero orphaned rows", async () => {
    const sharedDiscordApplicationId = testSnowflake();
    const sharedValidator = new DiscordValidator({
      fetchFn: async () =>
        new Response(
          JSON.stringify({ id: sharedDiscordApplicationId.toString(), username: "SharedBot" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    const logger = createLogger({ service: "onboarding-e2e-dup-test", write: (chunk) => console.log(chunk) });
    const sharedOnboardingService = new BotOnboardingService({
      db: dbClient.db,
      keys: CREDENTIAL_KEYS,
      logger,
      validator: sharedValidator,
    });
    const sharedApp = createApp({
      logger,
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
      auth: fakeAuth(betterAuthUserId),
      discordGuildProvider: provider,
      webAppOrigin: WEB_APP_ORIGIN,
      botOnboardingService: sharedOnboardingService,
      credentialService: new CredentialService({ db: dbClient.db, keys: CREDENTIAL_KEYS, logger }),
    });

    const guildA = testSnowflake();
    const guildB = testSnowflake();
    provider.setManageableGuilds(userId, [
      { id: guildA, name: "Dup Guild A" },
      { id: guildB, name: "Dup Guild B" },
    ]);

    const connectA = await sharedApp.request(`/app/guilds/${guildA}/connect`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN },
    });
    const { tenantId: tenantA } = (await connectA.json()) as { tenantId: string };
    const connectB = await sharedApp.request(`/app/guilds/${guildB}/connect`, {
      method: "POST",
      headers: { origin: WEB_APP_ORIGIN },
    });
    const { tenantId: tenantB } = (await connectB.json()) as { tenantId: string };

    const firstOnboard = await sharedApp.request(
      `/app/tenants/${tenantA}/guilds/${guildA}/bot-application`,
      {
        method: "POST",
        headers: { origin: WEB_APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ token: "MTEyMjMzNDQ1NQ.FirstDup.SecretAAAAA", name: "Dup Bot" }),
      },
    );
    expect(firstOnboard.status).toBe(200);

    const secondOnboard = await sharedApp.request(
      `/app/tenants/${tenantB}/guilds/${guildB}/bot-application`,
      {
        method: "POST",
        headers: { origin: WEB_APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ token: "MTEyMjMzNDQ1NQ.SecondDup.SecretBBBBB", name: "Dup Bot Again" }),
      },
    );
    expect(secondOnboard.status).toBe(409);
    expect(await secondOnboard.json()).toEqual({ error: "BOT_ALREADY_REGISTERED" });

    const [rows] = await dbClient.pool.query(
      "SELECT id FROM bot_applications WHERE tenant_id = ?",
      [tenantB],
    );
    expect((rows as unknown[]).length).toBe(0);
  });
});
