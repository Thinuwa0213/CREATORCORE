import type { Logger } from "@creatorcore/logger";
import type { WorkerLifecycle } from "./lifecycle.js";

export interface ShutdownHooks {
  /** Runs cleanup (e.g. closing connections). Must not throw past this call. */
  onShutdown: () => Promise<void> | void;
  /** Injectable for tests; defaults to process.exit. */
  exit?: (code: number) => void;
}

/**
 * Registers SIGTERM/SIGINT handlers that transition the lifecycle to
 * stopping -> stopped and run cleanup exactly once, even if both signals
 * arrive (a double Ctrl-C must not double-run shutdown logic).
 */
export function registerShutdownHandlers(
  lifecycle: WorkerLifecycle,
  logger: Logger,
  hooks: ShutdownHooks,
): void {
  const exit = hooks.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;

  async function handle(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("worker received shutdown signal", { signal });
    lifecycle.transition("stopping");

    try {
      await hooks.onShutdown();
    } catch (error) {
      logger.error("worker shutdown cleanup failed", { error });
    }

    lifecycle.transition("stopped");
    exit(0);
  }

  process.on("SIGTERM", () => void handle("SIGTERM"));
  process.on("SIGINT", () => void handle("SIGINT"));
}
