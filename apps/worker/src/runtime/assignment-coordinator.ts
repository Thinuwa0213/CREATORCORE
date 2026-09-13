import type { Logger } from "@creatorcore/logger";
import {
  ControlPlaneClient,
  ControlPlaneTransportError,
  WorkerAuthRevokedError,
} from "../client/control-plane-client.js";

export type OwnershipState = "OWNED" | "UNCERTAIN" | "LOST";

export interface TrackedAssignment {
  botApplicationId: string;
  state: OwnershipState;
  renewalTimer?: NodeJS.Timeout | undefined;
}

export interface AssignmentCoordinatorOptions {
  client: ControlPlaneClient;
  logger: Logger;
  discoveryIntervalMs?: number; // default: 15_000ms
  renewalIntervalMs?: number; // default: 20_000ms
  reconciliationIntervalMs?: number; // default: 3_000ms for UNCERTAIN state
  releaseTimeoutMs?: number; // default: 3_000ms
  onOwnershipChange?: (botApplicationId: string, state: OwnershipState) => Promise<void> | void;
}

/**
 * Coordinates work discovery, assignment claims, and lease maintenance for apps/worker.
 *
 * Core architectural rules:
 * - Amendment 1: Discovers only permissible work returned by the control plane; never
 *   invents or enumerates BotApplication IDs.
 * - Amendment 2: The worker machine clock NEVER decides authoritative ownership.
 *   Timers only trigger renewal and reconciliation attempts.
 *   States are OWNED, UNCERTAIN, and LOST. While UNCERTAIN, privileged activity is suspended.
 */
export class AssignmentCoordinator {
  private readonly client: ControlPlaneClient;
  private readonly logger: Logger;
  private readonly discoveryIntervalMs: number;
  private readonly renewalIntervalMs: number;
  private readonly reconciliationIntervalMs: number;
  private readonly releaseTimeoutMs: number;
  private readonly onOwnershipChange?: ((botApplicationId: string, state: OwnershipState) => Promise<void> | void) | undefined;

  private readonly assignments = new Map<string, TrackedAssignment>();
  private discoveryTimer?: NodeJS.Timeout | undefined;
  private running = false;


  constructor(options: AssignmentCoordinatorOptions) {
    this.client = options.client;
    this.logger = options.logger;
    this.discoveryIntervalMs = options.discoveryIntervalMs ?? 15_000;
    this.renewalIntervalMs = options.renewalIntervalMs ?? 20_000;
    this.reconciliationIntervalMs = options.reconciliationIntervalMs ?? 3_000;
    this.releaseTimeoutMs = options.releaseTimeoutMs ?? 3_000;
    this.onOwnershipChange = options.onOwnershipChange;
  }

  /**
   * Returns current ownership state for a BotApplication, or undefined if not tracked.
   */
  public getAssignmentState(botApplicationId: string): OwnershipState | undefined {
    return this.assignments.get(botApplicationId)?.state;
  }

  /**
   * Returns true if and only if the assignment is confirmed OWNED by the control plane.
   * While UNCERTAIN or LOST, returns false (privileged activity suspended).
   */
  public isPrivilegedActivityAllowed(botApplicationId: string): boolean {
    return this.assignments.get(botApplicationId)?.state === "OWNED";
  }

  /**
   * Returns a list of all currently tracked assignments and their states.
   */
  public getTrackedAssignments(): { botApplicationId: string; state: OwnershipState }[] {
    return Array.from(this.assignments.values()).map((a) => ({
      botApplicationId: a.botApplicationId,
      state: a.state,
    }));
  }

  /**
   * Starts the background discovery loop.
   */
  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    // Run initial discovery cycle immediately
    await this.runDiscoveryCycle();

