import { loadWorkerConfig, ConfigValidationError } from "@creatorcore/config";
import { createLogger } from "@creatorcore/logger";
import { WorkerLifecycle } from "./lifecycle.js";
import { registerShutdownHandlers } from "./signals.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

async function bootstrap() {
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

  let coordinator: import("./runtime/assignment-coordinator.js").AssignmentCoordinator | undefined;
  let runtimeManager: import("./runtime/bot-runtime-manager.js").BotRuntimeManager | undefined;

  if (config.WORKER_ID && config.WORKER_BOOTSTRAP_SECRET) {
    const { ControlPlaneClient } = await import("./client/control-plane-client.js");
    const { AssignmentCoordinator } = await import("./runtime/assignment-coordinator.js");
    const { BotRuntimeManager } = await import("./runtime/bot-runtime-manager.js");

    const client = new ControlPlaneClient({
      apiBaseUrl: config.API_BASE_URL,
      workerId: config.WORKER_ID,
      bootstrapSecret: config.WORKER_BOOTSTRAP_SECRET,
      logger,
    });

    runtimeManager = new BotRuntimeManager({
      client,
      logger,
    });

    coordinator = new AssignmentCoordinator({
      client,
      logger,
      onOwnershipChange: async (botApplicationId, state) => {
        if (runtimeManager) {
          await runtimeManager.handleOwnershipChange(botApplicationId, state);
        }
      },
    });

    void coordinator.start();
  }

  const heartbeat = setInterval(() => {
    logger.debug("worker heartbeat", { ...workerIdContext, state: lifecycle.state });
  }, HEARTBEAT_INTERVAL_MS);

  lifecycle.transition("running");
  logger.info("apps/worker started", { ...workerIdContext, apiBaseUrl: config.API_BASE_URL });

  registerShutdownHandlers(lifecycle, logger, {
    onShutdown: async () => {
      clearInterval(heartbeat);
      if (coordinator) {
        await coordinator.stop();
      }
      if (runtimeManager) {
        await runtimeManager.stopAll();
      }
    },
  });
}

void bootstrap();
