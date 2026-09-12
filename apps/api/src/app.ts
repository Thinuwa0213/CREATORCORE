import { Hono } from "hono";
import type { Logger } from "@creatorcore/logger";
import { createHealthRoute } from "./routes/health.js";
import { createReadyRoute, type ReadyRouteDeps } from "./routes/ready.js";
import { createErrorHandler } from "./error-handler.js";

export interface CreateAppOptions extends ReadyRouteDeps {
  logger: Logger;
}

/**
 * Builds the Hono app without binding a port — used both by the real
 * bootstrap (src/index.ts) and by tests (via `app.request(...)`), so
 * route/error-boundary behavior is tested without a live server or a real
 * database.
 */
export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();

  app.route("/health", createHealthRoute());
  app.route("/ready", createReadyRoute(options));

  app.onError(createErrorHandler(options.logger));
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
