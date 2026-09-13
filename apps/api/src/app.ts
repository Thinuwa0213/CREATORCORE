import { Hono } from "hono";
import type { Logger } from "@creatorcore/logger";
import type { DatabaseClient } from "@creatorcore/db";
import { createHealthRoute } from "./routes/health.js";
import { createReadyRoute, type ReadyRouteDeps } from "./routes/ready.js";
import { createWorkerExchangeRoute } from "./routes/internal/worker-exchange.js";
import { createWorkerAssignmentRoutes } from "./routes/internal/worker-assignments.js";
import { createErrorHandler } from "./error-handler.js";
import type { WorkerTokenSigningKeys } from "./lib/worker-token.js";

import type { CredentialService } from "./services/credential-service.js";

export interface CreateAppOptions extends ReadyRouteDeps {
  logger: Logger;
  db: DatabaseClient["db"];
  signingKeys: WorkerTokenSigningKeys;
  credentialService?: CredentialService | undefined;
}

/**
 * Builds the Hono app without binding a port — used both by the real
 * bootstrap (src/index.ts) and by tests (via `app.request(...)`), so
 * route/error-boundary behavior is tested without a live server or a real
 * database.
 *
 * `/internal/*` routes (docs/adr/0011) are called only by apps/worker,
 * authenticating with its own per-worker service identity and short-lived
 * scoped internal credential — never a user session (docs/adr/0002).
 */
export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();

  app.route("/health", createHealthRoute());
  app.route("/ready", createReadyRoute(options));
  app.route("/internal/workers/exchange", createWorkerExchangeRoute(options));
  app.route("/internal/worker-assignments", createWorkerAssignmentRoutes(options));

  app.onError(createErrorHandler(options.logger));
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
