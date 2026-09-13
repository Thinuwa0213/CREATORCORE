import { Hono } from "hono";
import { recordRuntimeStatus } from "@creatorcore/db";
import {
  createWorkerAuthMiddleware,
  type WorkerAuthDeps,
  type WorkerAuthEnv,
} from "../../middleware/worker-auth.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNTIME_STATES = new Set(["STARTING", "READY", "ERROR", "STOPPED"]);

interface RuntimeStatusBody {
  state?: unknown;
  connectedAt?: unknown;
  discordBotUserId?: unknown;
  errorCategory?: unknown;
}

/**
 * Narrow worker-to-control-plane runtime-health reporting (task §19,
 * Amendment 4). Bound to authenticated worker (middleware) + current LIVE
 * WorkerAssignment + exact BotApplication — re-checked again inside
 * `recordRuntimeStatus` itself (defense in depth, matching
 * `renewAssignment`/`releaseAssignment`'s own re-check precedent). Never
 * accepts token material, authorization headers, or raw Discord error
 * text — `errorCategory` is a short caller-supplied code, capped in
 * length, never logged or stored beyond that.
 */
export function createBotRuntimeStatusRoute(deps: WorkerAuthDeps): Hono<WorkerAuthEnv> {
  const route = new Hono<WorkerAuthEnv>();
  route.use("*", createWorkerAuthMiddleware(deps));

  route.post("/:botApplicationId", async (c) => {
    const workerId = c.get("workerId");
    const botApplicationId = c.req.param("botApplicationId");
    if (!UUID_SHAPE.test(botApplicationId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as RuntimeStatusBody;
    if (typeof body.state !== "string" || !RUNTIME_STATES.has(body.state)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    let connectedAt: Date | undefined;
    if (body.connectedAt !== undefined) {
      if (typeof body.connectedAt !== "string") {
        return c.json({ error: "invalid_request" }, 400);
      }
      const parsed = new Date(body.connectedAt);
      if (Number.isNaN(parsed.getTime())) {
        return c.json({ error: "invalid_request" }, 400);
      }
      connectedAt = parsed;
    }

    const discordBotUserId =
      typeof body.discordBotUserId === "string" ? body.discordBotUserId.slice(0, 32) : undefined;
    const errorCategory =
      typeof body.errorCategory === "string" ? body.errorCategory.slice(0, 64) : undefined;

    const result = await recordRuntimeStatus(deps.db, {
      workerId,
      botApplicationId,
      state: body.state as "STARTING" | "READY" | "ERROR" | "STOPPED",
      ...(connectedAt !== undefined ? { connectedAt } : {}),
      ...(discordBotUserId !== undefined ? { discordBotUserId } : {}),
      ...(errorCategory !== undefined ? { errorCategory } : {}),
    });

    if (!result.ok) {
      return c.json({ error: "not_current_owner" }, 403);
    }
    return c.json({ ok: true });
  });

  return route;
}
