import type { Logger } from "@creatorcore/logger";

/**
 * Internal to apps/worker only — not a shared contract. A future
 * WorkerLifecycleState exposed to apps/api (per ADR-0011) would live in a
 * shared package, but nothing in Phase 2 exposes worker lifecycle to
 * apps/api yet, so there is no second real consumer to justify that now
 * (see apps/worker/README.md).
 */
export type WorkerLifecycleState = "starting" | "running" | "stopping" | "stopped";

const VALID_TRANSITIONS: Record<WorkerLifecycleState, WorkerLifecycleState[]> = {
  starting: ["running", "stopping"],
  running: ["stopping"],
  stopping: ["stopped"],
  stopped: [],
};

export class WorkerLifecycle {
  #state: WorkerLifecycleState = "starting";
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  get state(): WorkerLifecycleState {
    return this.#state;
  }

  transition(next: WorkerLifecycleState): void {
    const allowed = VALID_TRANSITIONS[this.#state];
    if (!allowed.includes(next)) {
      throw new Error(`invalid worker lifecycle transition: ${this.#state} -> ${next}`);
    }
    this.#logger.info("worker lifecycle transition", { from: this.#state, to: next });
    this.#state = next;
  }

  isReady(): boolean {
    return this.#state === "running";
  }
}
