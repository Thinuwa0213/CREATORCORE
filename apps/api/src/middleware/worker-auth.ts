import type { MiddlewareHandler } from "hono";
import { findWorkerById, recordAuditEvent, type DatabaseClient } from "@creatorcore/db";
import { verifyWorkerAccessToken, type WorkerTokenSigningKeys } from "../lib/worker-token.js";

export interface WorkerAuthEnv {
  Variables: {
    workerId: string;
  };
}

export interface WorkerAuthDeps {
  db: DatabaseClient["db"];
  signingKeys: WorkerTokenSigningKeys;
}

/**
 * Verifies the internal worker access token (docs/adr/0011) and rejects
 * before any route handler runs. Beyond verifying the token itself, this
 * ALSO re-checks the worker's CURRENT status from the database on every
 * single authenticated request, not only at token-issuance time -- this is
 * what makes revocation take effect immediately (on the worker's very next
 * request) regardless of how much of the token's lifetime remains, closing
 * the gap a purely expiry-bound token would otherwise leave open for a
 * worker revoked mid-flight. Every rejection is recorded as a failed-auth
 * AuditEvent (workerId when known, reason, never the token value itself).
 */
export function createWorkerAuthMiddleware(deps: WorkerAuthDeps): MiddlewareHandler<WorkerAuthEnv> {
  return async (c, next) => {
    const authHeader = c.req.header("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;

    if (!token) {
      await recordAuditEvent(deps.db, {
        actorType: "WORKER",
        targetType: "Worker",
        targetId: "unknown",
        action: "worker.auth.failure",
        outcome: "DENIED",
        metadata: { reason: "missing_bearer_token" },
      });
      return c.json({ error: "unauthorized" }, 401);
    }

    const verification = verifyWorkerAccessToken(token, deps.signingKeys);
    if (!verification.ok) {
      // `verification.workerId` is present only when the token's HMAC
      // signature already verified but a later check rejected it (e.g.
      // expired, wrong issuer/audience) -- in that case the subject IS
      // authenticated and safe to attribute (Phase 3 review finding M3).
      // It is never present for a signature/shape failure, where the
      // subject was never authenticated at all -- falls back to "unknown".
      await recordAuditEvent(deps.db, {
        actorType: "WORKER",
        ...(verification.workerId !== undefined ? { actorWorkerId: verification.workerId } : {}),
        targetType: "Worker",
        targetId: verification.workerId ?? "unknown",
        action: "worker.auth.failure",
        outcome: "DENIED",
        metadata: { reason: verification.reason },
      });
      return c.json({ error: "unauthorized" }, 401);
    }

    const worker = await findWorkerById(deps.db, verification.workerId);
    if (!worker || worker.status !== "ACTIVE") {
      await recordAuditEvent(deps.db, {
        actorType: "WORKER",
        actorWorkerId: verification.workerId,
        targetType: "Worker",
        targetId: verification.workerId,
        action: "worker.auth.failure",
        outcome: "DENIED",
        metadata: { reason: worker ? "worker_revoked" : "worker_unknown" },
      });
      return c.json({ error: "unauthorized" }, 401);
    }

    c.set("workerId", verification.workerId);
    return next();
  };
}
