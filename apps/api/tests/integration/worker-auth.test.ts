import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "@creatorcore/config/database";
import {
  createBotApplication,
  createDatabaseClient,
  createTenant,
  findAssignment,
  provisionWorker,
  revokeWorker,
  checkDatabaseConnectivity,
  type DatabaseClient,
} from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { createApp } from "../../src/app.js";
import type { WorkerTokenSigningKeys } from "../../src/lib/worker-token.js";

/**
 * Mirrors worker-token.ts's private signing construction exactly (verified
 * against its source) so this suite can forge adversarial tokens signed
 * with SIGNING_KEYS.current below, without needing a testing seam exported
 * from the production token module. Used for the expired/wrong-issuer/
 * wrong-audience HTTP-level coverage required by docs/TESTING.md (Phase 3
 * review finding H1) and the audit-attribution coverage of finding M3.
 */
const TOKEN_CONTEXT_STRING = "creatorcore-worker-access-token-v1";

function forgeWorkerToken(payload: Record<string, unknown>, key: string): string {
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", key)
    .update(`${TOKEN_CONTEXT_STRING}.${payloadSegment}`)
    .digest("base64url");
  return `${payloadSegment}.${signature}`;
}

/**
 * Real MySQL end-to-end test of the worker bootstrap exchange and
 * WorkerAssignment claim/renew/release HTTP surface (docs/adr/0011,
 * docs/adr/0006). Skips visibly (not a faked pass) when no database is
 * reachable — same pattern as tests/integration/ready.test.ts.
 */
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
    "[apps/api] worker-auth integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

function testId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

const SIGNING_KEYS: WorkerTokenSigningKeys = {
  current: "apps-api-integration-test-signing-key-not-a-real-secret",
  currentVersion: 1,
};

