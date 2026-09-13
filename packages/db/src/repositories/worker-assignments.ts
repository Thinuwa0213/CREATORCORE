import { and, eq, gt, sql } from "drizzle-orm";
import { workerAssignments } from "../schema/index.js";
import type { Db } from "../types.js";
import { isDuplicateKeyError } from "../lib/duplicate-key-error.js";
import { isWorkerEligible } from "./worker-eligibility.js";
import { findWorkerById } from "./workers.js";

export const DEFAULT_LEASE_DURATION_MS = 45_000;

export interface WorkerAssignment {
  botApplicationId: string;
  workerId: string;
  status: "ACTIVE" | "RELEASED";
  claimedAt: Date;
  leaseExpiresAt: Date;
  lastHeartbeatAt: Date | null;
  releasedAt: Date | null;
}

export type ClaimFailureReason = "WORKER_NOT_ACTIVE" | "NOT_ELIGIBLE" | "LEASE_HELD_BY_OTHER";
export type ClaimResult =
  | { ok: true; assignment: WorkerAssignment }
  | { ok: false; reason: ClaimFailureReason };

/**
 * Both the requesting worker's live status and its eligibility for this
 * specific BotApplication are checked BEFORE either sub-path (fresh claim
 * or stale-lease reclaim) touches worker_assignments -- neither check can
 * be bypassed by whichever branch ends up running, per docs/adr/0006's
 * requirement that claim creation is an apps/api-side decision, never a
 * bare worker assertion, and the explicit "stale-lease recovery must not
 * bypass eligibility" requirement.
 */
async function assertClaimEligible(
  db: Db,
  workerId: string,
  botApplicationId: string,
): Promise<ClaimFailureReason | undefined> {
  const worker = await findWorkerById(db, workerId);
  if (!worker || worker.status !== "ACTIVE") {
    return "WORKER_NOT_ACTIVE";
  }
  const eligible = await isWorkerEligible(db, workerId, botApplicationId);
  if (!eligible) {
    return "NOT_ELIGIBLE";
  }
  return undefined;
}

/**
 * Claim/renew/reclaim a BotApplication's WorkerAssignment.
 *
 * Two-phase strategy (an INSERT ... ON DUPLICATE KEY UPDATE was rejected at
 * design time: it has no WHERE clause on its UPDATE branch, and its
 * affected-rows result cannot reliably tell the caller whether THEIR claim
 * specifically won -- unacceptable for a security-relevant single-owner
 * guarantee):
 *
 * 1. Plain INSERT attempt. Succeeds -> claim granted; InnoDB's own PK
 *    uniqueness serializes concurrent first-claims with zero
 *    application-level locking. Duplicate-key error -> a row already
 *    exists -> phase 2.
 * 2. A transaction at READ COMMITTED isolation (avoids default REPEATABLE
 *    READ gap-lock contention between unrelated botApplicationIds):
 *    SELECT ... FOR UPDATE the row, then decide renew/reclaim/reject.
 *    Eligibility is re-checked inside this transaction too, so a stale
 *    lease cannot be reclaimed by a worker who lost eligibility since the
 *    pre-check above.
 *
 * leaseExpiresAt/claimedAt/lastHeartbeatAt are always computed from the
 * database's own NOW() -- never a worker-supplied clock value. The
 * lease-liveness DECISION (is the existing lease still live right now) is
 * likewise judged entirely in SQL against the database's own NOW(), never
 * against the calling Node process's `new Date()` (Phase 3 review finding
 * M2) -- comparing a DB-issued timestamp to the app server's local clock
 * would make "is this lease still live" dependent on clock skew between the
 * two hosts, which could let a still-live lease look stale (or vice versa).
 */
