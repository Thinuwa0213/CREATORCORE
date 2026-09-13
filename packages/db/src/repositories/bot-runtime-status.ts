import { and, eq, sql } from "drizzle-orm";
import { botApplications, botRuntimeStatus, workerAssignments } from "../schema/index.js";
import type { Db } from "../types.js";

export type RuntimeState = "STARTING" | "READY" | "ERROR" | "STOPPED";

export interface RecordRuntimeStatusInput {
  workerId: string;
  botApplicationId: string;
  state: RuntimeState;
  /** Set only on a fresh connection; omitted on periodic re-affirmation so an established connectedAt is never overwritten. */
  connectedAt?: Date;
  discordBotUserId?: string;
  errorCategory?: string;
}

export interface RuntimeStatusRow {
  botApplicationId: string;
  workerId: string;
  state: RuntimeState;
  connectedAt: Date | null;
  lastSeenAt: Date;
  discordBotUserId: string | null;
  errorCategory: string | null;
}

/**
 * Records worker-reported runtime health (Phase 5 Amendment 4). Bound to
 * authenticated worker + current LIVE WorkerAssignment + exact
 * BotApplication, re-checked here (not just trusted from the caller's own
 * middleware) — the same defense-in-depth precedent as `renewAssignment`/
 * `releaseAssignment` re-checking worker status. Lease liveness is judged
 * entirely in SQL against the database's own `now()`, never the app
 * server's clock (the same reasoning `promotePendingCredential` documents).
 */
export async function recordRuntimeStatus(
  db: Db,
  input: RecordRuntimeStatusInput,
): Promise<{ ok: boolean }> {
  return db.transaction(
    async (tx) => {
      const [assignment] = await tx
        .select({
          leaseIsLive:
            sql<number>`(${workerAssignments.status} = 'ACTIVE' and ${workerAssignments.leaseExpiresAt} > now())`.as(
              "lease_is_live",
            ),
        })
        .from(workerAssignments)
        .where(
          and(
            eq(workerAssignments.botApplicationId, input.botApplicationId),
            eq(workerAssignments.workerId, input.workerId),
          ),
        )
        .for("update");

      if (!assignment || Number(assignment.leaseIsLive) !== 1) {
        return { ok: false };
      }

      const updateSet: Record<string, unknown> = {
        workerId: input.workerId,
        state: input.state,
        discordBotUserId: input.discordBotUserId ?? null,
        errorCategory: input.errorCategory ?? null,
        lastSeenAt: sql`now()`,
      };
      if (input.connectedAt !== undefined) {
        updateSet.connectedAt = input.connectedAt;
      }

      await tx
        .insert(botRuntimeStatus)
        .values({
          botApplicationId: input.botApplicationId,
          workerId: input.workerId,
          state: input.state,
          connectedAt: input.connectedAt ?? null,
          discordBotUserId: input.discordBotUserId ?? null,
          errorCategory: input.errorCategory ?? null,
          lastSeenAt: sql`now()`,
        })
        .onDuplicateKeyUpdate({ set: updateSet });

      return { ok: true };
    },
    { isolationLevel: "read committed" },
  );
}

/**
 * `findByTenantAndId`-shaped (docs/DATABASE_RULES.md): joined through
 * `bot_applications` so a caller cannot read another tenant's runtime
 * status by guessing a `botApplicationId`.
 */
export async function findRuntimeStatusForTenantBotApplication(
  db: Db,
  tenantId: string,
  botApplicationId: string,
): Promise<RuntimeStatusRow | undefined> {
  const [row] = await db
    .select({
      botApplicationId: botRuntimeStatus.botApplicationId,
      workerId: botRuntimeStatus.workerId,
      state: botRuntimeStatus.state,
      connectedAt: botRuntimeStatus.connectedAt,
      lastSeenAt: botRuntimeStatus.lastSeenAt,
      discordBotUserId: botRuntimeStatus.discordBotUserId,
      errorCategory: botRuntimeStatus.errorCategory,
    })
    .from(botRuntimeStatus)
    .innerJoin(botApplications, eq(botApplications.id, botRuntimeStatus.botApplicationId))
    .where(
      and(
        eq(botApplications.tenantId, tenantId),
        eq(botRuntimeStatus.botApplicationId, botApplicationId),
      ),
    )
    .limit(1);

  return row;
}