describe.skipIf(!dbAvailable)("worker bootstrap exchange and assignment claim (real database)", () => {
  let dbClient: DatabaseClient;
  let app: ReturnType<typeof createApp>;
  let tenantId: string;
  let workerId: string;
  let bootstrapSecret: string;
  let revokedWorkerId: string;
  let botApplicationId: string;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    app = createApp({
      logger: createLogger({ service: "apps/api-integration-test", write: () => undefined }),
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
    });

    workerId = testId("worker-http");
    const provisioned = await provisionWorker(dbClient.db, workerId);
    bootstrapSecret = provisioned.bootstrapSecret;

    revokedWorkerId = testId("worker-http-revoked");
    await provisionWorker(dbClient.db, revokedWorkerId);
    await revokeWorker(dbClient.db, revokedWorkerId);

    const tenant = await createTenant(dbClient.db, testId("tenant-http"));
    tenantId = tenant.id;
    const botApp = await createBotApplication(
      dbClient.db,
      tenantId,
      BigInt(Date.now()) * 1000n + 1n,
      testId("bot-http"),
    );
    botApplicationId = botApp.id;
  });

  afterAll(async () => {
    // Test-only cleanup via the raw pool @creatorcore/db already exposes on
    // DatabaseClient (the same handle apps/api's own readiness check uses)
    // -- not a reach into packages/db's internal schema module, which
    // remains off-limits to code outside that package
    // (docs/DATABASE_RULES.md). Deleting the tenant cascades its guilds/
    // bot_applications/worker_eligibility/worker_assignments rows.
    await dbClient.pool.query("DELETE FROM tenants WHERE id = ?", [tenantId]);
    await dbClient.pool.query("DELETE FROM workers WHERE id IN (?, ?)", [workerId, revokedWorkerId]);
    await dbClient.close();
  });

  it("rejects an exchange for an unknown worker with a generic 401", async () => {
    const res = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId: testId("worker-nonexistent"), bootstrapSecret: "whatever" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects an exchange with the wrong bootstrap secret", async () => {
    const res = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId, bootstrapSecret: "wrong-secret" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects an exchange for a revoked worker even with no secret check needed to fail first", async () => {
    const res = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId: revokedWorkerId, bootstrapSecret: "irrelevant" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed exchange request body", async () => {
    const res = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId }),
    });
    expect(res.status).toBe(400);
  });

  let accessToken: string;

  it("issues a valid access token for a correct bootstrap secret", async () => {
    const res = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId, bootstrapSecret }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string };
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken.split(".")).toHaveLength(2);
    accessToken = body.accessToken;
  });

  it("rejects a claim attempt with no Authorization header", async () => {
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a claim attempt with a garbage token", async () => {
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired worker token, and attributes the failed-auth AuditEvent to its authenticated subject (Phase 3 review findings H1, M3)", async () => {
    const forgedSubject = testId("worker-forged-expired");
    const now = Math.floor(Date.now() / 1000);
    const expired = forgeWorkerToken(
      {
        v: 1,
        kv: SIGNING_KEYS.currentVersion,
        sub: forgedSubject,
        iss: "creatorcore-api",
        aud: "creatorcore-worker",
        iat: now - 2000,
        exp: now - 1100,
      },
      SIGNING_KEYS.current,
    );

    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);

    // The token's HMAC signature verified (it was signed with the real
    // key) even though it was rejected as expired -- so its subject is
    // cryptographically authentic and must be attributed in the audit
    // trail, not recorded as "unknown" (M3).
    const [rows] = await dbClient.pool.query(
      "SELECT target_id FROM audit_events WHERE actor_worker_id = ? AND action = 'worker.auth.failure'",
      [forgedSubject],
    );
    expect((rows as { target_id: string }[]).map((r) => r.target_id)).toContain(forgedSubject);
  });

  it("rejects a worker token with the wrong issuer", async () => {
    const now = Math.floor(Date.now() / 1000);
    const badIssuer = forgeWorkerToken(
      {
        v: 1,
        kv: SIGNING_KEYS.currentVersion,
        sub: testId("worker-forged-issuer"),
        iss: "not-creatorcore-api",
        aud: "creatorcore-worker",
        iat: now,
        exp: now + 900,
      },
      SIGNING_KEYS.current,
    );
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${badIssuer}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a worker token with the wrong audience", async () => {
    const now = Math.floor(Date.now() / 1000);
    const badAudience = forgeWorkerToken(
      {
        v: 1,
        kv: SIGNING_KEYS.currentVersion,
        sub: testId("worker-forged-audience"),
        iss: "creatorcore-api",
        aud: "not-creatorcore-worker",
        iat: now,
        exp: now + 900,
      },
      SIGNING_KEYS.current,
    );
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${badAudience}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed botApplicationId on claim with a safe 400 (Phase 3 review finding M7)", async () => {
    const res = await app.request(`/internal/worker-assignments/not-a-uuid/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed botApplicationId on renew with a safe 400", async () => {
    const res = await app.request(`/internal/worker-assignments/not-a-uuid/renew`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed botApplicationId on release with a safe 400", async () => {
    const res = await app.request(`/internal/worker-assignments/not-a-uuid/release`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(400);
  });

  it("claims the BotApplication using the issued access token", async () => {
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workerId: string; botApplicationId: string };
    expect(body.workerId).toBe(workerId);
    expect(body.botApplicationId).toBe(botApplicationId);
  });

  it("renews the lease using the same access token", async () => {
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/renew`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("releases the assignment using the same access token", async () => {
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/release`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("recorded AuditEvents for the sensitive lifecycle actions above (success and failure)", async () => {
    const [result] = await dbClient.pool.query(
      "SELECT action, outcome, metadata FROM audit_events WHERE actor_worker_id = ?",
      [workerId],
    );
    const rows = result as { action: string; outcome: string; metadata: unknown }[];
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("worker.auth.success");
    expect(actions).toContain("assignment.claim");
    expect(actions).toContain("assignment.renew");
    expect(actions).toContain("assignment.release");

    // Phase 3 review finding M6: this test's title claims "success and
    // failure" coverage, but previously never asserted a failure row, even
    // though the "wrong bootstrap secret" test above already produced one
    // for this exact workerId.
    const failureRows = rows.filter((r) => r.action === "worker.auth.failure" && r.outcome === "DENIED");
    expect(failureRows.length).toBeGreaterThan(0);

    const metadataText = JSON.stringify(rows.map((r) => r.metadata));
    expect(metadataText).not.toContain(bootstrapSecret);
    expect(metadataText).not.toContain(accessToken);
  });
});

describe.skipIf(!dbAvailable)("live revocation of an already-issued token (real database, Phase 3 review finding H2)", () => {
  let dbClient: DatabaseClient;
  let app: ReturnType<typeof createApp>;
  let tenantId: string;
  let workerId: string;
  let botApplicationId: string;
  let accessToken: string;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    app = createApp({
      logger: createLogger({ service: "apps/api-integration-test", write: () => undefined }),
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
    });

    workerId = testId("worker-revoke-midflight");
    const provisioned = await provisionWorker(dbClient.db, workerId);

    const tenant = await createTenant(dbClient.db, testId("tenant-revoke-midflight"));
    tenantId = tenant.id;
    const botApp = await createBotApplication(
      dbClient.db,
      tenantId,
      BigInt(Date.now()) * 1000n + 2n,
      testId("bot-revoke-midflight"),
    );
    botApplicationId = botApp.id;

    const exchangeRes = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId, bootstrapSecret: provisioned.bootstrapSecret }),
    });
    expect(exchangeRes.status).toBe(200);
    const exchangeBody = (await exchangeRes.json()) as { accessToken: string };
    accessToken = exchangeBody.accessToken;
  });

  afterAll(async () => {
    await dbClient.pool.query("DELETE FROM tenants WHERE id = ?", [tenantId]);
    await dbClient.pool.query("DELETE FROM workers WHERE id = ?", [workerId]);
    await dbClient.close();
  });

  it("the freshly issued token is initially accepted for a claim", async () => {
    const res = await app.request(`/internal/worker-assignments/${botApplicationId}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("revoking the worker, then reusing the SAME still-unexpired token, is rejected on the very next authenticated request", async () => {
    await revokeWorker(dbClient.db, workerId);

    const renewRes = await app.request(`/internal/worker-assignments/${botApplicationId}/renew`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(renewRes.status).toBe(401);
  });

  it("the same reused token is also rejected for release after revocation", async () => {
    const releaseRes = await app.request(`/internal/worker-assignments/${botApplicationId}/release`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(releaseRes.status).toBe(401);
  });

  it("the assignment made before revocation is left untouched by the rejected post-revocation attempts", async () => {
    const assignment = await findAssignment(dbClient.db, botApplicationId);
    expect(assignment?.status).toBe("ACTIVE");
    expect(assignment?.workerId).toBe(workerId);
  });
});
