import type { MiddlewareHandler } from "hono";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense for the user-facing `/app/*` route group (Phase 5 §1,
 * security-review H3/M4). SameSite=Lax alone is not enough across the
 * apps/web -> apps/api server-to-server hop, so every state-changing
 * request must carry the browser's own, unmodified `Origin` header,
 * matching the configured web origin exactly.
 *
 * This depends entirely on apps/web forwarding the browser's real `Origin`
 * header verbatim (via `headers()`, never a value apps/web constructs
 * itself) on every privileged call — see apps/web's server actions. A
 * request missing or mismatching Origin is rejected before any
 * authentication, authorization, database, or network work runs (M4: this
 * middleware must be the first gate, not a late check after expensive
 * work has already happened).
 */
export function createOriginCheckMiddleware(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (!STATE_CHANGING_METHODS.has(c.req.method)) {
      return next();
    }

    const origin = c.req.header("origin");
    if (!origin || origin !== allowedOrigin) {
      return c.json({ error: "CSRF_ORIGIN_MISMATCH" }, 403);
    }

    return next();
  };
}
