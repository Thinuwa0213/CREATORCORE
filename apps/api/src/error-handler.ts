import type { ErrorHandler } from "hono";
import type { Logger } from "@creatorcore/logger";

/**
 * Safe error boundary: unexpected errors are logged server-side (through the
 * redacting logger) but the client only ever sees a generic message — never
 * a stack trace, internal identifier, or secret (docs/SECURITY.md, the
 * new-api skill's "safe errors" requirement).
 */
export function createErrorHandler(logger: Logger): ErrorHandler {
  return (err, c) => {
    logger.error("unhandled request error", { err, path: c.req.path, method: c.req.method });
    return c.json({ error: "internal_server_error" }, 500);
  };
}
