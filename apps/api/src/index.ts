import { serve } from "@hono/node-server";
import { ConfigValidationError } from "@creatorcore/config";
import { loadApiConfig } from "@creatorcore/config/api";
import { createLogger } from "@creatorcore/logger";
import { createDatabaseClient, checkDatabaseConnectivity } from "@creatorcore/db";
import { createApp } from "./app.js";
import type { WorkerTokenSigningKeys } from "./lib/worker-token.js";

function bootstrap() {
  let config;
  try {
    config = loadApiConfig();
  } catch (error) {
    // Config errors never include secret values (ConfigValidationError's
    // own guarantee) — safe to print directly and exit before anything
    // (including the logger, which needs config) starts.
    const message = error instanceof ConfigValidationError ? error.message : String(error);
    console.error(`[apps/api] startup failed: ${message}`);
    process.exit(1);
  }

  const logger = createLogger({ service: "apps/api", level: config.LOG_LEVEL });
  const dbClient = createDatabaseClient(config);

  // exactOptionalPropertyTypes: `previous` must be omitted entirely when
  // unset, never assigned an explicit `undefined` (which is not the same
  // thing under this tsconfig setting).
  const signingKeys: WorkerTokenSigningKeys = {
    current: config.WORKER_TOKEN_SIGNING_KEY,
    currentVersion: config.WORKER_TOKEN_SIGNING_KEY_VERSION,
    ...(config.WORKER_TOKEN_SIGNING_KEY_PREVIOUS !== undefined
      ? { previous: config.WORKER_TOKEN_SIGNING_KEY_PREVIOUS }
      : {}),
  };

  const app = createApp({
    logger,
    db: dbClient.db,
    checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
    signingKeys,
  });

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info("apps/api listening", { port: info.port });
  });

  async function shutdown(signal: string) {
    logger.info("apps/api shutting down", { signal });
    server.close();
    await dbClient.close();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap();
