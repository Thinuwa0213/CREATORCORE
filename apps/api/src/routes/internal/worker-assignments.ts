import { Hono } from "hono";
import {
  claimAssignment,
  listActiveAssignmentsForWorker,
  listClaimableWorkForWorker,
  recordAuditEvent,
  releaseAssignment,
  renewAssignment,
} from "@creatorcore/db";
import {
  createWorkerAuthMiddleware,
  type WorkerAuthDeps,
  type WorkerAuthEnv,
} from "../../middleware/worker-auth.js";
import type { CredentialService } from "../../services/credential-service.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WorkerAssignmentRoutesDeps extends WorkerAuthDeps {
  credentialService?: CredentialService | undefined;
}

/**
 * Internal WorkerAssignment claim/renew/release and credential delivery endpoints (docs/adr/0006, docs/adr/0007).
 * `createWorkerAuthMiddleware` runs before every handler here -- workerId
 * always comes from the verified access token's context value, NEVER from
 * a request body/path parameter, so a caller cannot discover, claim, renew,
 * or release on behalf of a different workerId by supplying one in the request.
 *
 * Discovery (/eligible) returns ONLY work currently claimable by this worker
 * (Amendment 1), never fleet state, foreign worker IDs, or other workers'
 * lease timestamps. /current inspects assignments actively held by this worker.
 *
 * Credentials (/credentials/active, /rotations/:credentialId) are strictly
 * released ONLY when the database confirms the authenticated worker owns
 * an active lease on the requested BotApplication.
 */
export function createWorkerAssignmentRoutes(
  deps: WorkerAssignmentRoutesDeps,
): Hono<WorkerAuthEnv> {
  const route = new Hono<WorkerAuthEnv>();
  route.use("*", createWorkerAuthMiddleware(deps));

  route.get("/eligible", async (c) => {
    const workerId = c.get("workerId");
    const eligibleWork = await listClaimableWorkForWorker(deps.db, workerId);
    return c.json({ eligibleWork });
  });

  route.get("/current", async (c) => {
    const workerId = c.get("workerId");
    const assignments = await listActiveAssignmentsForWorker(deps.db, workerId);
    return c.json({
      assignments: assignments.map((a) => ({
        botApplicationId: a.botApplicationId,
        leaseExpiresAt: a.leaseExpiresAt,
      })),
    });
  });

  route.post("/:botApplicationId/claim", async (c) => {
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    if (!UUID_SHAPE.test(botApplicationId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await claimAssignment(deps.db, workerId, botApplicationId);
    if (!result.ok) {
      await recordAuditEvent(deps.db, {
        actorType: "WORKER",
        actorWorkerId: workerId,
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "assignment.claim_denied",
        outcome: "DENIED",
        metadata: { reason: result.reason },
      });
      return c.json({ error: "claim_denied" }, 403);
    }

    await recordAuditEvent(deps.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "assignment.claim",
      outcome: "SUCCESS",
    });
    return c.json({
      botApplicationId: result.assignment.botApplicationId,
      workerId: result.assignment.workerId,
      leaseExpiresAt: result.assignment.leaseExpiresAt,
    });
  });

  route.post("/:botApplicationId/renew", async (c) => {
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    if (!UUID_SHAPE.test(botApplicationId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await renewAssignment(deps.db, workerId, botApplicationId);
    await recordAuditEvent(deps.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "assignment.renew",
      outcome: result.ok ? "SUCCESS" : "DENIED",
    });
    if (!result.ok) {
      return c.json({ error: "renew_denied" }, 403);
    }
    return c.json({ ok: true });
  });

  route.post("/:botApplicationId/release", async (c) => {
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    if (!UUID_SHAPE.test(botApplicationId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await releaseAssignment(deps.db, workerId, botApplicationId);
    await recordAuditEvent(deps.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "assignment.release",
      outcome: result.ok ? "SUCCESS" : "DENIED",
    });
    if (!result.ok) {
      return c.json({ error: "release_denied" }, 403);
    }
    return c.json({ ok: true });
  });

  route.get("/:botApplicationId/credentials/active", async (c) => {
    if (!deps.credentialService) {
      return c.json({ error: "not_implemented" }, 501);
    }
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    if (!UUID_SHAPE.test(botApplicationId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const cred = await deps.credentialService.getDecryptedActiveCredential(
      workerId,
      botApplicationId,
    );
    if (!cred) {
      return c.json({ error: "credential_access_denied" }, 403);
    }

    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    return c.json({
      botApplicationId: cred.botApplicationId,
      credentialId: cred.credentialId,
      token: cred.token,
      status: cred.status,
    });
  });

  route.get("/:botApplicationId/rotations/:credentialId", async (c) => {
    if (!deps.credentialService) {
      return c.json({ error: "not_implemented" }, 501);
    }
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    const credentialId = c.req.param("credentialId");
    if (!UUID_SHAPE.test(botApplicationId) || !UUID_SHAPE.test(credentialId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const cred = await deps.credentialService.getDecryptedPendingCredential(
      workerId,
      botApplicationId,
      credentialId,
    );
    if (!cred) {
      return c.json({ error: "credential_access_denied" }, 403);
    }

    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    return c.json({
      botApplicationId: cred.botApplicationId,
      credentialId: cred.credentialId,
      token: cred.token,
      status: cred.status,
    });
  });

  route.post("/:botApplicationId/rotations/:credentialId/acknowledge", async (c) => {
    if (!deps.credentialService) {
      return c.json({ error: "not_implemented" }, 501);
    }
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    const credentialId = c.req.param("credentialId");
    if (!UUID_SHAPE.test(botApplicationId) || !UUID_SHAPE.test(credentialId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await deps.credentialService.acknowledgeRotation(
      workerId,
      botApplicationId,
      credentialId,
    );
    if (!result.ok) {
      return c.json({ error: result.reason ?? "acknowledgement_failed" }, 403);
    }

    return c.json({ ok: true });
  });

  route.post("/:botApplicationId/rotations/:credentialId/reject", async (c) => {
    if (!deps.credentialService) {
      return c.json({ error: "not_implemented" }, 501);
    }
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    const credentialId = c.req.param("credentialId");
    if (!UUID_SHAPE.test(botApplicationId) || !UUID_SHAPE.test(credentialId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    const result = await deps.credentialService.rejectRotation(
      workerId,
      botApplicationId,
      credentialId,
      body?.reason,
    );
    if (!result.ok) {
      return c.json({ error: result.reason ?? "rejection_failed" }, 403);
    }

    return c.json({ ok: true });
  });

  return route;
}
