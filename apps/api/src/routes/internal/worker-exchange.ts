import { Hono } from "hono";
import { z } from "zod";
import {
  findWorkerById,
  recordAuditEvent,
  recordWorkerSeen,
  verifyWorkerBootstrapSecret,
  type DatabaseClient,
} from "@creatorcore/db";
import { issueWorkerAccessToken, type WorkerTokenSigningKeys } from "../../lib/worker-token.js";

export interface WorkerExchangeDeps {
  db: DatabaseClient["db"];
  signingKeys: WorkerTokenSigningKeys;
}

const exchangeRequestSchema = z.object({
  workerId: z.string().min(1).max(64),
  bootstrapSecret: z.string().min(1),
});

/**
 * The bootstrap exchange (docs/adr/0011): a worker presents its bootstrap
 * secret and receives a short-lived scoped access token in return. Unknown
 * worker, wrong secret, and revoked worker all return the identical 401 --
 * never distinguishable to the caller (avoids a worker-enumeration
 * oracle) -- with the specific reason recorded only in the server-side
 * failed-auth AuditEvent, never in the response.
 */
export function createWorkerExchangeRoute(deps: WorkerExchangeDeps): Hono {
  const route = new Hono();

  route.post("/", async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = exchangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const { workerId, bootstrapSecret } = parsed.data;

    const secretValid = await verifyWorkerBootstrapSecret(deps.db, workerId, bootstrapSecret);
    if (!secretValid) {
      await recordAuditEvent(deps.db, {
        actorType: "WORKER",
        actorWorkerId: workerId,
        targetType: "Worker",
        targetId: workerId,
        action: "worker.auth.failure",
        outcome: "DENIED",
        metadata: { reason: "bootstrap_secret_invalid" },
      });
      return c.json({ error: "unauthorized" }, 401);
    }

    const worker = await findWorkerById(deps.db, workerId);
    if (!worker || worker.status !== "ACTIVE") {
      await recordAuditEvent(deps.db, {
        actorType: "WORKER",
        actorWorkerId: workerId,
        targetType: "Worker",
        targetId: workerId,
        action: "worker.auth.failure",
        outcome: "DENIED",
        metadata: { reason: "worker_revoked" },
      });
      return c.json({ error: "unauthorized" }, 401);
    }

    await recordWorkerSeen(deps.db, workerId);
    await recordAuditEvent(deps.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "Worker",
      targetId: workerId,
      action: "worker.auth.success",
      outcome: "SUCCESS",
    });

    const accessToken = issueWorkerAccessToken(workerId, deps.signingKeys);
    return c.json({ accessToken });
  });

  return route;
}
