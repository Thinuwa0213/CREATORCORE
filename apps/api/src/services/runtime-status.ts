import { DEFAULT_LEASE_DURATION_MS } from "@creatorcore/db";
import type { CredentialStatusSummary, RuntimeStatusRow, WorkerAssignment } from "@creatorcore/db";

export type DashboardRuntimeStatus =
  | "NOT_CONFIGURED"
  | "PENDING_CREDENTIAL"
  | "UNASSIGNED"
  | "ACTIVE_ASSIGNMENT"
  | "ONLINE"
  | "DEGRADED";

export interface RuntimeStatusInputs {
  botApplicationId: string | undefined;
  credential: CredentialStatusSummary | undefined;
  assignment: WorkerAssignment | undefined;
  runtimeStatus: RuntimeStatusRow | undefined;
  now: Date;
}

/**
 * Truthful runtime status (task §18, Amendment 4) — every branch is
 * authoritative control-plane data, never inferred or synthesized. A
 * `worker_assignments` heartbeat alone proves lease ownership/liveness,
 * not that the discord.js client reached Gateway `READY` — `ONLINE` is
 * reachable only through a real `bot_runtime_status` row reporting `READY`
 * with a fresh `lastSeenAt`; every other live-assignment case reports the
 * narrower, honest `ACTIVE_ASSIGNMENT` rather than overclaiming.
 *
 * "Fresh" is defined relative to the worker's own lease-renewal interval
 * (`DEFAULT_LEASE_DURATION_MS`, the same cadence `renewAssignment` already
 * uses) plus a safety margin — not an arbitrary constant — so a genuinely
 * healthy long-lived connection (whose periodic re-affirmation piggybacks
 * on that same renewal cadence) never falsely ages out of `ONLINE`.
 */
export function deriveRuntimeStatus(inputs: RuntimeStatusInputs): DashboardRuntimeStatus {
  if (!inputs.botApplicationId) {
    return "NOT_CONFIGURED";
  }
  if (!inputs.credential) {
    return "PENDING_CREDENTIAL";
  }

  const assignmentIsLive =
    inputs.assignment !== undefined &&
    inputs.assignment.status === "ACTIVE" &&
    inputs.assignment.leaseExpiresAt.getTime() > inputs.now.getTime();

  if (!assignmentIsLive) {
    return "UNASSIGNED";
  }

  if (!inputs.runtimeStatus) {
    return "ACTIVE_ASSIGNMENT";
  }

  if (inputs.runtimeStatus.state === "ERROR") {
    return "DEGRADED";
  }

  if (inputs.runtimeStatus.state === "READY") {
    const freshnessWindowMs = DEFAULT_LEASE_DURATION_MS * 2;
    const isFresh =
      inputs.now.getTime() - inputs.runtimeStatus.lastSeenAt.getTime() <= freshnessWindowMs;
    return isFresh ? "ONLINE" : "ACTIVE_ASSIGNMENT";
  }

  // STARTING or STOPPED with an otherwise-live assignment.
  return "ACTIVE_ASSIGNMENT";
}
