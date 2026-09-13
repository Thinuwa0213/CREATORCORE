import { and, asc, eq, sql } from "drizzle-orm";
import { workerEligibility, workers } from "../schema/index.js";
import type { Db } from "../types.js";

const MAX_ELIGIBLE_WORKERS_PER_BOT_APPLICATION = 2;

/**
 * The minimum Phase-3 control-plane authorization mechanism required so
 * that a valid worker identity alone is never sufficient to claim an
 * arbitrary BotApplication (docs/adr/0006). Deterministic, static,
 * least-loaded selection of up to 2 currently-ACTIVE workers, computed
 * once at BotApplication creation -- not a dynamic scheduler/rebalancer.
 * The cap of 2 matches the two-replica HA baseline (ADR-0008): either
 * eligible worker can claim/reclaim this BotApplication for failover.
 *
 * With exactly 2 active workers in the whole fleet, both are necessarily
 * eligible for everything, matching "either replica can re-claim." The
 * mechanism becomes a real restriction the moment a 3rd worker identity
 * exists (a canary, a not-yet-revoked decommissioned worker, a future
 * scale-out member) that was never selected for a given BotApplication --
 * that identity cannot claim it even with a fully valid credential.
 */
export async function assignEligibleWorkers(db: Db, botApplicationId: string): Promise<void> {
  const candidates = await db
    .select({
      workerId: workers.id,
      eligibilityCount: sql<number>`count(${workerEligibility.botApplicationId})`.as(
        "eligibility_count",
      ),
    })
    .from(workers)
    .leftJoin(workerEligibility, eq(workerEligibility.workerId, workers.id))
    .where(eq(workers.status, "ACTIVE"))
    .groupBy(workers.id)
    .orderBy(sql`count(${workerEligibility.botApplicationId}) asc`, asc(workers.id))
    .limit(MAX_ELIGIBLE_WORKERS_PER_BOT_APPLICATION);

  if (candidates.length === 0) {
    return;
  }

  await db
    .insert(workerEligibility)
    .values(candidates.map((c) => ({ botApplicationId, workerId: c.workerId })));
}

export async function isWorkerEligible(
  db: Db,
  workerId: string,
  botApplicationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ workerId: workerEligibility.workerId })
    .from(workerEligibility)
    .where(
      and(
        eq(workerEligibility.botApplicationId, botApplicationId),
        eq(workerEligibility.workerId, workerId),
      ),
    )
    .limit(1);
  return row !== undefined;
}