export async function claimAssignment(
  db: Db,
  workerId: string,
  botApplicationId: string,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<ClaimResult> {
  const preCheckFailure = await assertClaimEligible(db, workerId, botApplicationId);
  if (preCheckFailure) {
    return { ok: false, reason: preCheckFailure };
  }

  const leaseExpiresAt = sql`date_add(now(), interval ${leaseDurationMs * 1000} microsecond)`;

  try {
    await db.insert(workerAssignments).values({
      botApplicationId,
      workerId,
      status: "ACTIVE",
      claimedAt: sql`now()`,
      leaseExpiresAt,
    });
    const assignment = await findAssignment(db, botApplicationId);
    if (!assignment) {
      throw new Error("claimAssignment: row not found immediately after insert");
    }
    return { ok: true, assignment };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  return db.transaction(
    async (tx) => {
      const failure = await assertClaimEligible(tx, workerId, botApplicationId);
      if (failure) {
        return { ok: false, reason: failure };
      }

      const [existing] = await tx
        .select({
          workerId: workerAssignments.workerId,
          claimedAt: workerAssignments.claimedAt,
          // Computed entirely in SQL against the database's own NOW() -- see
          // this function's doc comment (M2). mysql2 returns this boolean
          // expression as 0/1.
          leaseIsLive: sql<number>`(${workerAssignments.status} = 'ACTIVE' and ${workerAssignments.leaseExpiresAt} > now())`.as(
            "lease_is_live",
          ),
        })
        .from(workerAssignments)
        .where(eq(workerAssignments.botApplicationId, botApplicationId))
        .for("update");

      if (!existing) {
        await tx.insert(workerAssignments).values({
          botApplicationId,
          workerId,
          status: "ACTIVE",
          claimedAt: sql`now()`,
          leaseExpiresAt,
        });
      } else {
        const leaseIsLive = Number(existing.leaseIsLive) === 1;
        if (leaseIsLive && existing.workerId !== workerId) {
          return { ok: false, reason: "LEASE_HELD_BY_OTHER" };
        }
        // Either renewing our own live lease, or reclaiming a stale/released one.
        await tx
          .update(workerAssignments)
          .set({
            workerId,
            status: "ACTIVE",
            claimedAt: leaseIsLive ? existing.claimedAt : sql`now()`,
            leaseExpiresAt,
            lastHeartbeatAt: leaseIsLive ? sql`now()` : null,
            releasedAt: null,
          })
          .where(eq(workerAssignments.botApplicationId, botApplicationId));
      }

      const assignment = await findAssignment(tx, botApplicationId);
      if (!assignment) {
        throw new Error("claimAssignment: row not found after transactional write");
      }
      return { ok: true, assignment };
    },
    { isolationLevel: "read committed" },
  );
}

export async function renewAssignment(
  db: Db,
  workerId: string,
  botApplicationId: string,
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<{ ok: boolean }> {
  const worker = await findWorkerById(db, workerId);
  if (!worker || worker.status !== "ACTIVE") {
    return { ok: false };
  }
  const leaseExpiresAt = sql`date_add(now(), interval ${leaseDurationMs * 1000} microsecond)`;
  const result = await db
    .update(workerAssignments)
    .set({ leaseExpiresAt, lastHeartbeatAt: sql`now()` })
    .where(
      and(
        eq(workerAssignments.botApplicationId, botApplicationId),
        eq(workerAssignments.workerId, workerId),
        eq(workerAssignments.status, "ACTIVE"),
        gt(workerAssignments.leaseExpiresAt, sql`now()`),
      ),
    );
  return { ok: result[0].affectedRows > 0 };
}

/**
 * Releasing also re-checks the worker's live status (Phase 3 review finding
 * H2), matching `renewAssignment` and `claimAssignment`'s own eligibility
 * pre-checks -- without this, a revoked worker's still-unexpired access
 * token would have no repository-level backstop for `/release` specifically
 * (unlike claim/renew, which already independently re-check worker status),
 * relying entirely on the HTTP auth middleware never being bypassed or
 * misconfigured for this one route.
 */
export async function releaseAssignment(
  db: Db,
  workerId: string,
  botApplicationId: string,
): Promise<{ ok: boolean }> {
  const worker = await findWorkerById(db, workerId);
  if (!worker || worker.status !== "ACTIVE") {
    return { ok: false };
  }
  const result = await db
    .update(workerAssignments)
    .set({ status: "RELEASED", releasedAt: sql`now()` })
    .where(
      and(
        eq(workerAssignments.botApplicationId, botApplicationId),
        eq(workerAssignments.workerId, workerId),
        eq(workerAssignments.status, "ACTIVE"),
      ),
    );
  return { ok: result[0].affectedRows > 0 };
}

export async function findAssignment(
  db: Db,
  botApplicationId: string,
): Promise<WorkerAssignment | undefined> {
  const [row] = await db
    .select()
    .from(workerAssignments)
    .where(eq(workerAssignments.botApplicationId, botApplicationId))
    .limit(1);
  return row;
}

/**
 * Lists all live, active WorkerAssignments currently held by this authenticated worker.
 *
 * Checks worker status is ACTIVE and checks leaseExpiresAt > now() using MySQL's
 * authoritative clock.
 */
export async function listActiveAssignmentsForWorker(
  db: Db,
  workerId: string,
): Promise<WorkerAssignment[]> {
  const worker = await findWorkerById(db, workerId);
  if (!worker || worker.status !== "ACTIVE") {
    return [];
  }

  return db
    .select()
    .from(workerAssignments)
    .where(
      and(
        eq(workerAssignments.workerId, workerId),
        eq(workerAssignments.status, "ACTIVE"),
        gt(workerAssignments.leaseExpiresAt, sql`now()`),
      ),
    );
}