    this.discoveryTimer = setInterval(() => {
      void this.runDiscoveryCycle();
    }, this.discoveryIntervalMs);
  }

  /**
   * Stops the coordinator, stops timers, attempts clean release of owned assignments,
   * and clears tokens. Bounded by releaseTimeoutMs so shutdown never hangs indefinitely.
   */
  public async stop(): Promise<void> {
    this.running = false;

    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }

    // Cancel all renewal timers
    for (const assignment of this.assignments.values()) {
      if (assignment.renewalTimer) {
        clearTimeout(assignment.renewalTimer);
        assignment.renewalTimer = undefined;
      }
    }

    const ownedOrUncertain = Array.from(this.assignments.values()).filter(
      (a) => a.state === "OWNED" || a.state === "UNCERTAIN",
    );

    if (ownedOrUncertain.length > 0) {
      this.logger.info("releasing owned assignments on shutdown", {
        count: ownedOrUncertain.length,
      });

      const releasePromises = ownedOrUncertain.map(async (assignment) => {
        try {
          await Promise.race([
            this.client.release(assignment.botApplicationId),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Release timed out")), this.releaseTimeoutMs),
            ),
          ]);
          this.logger.info("assignment released cleanly", {
            botApplicationId: assignment.botApplicationId,
          });
        } catch (error) {
          this.logger.warn("failed to release assignment during shutdown", {
            botApplicationId: assignment.botApplicationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.allSettled(releasePromises);
    }

    this.assignments.clear();
    this.client.clearTokens();
    this.logger.info("assignment coordinator stopped");
  }

  /**
   * Polls the control plane for eligible work and attempts to claim newly discovered work.
   */
  public async runDiscoveryCycle(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const eligibleWork = await this.client.discoverEligibleWork();
      this.logger.debug("work discovered", { count: eligibleWork.length });

      for (const item of eligibleWork) {
        if (!this.running) {
          break;
        }

        // Only attempt to claim if we are not already tracking it
        if (!this.assignments.has(item.botApplicationId)) {
          await this.attemptClaim(item.botApplicationId);
        }
      }
    } catch (error) {
      if (error instanceof WorkerAuthRevokedError) {
        this.logger.warn("worker authentication revoked during discovery; halting", {
          error: error.message,
        });
        await this.stop();
        return;
      }

      this.logger.warn("discovery cycle failed; will retry next interval", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Attempts to claim an eligible BotApplication.
   */
  public async attemptClaim(botApplicationId: string): Promise<boolean> {
    try {
      const result = await this.client.claim(botApplicationId);
      if (result.ok) {
        this.logger.info("assignment claimed", { botApplicationId });
        this.setOwnershipState(botApplicationId, "OWNED");
        this.scheduleRenewal(botApplicationId, this.renewalIntervalMs);
        return true;
      }

      this.logger.info("assignment claim denied (another worker may have won race)", {
        botApplicationId,
        reason: result.reason,
      });
      return false;
    } catch (error) {
      if (error instanceof WorkerAuthRevokedError) {
        this.logger.warn("worker revoked during claim attempt; halting", { botApplicationId });
        await this.stop();
        return false;
      }

      this.logger.warn("claim attempt encountered transport failure", {
        botApplicationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Renews an existing assignment lease.
   */
  public async attemptRenewal(botApplicationId: string): Promise<void> {
    const assignment = this.assignments.get(botApplicationId);
    if (!assignment || !this.running) {
      return;
    }

    try {
      const result = await this.client.renew(botApplicationId);
      if (result.ok) {
        this.setOwnershipState(botApplicationId, "OWNED");
        this.logger.debug("lease renewed", { botApplicationId });
        this.scheduleRenewal(botApplicationId, this.renewalIntervalMs);
        return;
      }

      // Explicit denial by control plane: lease lost
      this.logger.warn("lease renewal denied by control plane; assignment lost", {
        botApplicationId,
      });
      this.setOwnershipState(botApplicationId, "LOST");
      this.dropAssignment(botApplicationId);
    } catch (error) {
      if (error instanceof WorkerAuthRevokedError) {
        this.logger.warn("worker revoked during renewal; halting", { botApplicationId });
        this.setOwnershipState(botApplicationId, "LOST");
        await this.stop();
        return;
      }

      // Ambiguous transport failure (timeout, network dropped, 5xx):
      // Transition to UNCERTAIN. Privileged activity suspended. Schedule fast reconciliation.
      if (error instanceof ControlPlaneTransportError || error instanceof Error) {
        this.logger.warn("lease renewal encountered transport failure; state is now UNCERTAIN", {
          botApplicationId,
          error: error.message,
        });
        this.setOwnershipState(botApplicationId, "UNCERTAIN");
        this.scheduleRenewal(botApplicationId, this.reconciliationIntervalMs);
      }
    }
  }

  private setOwnershipState(botApplicationId: string, state: OwnershipState): void {
    const existing = this.assignments.get(botApplicationId);
    const previousState = existing?.state;
    if (existing) {
      existing.state = state;
    } else {
      this.assignments.set(botApplicationId, { botApplicationId, state });
    }

    if (previousState !== state) {
      try {
        void this.onOwnershipChange?.(botApplicationId, state);
      } catch (err) {
        this.logger.warn("error in onOwnershipChange callback", {
          botApplicationId,
          state,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private scheduleRenewal(botApplicationId: string, delayMs: number): void {
    const assignment = this.assignments.get(botApplicationId);
    if (!assignment || !this.running) {
      return;
    }

    if (assignment.renewalTimer) {
      clearTimeout(assignment.renewalTimer);
    }

    assignment.renewalTimer = setTimeout(() => {
      void this.attemptRenewal(botApplicationId);
    }, delayMs);
  }

  private dropAssignment(botApplicationId: string): void {
    const assignment = this.assignments.get(botApplicationId);
    if (assignment?.renewalTimer) {
      clearTimeout(assignment.renewalTimer);
    }
    this.assignments.delete(botApplicationId);
    this.logger.info("assignment dropped from active runtime", { botApplicationId });

    try {
      void this.onOwnershipChange?.(botApplicationId, "LOST");
    } catch {
      // ignore
    }
  }
}
