import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
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
  createTenant,
  provisionWorker,
  type DatabaseClient,
} from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { createApp } from "../../src/app.js";
import type { WorkerTokenSigningKeys } from "../../src/lib/worker-token.js";
import { CredentialService } from "../../src/services/credential-service.js";
import { DiscordValidator } from "../../src/services/discord-validator.js";

const SIGNING_KEYS: WorkerTokenSigningKeys = {
  current: "signing-key-integration-test-at-least-32-chars-long",
  currentVersion: 1,
};

const ENCRYPTION_KEY_BYTES = randomBytes(32);

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
    "[apps/api] worker-credential-delivery integration test SKIPPED — no reachable database.",
  );
}

function testId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

describe.skipIf(!dbAvailable)("worker credential delivery and rotation lifecycle (real MySQL)", () => {
  let dbClient: DatabaseClient;
  let app: ReturnType<typeof createApp>;
  let credentialService: CredentialService;
  let tenantId: string;
  let botApplicationId: string;
  let workerA: string;
  let workerB: string;
  let tokenA: string;
  let tokenB: string;

  const INITIAL_TOKEN = "MTEyMjMzNDQ1NQ.InitialToken.Secret12345";
  const REPLACEMENT_TOKEN = "MTEyMjMzNDQ1NQ.ReplacementToken.Secret67890";
  let initialCredentialId: string;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    const logger = createLogger({ service: "api-cred-test", write: (chunk) => console.log(chunk) });

    const mockValidator = new DiscordValidator({
      fetchFn: async (url) => {
        if (String(url).includes("/users/@me")) {
          return new Response(JSON.stringify({ id: "1234567890", username: "TestBot" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 404 });
      },
    });

    credentialService = new CredentialService({
      db: dbClient.db,
      keys: {
        current: ENCRYPTION_KEY_BYTES,
        currentVersion: 1,
      },
      logger,
      validator: mockValidator,
    });

    app = createApp({
      logger,
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
      credentialService,
    });

    // Provision workers
    workerA = testId("worker-cred-a");
    workerB = testId("worker-cred-b");
    const pA = await provisionWorker(dbClient.db, workerA);
    const pB = await provisionWorker(dbClient.db, workerB);

    // Exchange tokens
    const exA = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: workerA, bootstrapSecret: pA.bootstrapSecret }),
    });
    tokenA = ((await exA.json()) as { accessToken: string }).accessToken;

    const exB = await app.request("/internal/workers/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: workerB, bootstrapSecret: pB.bootstrapSecret }),
    });
    tokenB = ((await exB.json()) as { accessToken: string }).accessToken;

    // Create tenant and bot application
    const tenant = await createTenant(dbClient.db, testId("tenant-cred"));
    tenantId = tenant.id;

    const botApp = await createBotApplication(
      dbClient.db,
      tenantId,
      BigInt(Date.now()) * 1000n + 99n,
      testId("bot-cred"),
    );
    botApplicationId = botApp.id;

    // Store initial active credential via service
    const stored = await credentialService.storeInitialCredential(botApplicationId, INITIAL_TOKEN);
    initialCredentialId = stored.credentialId;
  });

  afterAll(async () => {
    await dbClient.pool.query("DELETE FROM tenants WHERE id = ?", [tenantId]);
    await dbClient.pool.query("DELETE FROM workers WHERE id IN (?, ?)", [workerA, workerB]);
    await dbClient.close();
  });

  it("worker cannot access active credential before claiming the assignment (403)", async () => {
    const res = await app.request(
      `/internal/worker-assignments/${botApplicationId}/credentials/active`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("credential_access_denied");
  });

  it("worker retrieves decrypted active credential after claiming the assignment", async () => {
    // Worker A claims assignment
    const claimRes = await app.request(
      `/internal/worker-assignments/${botApplicationId}/claim`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(claimRes.status).toBe(200);

    // Worker A now gets the active credential
    const res = await app.request(
      `/internal/worker-assignments/${botApplicationId}/credentials/active`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const data = (await res.json()) as {
      botApplicationId: string;
      credentialId: string;
      token: string;
      status: string;
    };

    expect(data.botApplicationId).toBe(botApplicationId);
    expect(data.credentialId).toBe(initialCredentialId);
    expect(data.token).toBe(INITIAL_TOKEN);
    expect(data.status).toBe("ACTIVE");
  });

  it("worker B cannot retrieve active credential owned by worker A (403)", async () => {
    const res = await app.request(
      `/internal/worker-assignments/${botApplicationId}/credentials/active`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenB}` },
      },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "credential_access_denied" });
  });

  it("guessing an unowned or unknown botApplicationId returns 403 or 400", async () => {
    const unknownBot = randomUUID();
    const res = await app.request(
      `/internal/worker-assignments/${unknownBot}/credentials/active`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(res.status).toBe(403);

    const malformed = await app.request(
      `/internal/worker-assignments/not-a-uuid/credentials/active`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(malformed.status).toBe(400);
  });

  describe("Rotation lifecycle via HTTP control plane", () => {
    let pendingCredentialId: string;

    it("initiates rotation and worker retrieves pending credential by exact ID", async () => {
      const rotResult = await credentialService.requestCredentialRotation(
        botApplicationId,
        REPLACEMENT_TOKEN,
      );
      expect(rotResult.ok).toBe(true);
      if (!rotResult.ok) return;
      pendingCredentialId = rotResult.credentialId;

      // Access pending credential with exact ID
      const res = await app.request(
        `/internal/worker-assignments/${botApplicationId}/rotations/${pendingCredentialId}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${tokenA}` },
        },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");

      const data = (await res.json()) as {
        botApplicationId: string;
        credentialId: string;
        token: string;
        status: string;
      };
      expect(data.botApplicationId).toBe(botApplicationId);
      expect(data.credentialId).toBe(pendingCredentialId);
      expect(data.token).toBe(REPLACEMENT_TOKEN);
      expect(data.status).toBe("PENDING");
    });

    it("accessing pending credential with wrong ID or wrong worker is rejected (403)", async () => {
      // Wrong ID
      const wrongId = randomUUID();
      const resWrongId = await app.request(
        `/internal/worker-assignments/${botApplicationId}/rotations/${wrongId}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${tokenA}` },
        },
      );
      expect(resWrongId.status).toBe(403);

      // Wrong worker
      const resWrongWorker = await app.request(
        `/internal/worker-assignments/${botApplicationId}/rotations/${pendingCredentialId}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${tokenB}` },
        },
      );
      expect(resWrongWorker.status).toBe(403);
    });

    it("worker acknowledges rotation, promoting PENDING to ACTIVE and deleting old credential", async () => {
      const ackRes = await app.request(
        `/internal/worker-assignments/${botApplicationId}/rotations/${pendingCredentialId}/acknowledge`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${tokenA}` },
        },
      );
      expect(ackRes.status).toBe(200);
      expect(await ackRes.json()).toEqual({ ok: true });

      // GET /credentials/active now returns the replacement token
      const activeRes = await app.request(
        `/internal/worker-assignments/${botApplicationId}/credentials/active`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${tokenA}` },
        },
      );
      expect(activeRes.status).toBe(200);
      const activeData = (await activeRes.json()) as {
        botApplicationId: string;
        credentialId: string;
        token: string;
        status: string;
      };
      expect(activeData.credentialId).toBe(pendingCredentialId);
      expect(activeData.token).toBe(REPLACEMENT_TOKEN);
      expect(activeData.status).toBe("ACTIVE");

      // Verify old credential is deleted in MySQL
      const [oldRows] = await dbClient.pool.query(
        "SELECT id FROM bot_credentials WHERE id = ?",
        [initialCredentialId],
      );
      expect((oldRows as unknown[]).length).toBe(0);

      // Replay acknowledgement is idempotent
      const replayRes = await app.request(
        `/internal/worker-assignments/${botApplicationId}/rotations/${pendingCredentialId}/acknowledge`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${tokenA}` },
        },
      );
      expect(replayRes.status).toBe(200);
    });

    it("rejection of a pending rotation removes pending candidate and preserves active credential", async () => {
      const anotherToken = "MTEyMjMzNDQ1NQ.AnotherReplacement.Secret99999";
      const rot2 = await credentialService.requestCredentialRotation(
        botApplicationId,
        anotherToken,
      );
      expect(rot2.ok).toBe(true);
      if (!rot2.ok) return;

      const cred2Id = rot2.credentialId;

      // Reject rotation
      const rejectRes = await app.request(
        `/internal/worker-assignments/${botApplicationId}/rotations/${cred2Id}/reject`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${tokenA}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: "login_failed" }),
        },
      );
      expect(rejectRes.status).toBe(200);
      expect(await rejectRes.json()).toEqual({ ok: true });

      // Active credential is still the previously activated one (REPLACEMENT_TOKEN)
      const activeRes = await app.request(
        `/internal/worker-assignments/${botApplicationId}/credentials/active`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${tokenA}` },
        },
      );
      expect(activeRes.status).toBe(200);
      const activeData = (await activeRes.json()) as {
        credentialId: string;
        token: string;
      };
      expect(activeData.credentialId).toBe(pendingCredentialId);
      expect(activeData.token).toBe(REPLACEMENT_TOKEN);
    });
  });
});
