import { Hono } from "hono";
import { claimAssignment, recordAuditEvent, releaseAssignment, renewAssignment } from "@creatorcore/db";
import {
  createWorkerAuthMiddleware,
  type WorkerAuthDeps,
  type WorkerAuthEnv,
} from "../../middleware/worker-auth.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Internal WorkerAssignment claim/renew/release endpoints (docs/adr/0006).
 * `createWorkerAuthMiddleware` runs before every handler here -- workerId
 * always comes from the verified access token's context value, NEVER from
 * a request body/path parameter, so a caller cannot claim/renew/release on
 * behalf of a different workerId by supplying one in the request.
 *
 * Every outcome (success and denial) is recorded as an AuditEvent -- the
 * specific denial reason (not-eligible, worker-not-active, lease-held-by-
 * another-worker) is safe, allow-listed metadata, never a raw error object.
 */
export function createWorkerAssignmentRoutes(deps: WorkerAuthDeps): Hono<WorkerAuthEnv> {
  const route = new Hono<WorkerAuthEnv>();
  route.use("*", createWorkerAuthMiddleware(deps));

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

  return route;
}
