import { loadWorkerConfig, ConfigValidationError } from "@creatorcore/config";
import { createLogger } from "@creatorcore/logger";
import { WorkerLifecycle } from "./lifecycle.js";
import { registerShutdownHandlers } from "./signals.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

function bootstrap() {
  let config;
  try {
    config = loadWorkerConfig();
  } catch (error) {
    const message = error instanceof ConfigValidationError ? error.message : String(error);
    console.error(`[apps/worker] startup failed: ${message}`);
    process.exit(1);
  }

  const logger = createLogger({
    service: "apps/worker",
    level: config.LOG_LEVEL,
  });
  const lifecycle = new WorkerLifecycle(logger);

  // No Discord Gateway connection in Phase 2 (docs/adr/0005-discord-runtime.md
  // is locked architecture, not yet implemented). A heartbeat keeps the
  // process visibly alive and exercises the logging path without faking
  // Discord functionality.
  const workerIdContext = config.WORKER_ID ? { workerId: config.WORKER_ID } : {};

  const heartbeat = setInterval(() => {
    logger.debug("worker heartbeat", { ...workerIdContext, state: lifecycle.state });
  }, HEARTBEAT_INTERVAL_MS);

  lifecycle.transition("running");
  logger.info("apps/worker started", { ...workerIdContext, apiBaseUrl: config.API_BASE_URL });

  registerShutdownHandlers(lifecycle, logger, {
    onShutdown: () => {
      clearInterval(heartbeat);
    },
  });
}

bootstrap();
