import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { botApplications, tenants, workerAssignments, workerEligibility, workers } from "../schema/index.js";
import type { Db } from "../types.js";
import { findWorkerById } from "./workers.js";

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

export interface ClaimableWorkItem {
  botApplicationId: string;
  claimable: true;
}

/**
 * Lists BotApplications the authenticated worker is currently authorized and
 * permitted to attempt to claim (Amendment 1: capability-oriented discovery).
 *
 * Scoped strictly to the authenticated workerId. Returns ONLY work where:
 * 1. The worker is active (findWorkerById checks ACTIVE status)
 * 2. The worker is assigned eligibility (workerEligibility)
 * 3. The owning tenant is currently ACTIVE (disabled tenants have work omitted)
 * 4. The BotApplication is currently claimable:
 *    - never claimed (no workerAssignments row), OR
 *    - status is 'RELEASED', OR
 *    - status is 'ACTIVE' but the lease has expired against MySQL now()
 *
 * Deliberately does NOT return:
 * - BotApplications held by other workers with live leases
 * - BotApplications currently owned by this caller (inspect via /current)
 * - Any foreign worker identity or foreign lease timestamp
 */
export async function listClaimableWorkForWorker(
  db: Db,
  workerId: string,
): Promise<ClaimableWorkItem[]> {
  const worker = await findWorkerById(db, workerId);
  if (!worker || worker.status !== "ACTIVE") {
    return [];
  }

  const rows = await db
    .select({
      botApplicationId: workerEligibility.botApplicationId,
    })
    .from(workerEligibility)
    .innerJoin(botApplications, eq(botApplications.id, workerEligibility.botApplicationId))
    .innerJoin(tenants, eq(tenants.id, botApplications.tenantId))
    .leftJoin(
      workerAssignments,
      eq(workerAssignments.botApplicationId, workerEligibility.botApplicationId),
    )
    .where(
      and(
        eq(workerEligibility.workerId, workerId),
        eq(tenants.status, "ACTIVE"),
        or(
          isNull(workerAssignments.botApplicationId),
          eq(workerAssignments.status, "RELEASED"),
          and(
            eq(workerAssignments.status, "ACTIVE"),
            lte(workerAssignments.leaseExpiresAt, sql`now()`),
          ),
        ),
      ),
    );

  return rows.map((r) => ({
    botApplicationId: r.botApplicationId,
    claimable: true as const,
  }));
}

