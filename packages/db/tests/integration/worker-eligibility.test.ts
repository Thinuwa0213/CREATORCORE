import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  claimAssignment,
  createBotApplication,
  createTenant,
  findAssignment,
  isWorkerEligible,
  provisionWorker,
  revokeWorker,
  type BotApplication,
  type DatabaseClient,
  type Tenant,
  type Worker,
} from "../../src/index.js";
import { cleanupTenant, cleanupWorker, createTestClient, probeDatabase, randomSnowflake, testId } from "./helpers.js";

/**
 * The Amendment #1 mechanism: a valid worker access token proves identity
 * only. claimAssignment additionally requires a worker_eligibility row,
 * populated only by apps/api's own control-plane logic (assignEligibleWorkers,
 * invoked inside createBotApplication) -- never writable by a worker
 * request. Fixtures are ordered so eligibility is deterministic regardless
 * of what else exists in the shared `workers` table: a worker created
 * BEFORE a BotApplication is a real candidate for its (up to 2)
 * least-loaded-active-workers selection; a worker created AFTER is
 * structurally guaranteed to have no eligibility row for it, since
 * selection already happened.
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] worker-eligibility integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("worker claim authorization requires eligibility, not just identity (real database)", () => {
  let client: DatabaseClient;
  let tenant: Tenant;
  let botApp: BotApplication;
  let eligibleWorker: Worker;
  let ineligibleWorker: Worker;

  beforeAll(async () => {
    client = createTestClient();
    tenant = await createTenant(client.db, testId("tenant-eligibility"));

    // Created BEFORE the BotApplication -> a real candidate for selection.
    const provisioned = await provisionWorker(client.db, testId("worker-eligible"));
    eligibleWorker = provisioned.worker;

    botApp = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-eligibility"),
    );

    // Created AFTER -> structurally cannot have been selected.
    const provisionedIneligible = await provisionWorker(client.db, testId("worker-ineligible"));
    ineligibleWorker = provisionedIneligible.worker;
  });

  afterAll(async () => {
    await cleanupTenant(client.db, tenant.id);
    await cleanupWorker(client.db, eligibleWorker.id);
    await cleanupWorker(client.db, ineligibleWorker.id);
    await client.close();
  });

  it("setup sanity check: the pre-existing worker was actually granted eligibility", async () => {
    const eligible = await isWorkerEligible(client.db, eligibleWorker.id, botApp.id);
    expect(eligible).toBe(true);
  });

  it("a worker created after BotApplication creation has no eligibility row", async () => {
    const eligible = await isWorkerEligible(client.db, ineligibleWorker.id, botApp.id);
    expect(eligible).toBe(false);
  });

  it("an authenticated, ACTIVE, but ineligible worker cannot claim — guessing a valid BotApplication ID is insufficient", async () => {
    const result = await claimAssignment(client.db, ineligibleWorker.id, botApp.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_ELIGIBLE");
    }
  });

  it("the rejected claim wrote no row to worker_assignments — eligibility is checked before claim creation", async () => {
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment).toBeUndefined();
  });

  it("the eligible worker can claim the BotApplication", async () => {
    const result = await claimAssignment(client.db, eligibleWorker.id, botApp.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignment.workerId).toBe(eligibleWorker.id);
    }
  });

  it("stale-lease recovery does not bypass eligibility — an ineligible worker cannot reclaim an expired lease", async () => {
    // Force the existing lease into the past directly, simulating a dead
    // worker without waiting out a real lease duration.
    await client.db.execute(
      sql`update worker_assignments set lease_expires_at = date_sub(now(), interval 1 minute) where bot_application_id = ${botApp.id}`,
    );

    const result = await claimAssignment(client.db, ineligibleWorker.id, botApp.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_ELIGIBLE");
    }

    // The stale assignment must still show the original (eligible) owner —
    // the rejected reclaim attempt must not have altered it.
    const assignment = await findAssignment(client.db, botApp.id);
    expect(assignment?.workerId).toBe(eligibleWorker.id);
  });

  it("a worker revoked after being granted eligibility can no longer claim, even though the eligibility row still exists", async () => {
    const secondBot = await createBotApplication(
      client.db,
      tenant.id,
      randomSnowflake(),
      testId("bot-eligibility-revoked"),
    );
    // eligibleWorker was created before this second BotApplication too, so
    // it is again a real candidate and should have been granted eligibility.
    expect(await isWorkerEligible(client.db, eligibleWorker.id, secondBot.id)).toBe(true);

    await revokeWorker(client.db, eligibleWorker.id);

    const result = await claimAssignment(client.db, eligibleWorker.id, secondBot.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("WORKER_NOT_ACTIVE");
    }

    // Eligibility itself is untouched -- revocation is checked live, not by
    // deleting the eligibility record.
    expect(await isWorkerEligible(client.db, eligibleWorker.id, secondBot.id)).toBe(true);
  });
});
