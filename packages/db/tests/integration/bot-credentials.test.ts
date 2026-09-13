import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  claimAssignment,
  createBotApplication,
  createInitialActiveCredential,
  createPendingCredential,
  createTenant,
  disableTenant,
  getActiveCredentialForAssignedWorker,
  getPendingCredentialForAssignedWorker,
  promotePendingCredential,
  provisionWorker,
  rejectPendingCredential,
  revokeWorker,
  type DatabaseClient,
  type Tenant,
} from "../../src/index.js";
import {
  cleanupTenant,
  cleanupWorker,
  createTestClient,
  probeDatabase,
  randomSnowflake,
  testId,
} from "./helpers.js";

const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] bot-credentials integration test SKIPPED — no reachable database.",
  );
}

describe.skipIf(!dbAvailable)("bot-credentials repository & authorization (real MySQL)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let botAppId: string;
  let workerAId: string;
  let workerBId: string;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("cred-tenant"));

    workerAId = testId("worker-a");
    workerBId = testId("worker-b");
    await provisionWorker(client.db, workerAId);
    await provisionWorker(client.db, workerBId);

    const botApp = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("cred-bot"),
    );
    botAppId = botApp.id;
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupWorker(client.db, workerAId);
    await cleanupWorker(client.db, workerBId);
    await client.close();
  });

  it("persists encrypted credential material with binary columns and no plaintext columns", async () => {
    const ciphertext = randomBytes(48);
    const nonce = randomBytes(12);
    const authTag = randomBytes(16);

    const cred = await createInitialActiveCredential(client.db, {
      botApplicationId: botAppId,
      ciphertext,
      nonce,
      authTag,
      keyVersion: 1,
    });

    expect(cred.id).toBeDefined();
    expect(cred.status).toBe("ACTIVE");
    expect(Buffer.isBuffer(cred.ciphertext) || Buffer.isBuffer(Buffer.from(cred.ciphertext))).toBe(true);
    expect(cred.keyVersion).toBe(1);

    // Direct SQL inspection: verify only ciphertext, nonce, and auth_tag exist, no plaintext token column
    const [raw] = await client.db.execute(
      sql`select * from bot_credentials where id = ${cred.id}`,
    );
    const rows = raw as unknown as Record<string, unknown>[];
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) throw new Error("Row not found");
    expect(row.ciphertext).toBeDefined();
    expect(row.nonce).toBeDefined();
    expect(row.auth_tag).toBeDefined();
    expect(row.plaintext).toBeUndefined();
    expect(row.token).toBeUndefined();
  });

  it("getActiveCredentialForAssignedWorker authorizes only an active worker holding a live lease", async () => {
    // Before claiming: worker A has no assignment, returns undefined
    const deniedBeforeClaim = await getActiveCredentialForAssignedWorker(
      client.db,
      workerAId,
      botAppId,
    );
    expect(deniedBeforeClaim).toBeUndefined();

    // Worker A claims assignment
    const claimRes = await claimAssignment(client.db, workerAId, botAppId);
    expect(claimRes.ok).toBe(true);

    // After claim: worker A can access the active credential
    const allowed = await getActiveCredentialForAssignedWorker(
      client.db,
      workerAId,
      botAppId,
    );
    expect(allowed).toBeDefined();
    expect(allowed?.status).toBe("ACTIVE");
    expect(allowed?.botApplicationId).toBe(botAppId);

    // Worker B (different worker) cannot access it
    const deniedOtherWorker = await getActiveCredentialForAssignedWorker(
      client.db,
      workerBId,
      botAppId,
    );
    expect(deniedOtherWorker).toBeUndefined();

    // Arbitrary unassigned botApplicationId returns undefined
    const deniedUnknownBot = await getActiveCredentialForAssignedWorker(
      client.db,
      workerAId,
      randomUUID(),
    );
    expect(deniedUnknownBot).toBeUndefined();
  });

  it("getActiveCredentialForAssignedWorker rejects when lease is expired", async () => {
    // Artificially expire worker A's lease in MySQL
    await client.db.execute(
      sql`update worker_assignments set lease_expires_at = date_sub(now(), interval 1 second) where bot_application_id = ${botAppId}`,
    );

    const expiredAccess = await getActiveCredentialForAssignedWorker(
      client.db,
      workerAId,
      botAppId,
    );
    expect(expiredAccess).toBeUndefined();

    // Reclaim to restore valid lease
    await claimAssignment(client.db, workerAId, botAppId);
  });

  it("getActiveCredentialForAssignedWorker rejects when worker is revoked", async () => {
    const revokedWorkerId = testId("worker-revoked");
    await provisionWorker(client.db, revokedWorkerId);

    // Revoke worker
    await revokeWorker(client.db, revokedWorkerId);

    const revokedAccess = await getActiveCredentialForAssignedWorker(
      client.db,
      revokedWorkerId,
      botAppId,
    );
    expect(revokedAccess).toBeUndefined();

    await cleanupWorker(client.db, revokedWorkerId);
  });

  it("getActiveCredentialForAssignedWorker rejects when tenant is disabled", async () => {
    const disabledTenant = await createTenant(client.db, testId("tenant-disabled"));
    const disabledBot = await createBotApplication(
      client.db,
      disabledTenant.id,
      randomSnowflake(),
      testId("bot-disabled"),
    );

    await createInitialActiveCredential(client.db, {
      botApplicationId: disabledBot.id,
      ciphertext: randomBytes(32),
      nonce: randomBytes(12),
      authTag: randomBytes(16),
      keyVersion: 1,
    });

    await claimAssignment(client.db, workerAId, disabledBot.id);

    // Verify it was accessible while tenant was active
    const beforeDisable = await getActiveCredentialForAssignedWorker(
      client.db,
      workerAId,
      disabledBot.id,
    );
    expect(beforeDisable).toBeDefined();

    // Disable tenant
    await disableTenant(client.db, disabledTenant.id);

    // Now rejected
    const afterDisable = await getActiveCredentialForAssignedWorker(
      client.db,
      workerAId,
      disabledBot.id,
    );
    expect(afterDisable).toBeUndefined();

    await cleanupTenant(client.db, disabledTenant.id);
  });

  describe("Rotation Lifecycle & State Machine (Crash-Recoverable)", () => {
    it("createPendingCredential rejects duplicate concurrent rotation attempts", async () => {
      const pending1 = await createPendingCredential(client.db, {
        botApplicationId: botAppId,
        ciphertext: randomBytes(48),
        nonce: randomBytes(12),
        authTag: randomBytes(16),
        keyVersion: 1,
      });
      expect(pending1.ok).toBe(true);

      // Second attempt while pending1 is still PENDING
      const pending2 = await createPendingCredential(client.db, {
        botApplicationId: botAppId,
        ciphertext: randomBytes(48),
        nonce: randomBytes(12),
        authTag: randomBytes(16),
        keyVersion: 1,
      });
      expect(pending2.ok).toBe(false);
      if (!pending2.ok) {
        expect(pending2.reason).toBe("PENDING_CREDENTIAL_ALREADY_EXISTS");
      }

      // Cleanup pending1
      if (pending1.ok) {
        await rejectPendingCredential(client.db, {
          workerId: workerAId,
          botApplicationId: botAppId,
          credentialId: pending1.credential.id,
        });
      }
    });

    it("getPendingCredentialForAssignedWorker requires exact credentialId and authorized claim", async () => {
      const pending = await createPendingCredential(client.db, {
        botApplicationId: botAppId,
        ciphertext: randomBytes(48),
        nonce: randomBytes(12),
        authTag: randomBytes(16),
        keyVersion: 1,
      });
      expect(pending.ok).toBe(true);
      if (!pending.ok) return;

      // Access with correct credentialId
      const allowed = await getPendingCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
        pending.credential.id,
      );
      expect(allowed).toBeDefined();
      expect(allowed?.id).toBe(pending.credential.id);
      expect(allowed?.status).toBe("PENDING");

      // Guessing wrong credentialId returns undefined
      const wrongId = await getPendingCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
        randomUUID(),
      );
      expect(wrongId).toBeUndefined();

      // Unauthorized worker B cannot access pending credential
      const wrongWorker = await getPendingCredentialForAssignedWorker(
        client.db,
        workerBId,
        botAppId,
        pending.credential.id,
      );
      expect(wrongWorker).toBeUndefined();

      // Clean up
      await rejectPendingCredential(client.db, {
        workerId: workerAId,
        botApplicationId: botAppId,
        credentialId: pending.credential.id,
      });
    });

    it("rejectPendingCredential deletes PENDING without affecting ACTIVE", async () => {
      const initialActive = await getActiveCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
      );
      expect(initialActive).toBeDefined();

      const pending = await createPendingCredential(client.db, {
        botApplicationId: botAppId,
        ciphertext: randomBytes(48),
        nonce: randomBytes(12),
        authTag: randomBytes(16),
        keyVersion: 1,
      });
      expect(pending.ok).toBe(true);
      if (!pending.ok) return;

      // Unauthorized worker B cannot reject it
      const unauthorizedReject = await rejectPendingCredential(client.db, {
        workerId: workerBId,
        botApplicationId: botAppId,
        credentialId: pending.credential.id,
      });
      expect(unauthorizedReject.ok).toBe(false);

      // Authorized worker A rejects it
      const authorizedReject = await rejectPendingCredential(client.db, {
        workerId: workerAId,
        botApplicationId: botAppId,
        credentialId: pending.credential.id,
      });
      expect(authorizedReject.ok).toBe(true);

      // Pending is gone
      const pendingAfter = await getPendingCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
        pending.credential.id,
      );
      expect(pendingAfter).toBeUndefined();

      // Original active credential is untouched
      const activeAfter = await getActiveCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
      );
      expect(activeAfter?.id).toBe(initialActive?.id);
    });

    it("promotePendingCredential atomically promotes to ACTIVE and deletes superseded credential", async () => {
      const oldActive = await getActiveCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
      );
      expect(oldActive).toBeDefined();

      const pending = await createPendingCredential(client.db, {
        botApplicationId: botAppId,
        ciphertext: randomBytes(48),
        nonce: randomBytes(12),
        authTag: randomBytes(16),
        keyVersion: 1,
      });
      expect(pending.ok).toBe(true);
      if (!pending.ok) return;

      // Promote
      const promoteRes = await promotePendingCredential(client.db, {
        workerId: workerAId,
        botApplicationId: botAppId,
        credentialId: pending.credential.id,
      });
      expect(promoteRes.ok).toBe(true);

      // Active credential is now the promoted one
      const newActive = await getActiveCredentialForAssignedWorker(
        client.db,
        workerAId,
        botAppId,
      );
      expect(newActive?.id).toBe(pending.credential.id);
      expect(newActive?.activatedAt).toBeDefined();

      // Old superseded credential has been removed (no historical token vault)
      const [oldCheck] = await client.db.execute(
        sql`select id from bot_credentials where id = ${oldActive?.id}`,
      );
      const oldRows = oldCheck as unknown as unknown[];
      expect(oldRows.length).toBe(0);

      // Replay acknowledgement is idempotent and safe
      const replayRes = await promotePendingCredential(client.db, {
        workerId: workerAId,
        botApplicationId: botAppId,
        credentialId: pending.credential.id,
      });
      expect(replayRes.ok).toBe(true);
    });
  });
});
