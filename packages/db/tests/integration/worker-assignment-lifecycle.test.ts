import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
  claimAssignment,
  createBotApplication,
  createTenant,
  findAssignment,
  provisionWorker,
  releaseAssignment,
  renewAssignment,
  type BotApplication,
  type DatabaseClient,
  type Tenant,
  type Worker,
} from "../../src/index.js";
import { cleanupTenant, cleanupWorker, createTestClient, probeDatabase, randomSnowflake, testId } from "./helpers.js";

/**
 * WorkerAssignment claim/lease/heartbeat/release lifecycle (docs/adr/0006):
 * exclusive ownership, lease expiration, stale-worker recovery, and
 * prevention of simultaneous active ownership, proven against a real MySQL
 * database (never mocked — the whole point is the database participating
 * in enforcing ownership correctness).
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] worker-assignment-lifecycle integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("WorkerAssignment claim/lease/release lifecycle (real database)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let workerA: Worker;
  let workerB: Worker;
  let botApp: BotApplication;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("tenant-lifecycle"));

    // Both created before any BotApplication in this suite -> both are
    // real candidates for the (up to 2) least-loaded-active-workers
    // eligibility selection on every BotApplication created below.
    workerA = (await provisionWorker(client.db, testId("worker-a"))).worker;
    workerB = (await provisionWorker(client.db, testId("worker-b"))).worker;

    botApp = await createBotApplication(client.db, tenant.id, randomSnowflake(), testId("bot-lifecycle"));
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupWorker(client.db, workerA.id);
    await cleanupWorker(client.db, workerB.id);
    await client.close();
  });

  it("a worker without any assignment cannot renew or release a BotApplication it never claimed", async () => {
    const renewResult = await renewAssignment(client.db, workerA.id, botApp.id);
    expect(renewResult.ok).toBe(false);

    const releaseResult = await releaseAssignment(client.db, workerA.id, botApp.id);
    expect(releaseResult.ok).toBe(false);

    expect(await findAssignment(client.db, botApp.id)).toBeUndefined();
  });

  it("Worker A can claim an unowned BotApplication", async () => {
    const result = await claimAssignment(client.db, workerA.id, botApp.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignment.workerId).toBe(workerA.id);
      expect(result.assignment.status).toBe("ACTIVE");
    }
  });

  it("Worker B cannot claim it while Worker A's lease is valid", async () => {
    const result = await claimAssignment(client.db, workerB.id, botApp.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("LEASE_HELD_BY_OTHER");
    }
  });

  it("Worker A can renew its own lease", async () => {
    const before = await findAssignment(client.db, botApp.id);
    expect(before).toBeDefined();
    const result = await renewAssignment(client.db, workerA.id, botApp.id);
    expect(result.ok).toBe(true);
    const after = await findAssignment(client.db, botApp.id);
    expect(after).toBeDefined();
    expect(after?.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(before?.leaseExpiresAt.getTime() ?? 0);
  });

  it("Worker B cannot renew Worker A's lease", async () => {
    const result = await renewAssignment(client.db, workerB.id, botApp.id);
    expect(result.ok).toBe(false);
  });

  it("release works only for the current owner — Worker B cannot release Worker A's live assignment", async () => {
    const result = await releaseAssignment(client.db, workerB.id, botApp.id);
    expect(result.ok).toBe(false);
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.workerId).toBe(workerA.id);
    expect(assignment?.status).toBe("ACTIVE");
  });

  it("a stale (expired) lease becomes reclaimable by another eligible worker", async () => {
    await client.db.execute(
      sql`update worker_assignments set lease_expires_at = date_sub(now(), interval 1 minute) where bot_application_id = ${botApp.id}`,
    );

    const result = await claimAssignment(client.db, workerB.id, botApp.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignment.workerId).toBe(workerB.id);
      expect(result.assignment.status).toBe("ACTIVE");
    }
  });

  it("after reclaim, the former owner (Worker A) can no longer release it", async () => {
    const result = await releaseAssignment(client.db, workerA.id, botApp.id);
    expect(result.ok).toBe(false);
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.workerId).toBe(workerB.id);
  });

  it("the current owner (Worker B) can release it", async () => {
    const result = await releaseAssignment(client.db, workerB.id, botApp.id);
    expect(result.ok).toBe(true);
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.status).toBe("RELEASED");
  });

  it("after release, either eligible worker can claim it fresh", async () => {
    const result = await claimAssignment(client.db, workerA.id, botApp.id);
    expect(result.ok).toBe(true);
  });
});

describe.skipIf(!dbAvailable)("duplicate active claim is prevented under real concurrency (real database)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let workerA: Worker;
  let workerB: Worker;
  let botApp: BotApplication;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("tenant-concurrency"));
    workerA = (await provisionWorker(client.db, testId("worker-concurrent-a"))).worker;
    workerB = (await provisionWorker(client.db, testId("worker-concurrent-b"))).worker;
    botApp = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-concurrency"),
    );
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupWorker(client.db, workerA.id);
    await cleanupWorker(client.db, workerB.id);
    await client.close();
  });

  it("exactly one of two simultaneous claim attempts for the same never-claimed BotApplication succeeds", async () => {
    const [resultA, resultB] = await Promise.all([
      claimAssignment(client.db, workerA.id, botApp.id),
      claimAssignment(client.db, workerB.id, botApp.id),
    ]);

    const outcomes = [resultA, resultB];
    const successes = outcomes.filter((r) => r.ok);
    const failures = outcomes.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.ok).toBe(false);
    if (!failures[0]?.ok) {
      expect(failures[0]?.reason).toBe("LEASE_HELD_BY_OTHER");
    }

    // The database itself holds exactly one row for this BotApplication —
    // structurally, not just by convention (worker_assignments' PK is
    // botApplicationId itself).
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment).toBeDefined();
    const winner = successes[0];
    expect(winner?.ok && winner.assignment.workerId).toBe(assignment?.workerId);
  });

  it("exactly one of two simultaneous reclaim attempts for an already-existing RELEASED assignment succeeds (Phase 3 review finding M5 — the SELECT ... FOR UPDATE path, not the first-claim INSERT race above)", async () => {
    const releasedBotApp = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-concurrency-released"),
    );

    // Establish a pre-existing row via the real claim + release path (the
    // "supported DB path", not a raw-SQL fixture) so the race below hits
    // claimAssignment's transactional SELECT ... FOR UPDATE branch, which
    // only runs when a row already exists for this BotApplication.
    const initialClaim = await claimAssignment(client.db, workerA.id, releasedBotApp.id);
    expect(initialClaim.ok).toBe(true);
    const released = await releaseAssignment(client.db, workerA.id, releasedBotApp.id);
    expect(released.ok).toBe(true);

    const [resultA, resultB] = await Promise.all([
      claimAssignment(client.db, workerA.id, releasedBotApp.id),
      claimAssignment(client.db, workerB.id, releasedBotApp.id),
    ]);

    const outcomes = [resultA, resultB];
    const successes = outcomes.filter((r) => r.ok);
    const failures = outcomes.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const assignment = await findAssignment(client.db, releasedBotApp.id);
    expect(assignment?.status).toBe("ACTIVE");
    const winner = successes[0];
    expect(winner?.ok && winner.assignment.workerId).toBe(assignment?.workerId);
  });
});

describe.skipIf(!dbAvailable)("lease liveness is judged by the database's clock, not the caller's (real database, Phase 3 review finding M2)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let workerA: Worker;
  let workerB: Worker;
  let botApp: BotApplication;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("tenant-clock-skew"));
    workerA = (await provisionWorker(client.db, testId("worker-clock-skew-a"))).worker;
    workerB = (await provisionWorker(client.db, testId("worker-clock-skew-b"))).worker;
    botApp = await createBotApplication(client.db, tenant.id, randomSnowflake(), testId("bot-clock-skew"));
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupWorker(client.db, workerA.id);
    await cleanupWorker(client.db, workerB.id);
    await client.close();
  });

  it("a freshly claimed, genuinely live lease cannot be reclaimed by another worker even when this process's own clock is skewed far into the future", async () => {
    const claimed = await claimAssignment(client.db, workerA.id, botApp.id);
    expect(claimed.ok).toBe(true);

    // Skew only this test process's Date -- never a real timer used by the
    // mysql2 driver's own I/O -- far enough forward that, under the old
    // `new Date()`-based liveness check this finding replaces, the
    // still-fresh lease claimed above would have incorrectly appeared
    // expired. The database's own clock is authoritative and is completely
    // unaffected by this process's skewed Date.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    try {
      const result = await claimAssignment(client.db, workerB.id, botApp.id);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("LEASE_HELD_BY_OTHER");
      }
    } finally {
      vi.useRealTimers();
    }

    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.workerId).toBe(workerA.id);
  });

  it("renewAssignment also judges liveness by the database's clock, not this process's skewed clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    try {
      const result = await renewAssignment(client.db, workerA.id, botApp.id);
      expect(result.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
