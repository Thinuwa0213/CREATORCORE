import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  claimAssignment,
  createBotApplication,
  createTenant,
  findAssignment,
  isWorkerEligible,
  provisionWorker,
  releaseAssignment,
  renewAssignment,
  revokeWorker,
  type BotApplication,
  type DatabaseClient,
  type Tenant,
  type Worker,
} from "../../src/index.js";
import { cleanupTenant, cleanupWorker, createTestClient, probeDatabase, randomSnowflake, testId } from "./helpers.js";

/**
 * Phase 3 review finding H2: a revoked worker must not succeed at claim,
 * renew, reclaim, or release -- even while it still holds a
 * worker_eligibility row, and even for a BotApplication it previously,
 * legitimately owned. Revocation is checked live against current worker
 * status on every one of these operations, never inferred from eligibility
 * or past ownership (docs/adr/0011). This is the repository-level
 * complement to apps/api/tests/integration/worker-auth.test.ts's HTTP-level
 * "reuse a still-valid token after revocation" coverage.
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] worker-revocation integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("a revoked worker cannot claim, renew, reclaim, or release (real database)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let worker: Worker;
  let botApp: BotApplication;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("tenant-revocation"));
    const provisioned = await provisionWorker(client.db, testId("worker-revocation"));
    worker = provisioned.worker;
    botApp = await createBotApplication(client.db, tenant.id, randomSnowflake(), testId("bot-revocation"));

    // Establish legitimate prior ownership BEFORE revoking, so every check
    // below is exercised against a worker that genuinely once held this
    // assignment -- not merely one that was never eligible in the first place.
    const claimed = await claimAssignment(client.db, worker.id, botApp.id);
    if (!claimed.ok) {
      throw new Error(`setup failed: expected initial claim to succeed, got ${claimed.reason}`);
    }

    await revokeWorker(client.db, worker.id);
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupWorker(client.db, worker.id);
    await client.close();
  });

  it("setup sanity check: the worker is revoked but its eligibility row and prior ownership still exist", async () => {
    expect(await isWorkerEligible(client.db, worker.id, botApp.id)).toBe(true);
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.workerId).toBe(worker.id);
    expect(assignment?.status).toBe("ACTIVE");
  });

  it("a revoked worker cannot renew the lease it legitimately holds", async () => {
    const result = await renewAssignment(client.db, worker.id, botApp.id);
    expect(result.ok).toBe(false);

    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.status).toBe("ACTIVE");
    expect(assignment?.workerId).toBe(worker.id);
  });

  it("a revoked worker cannot release the assignment it legitimately holds", async () => {
    const result = await releaseAssignment(client.db, worker.id, botApp.id);
    expect(result.ok).toBe(false);

    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.status).toBe("ACTIVE");
    expect(assignment?.workerId).toBe(worker.id);
  });

  it("a revoked worker cannot claim a fresh BotApplication, despite an unrelated eligibility row existing for it elsewhere", async () => {
    const freshBotApp = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-revocation-fresh"),
    );
    const result = await claimAssignment(client.db, worker.id, freshBotApp.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("WORKER_NOT_ACTIVE");
    }
  });

  it("a revoked worker cannot reclaim its own now-stale lease once it expires", async () => {
    await client.db.execute(
      sql`update worker_assignments set lease_expires_at = date_sub(now(), interval 1 minute) where bot_application_id = ${botApp.id}`,
    );

    const result = await claimAssignment(client.db, worker.id, botApp.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("WORKER_NOT_ACTIVE");
    }

    // The stale assignment must still show the original (now-revoked) owner
    // -- the rejected reclaim attempt must not have altered it.
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.workerId).toBe(worker.id);
  });
});
