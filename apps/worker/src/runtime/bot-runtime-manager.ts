import type { Logger } from "@creatorcore/logger";
import type { ControlPlaneClient } from "../client/control-plane-client.js";
import { BotRuntime } from "./bot-runtime.js";
import { type DiscordClientFactory, defaultDiscordClientFactory } from "./discord-client.js";
import type { OwnershipState } from "./assignment-coordinator.js";

export interface BotRuntimeManagerOptions {
  client: ControlPlaneClient;
  logger: Logger;
  clientFactory?: DiscordClientFactory;
  readyTimeoutMs?: number;
}

export interface RotationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Manages active Discord bot runtimes and the rotation validation lifecycle.
 *
 * Security & Architectural Invariants:
 * - Amendment 1: Rotation is crash-recoverable. Database truth is authoritative.
 *   On restart, the manager queries the control plane for the ACTIVE credential,
 *   converging without local state.
 * - Amendment 2: Bound to exact credential identity (botApplicationId + credentialId).
 * - Amendment 7: Plaintext credentials are kept only during login execution; references
 *   are dropped on UNCERTAIN, LOST, shutdown, and replacement.
 * - Amendment 8: Runtime replacement invariant. At most one ACTIVE runtime per bot.
 *   Pending credentials are treated strictly as temporary validation runtimes and never
 *   left running beyond the controlled validation/swap window.
 */
export class BotRuntimeManager {
  private readonly client: ControlPlaneClient;
  private readonly logger: Logger;
  private readonly clientFactory: DiscordClientFactory;
  private readonly readyTimeoutMs: number;

  private readonly activeRuntimes = new Map<string, BotRuntime>();
  private readonly validationRuntimes = new Map<string, BotRuntime>();
  private readonly activeRotations = new Set<string>();

  constructor(options: BotRuntimeManagerOptions) {
    this.client = options.client;
    this.logger = options.logger;
    this.clientFactory = options.clientFactory ?? defaultDiscordClientFactory;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 15_000;
  }

  public getActiveRuntime(botApplicationId: string): BotRuntime | undefined {
    return this.activeRuntimes.get(botApplicationId);
  }

  public getValidationRuntime(botApplicationId: string): BotRuntime | undefined {
    return this.validationRuntimes.get(botApplicationId);
  }

  public isRunning(botApplicationId: string): boolean {
    const runtime = this.activeRuntimes.get(botApplicationId);
    return runtime ? runtime.isConnected() : false;
  }

  /**
   * Starts an active runtime for an assigned BotApplication by fetching
   * the database-authoritative ACTIVE credential from the control plane.
   * Idempotent: returns true if already running with the current credential.
   */
  public async startActiveRuntime(botApplicationId: string): Promise<boolean> {
    const existing = this.activeRuntimes.get(botApplicationId);
    if (existing && existing.isConnected()) {
      return true;
    }

    try {
      const cred = await this.client.getActiveCredential(botApplicationId);
      if (!cred) {
        this.logger.warn("active credential unavailable from control plane", {
          botApplicationId,
        });
        return false;
      }

      // If an existing stopped runtime exists with a different credential, clean it up
      if (existing) {
        await existing.stop();
        this.activeRuntimes.delete(botApplicationId);
      }

      const discordClient = this.clientFactory();
      const runtime = new BotRuntime({
        botApplicationId,
        credentialId: cred.credentialId,
        client: discordClient,
        logger: this.logger,
        readyTimeoutMs: this.readyTimeoutMs,
      });

      await runtime.start(cred.token);
      this.activeRuntimes.set(botApplicationId, runtime);

      this.logger.info("active bot runtime started successfully", {
        botApplicationId,
        credentialId: cred.credentialId,
      });
      return true;
    } catch (err) {
      this.logger.warn("failed to start active bot runtime", {
        botApplicationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Reacts to ownership state transitions from AssignmentCoordinator.
   * If UNCERTAIN or LOST, immediately halts and destroys active and validation runtimes.
   */
  public async handleOwnershipChange(
    botApplicationId: string,
    newState: OwnershipState,
  ): Promise<void> {
    if (newState === "OWNED") {
      await this.startActiveRuntime(botApplicationId);
    } else if (newState === "UNCERTAIN" || newState === "LOST") {
      this.logger.info("relinquishing bot runtime due to ownership state", {
        botApplicationId,
        newState,
      });

      // 1. Destroy any pending validation runtime immediately
      const validationRuntime = this.validationRuntimes.get(botApplicationId);
      if (validationRuntime) {
        await validationRuntime.stop();
        this.validationRuntimes.delete(botApplicationId);
      }
      this.activeRotations.delete(botApplicationId);

      // 2. Destroy active runtime immediately
      const activeRuntime = this.activeRuntimes.get(botApplicationId);
      if (activeRuntime) {
        await activeRuntime.stop();
        this.activeRuntimes.delete(botApplicationId);
      }
    }
  }

  /**
   * Executes credential rotation for an assigned BotApplication.
   *
   * Invariants:
   * - Validates pending credential with a temporary validation runtime.
   * - Only after READY is reached, acknowledges to control plane.
   * - On successful DB promotion, atomically swaps active runtime and destroys old runtime.
   * - On any failure (login error, timeout, rejection), destroys validation runtime and
   *   preserves the existing active runtime.
   */
  public async rotateCredential(
    botApplicationId: string,
    credentialId: string,
  ): Promise<RotationResult> {
    if (this.activeRotations.has(botApplicationId)) {
      this.logger.warn("rotation already in progress for botApplication", {
        botApplicationId,
        credentialId,
      });
      return { ok: false, reason: "rotation_in_progress" };
    }

    this.activeRotations.add(botApplicationId);

    try {
      // 1. Retrieve pending credential from control plane
      const pendingCred = await this.client.getPendingCredential(botApplicationId, credentialId);
      if (!pendingCred) {
        this.logger.warn("pending credential unavailable or access denied", {
          botApplicationId,
          credentialId,
        });
        return { ok: false, reason: "credential_unavailable" };
      }

      // 2. Create temporary validation runtime
      const discordClient = this.clientFactory();
      const validationRuntime = new BotRuntime({
        botApplicationId,
        credentialId,
        client: discordClient,
        logger: this.logger,
        readyTimeoutMs: this.readyTimeoutMs,
      });

      this.validationRuntimes.set(botApplicationId, validationRuntime);

      // 3. Connect and wait for READY
      try {
        await validationRuntime.start(pendingCred.token);
      } catch (loginErr) {
        // Pending login failed or timed out: destroy validation runtime immediately
        await validationRuntime.stop();
        this.validationRuntimes.delete(botApplicationId);

        const reason = loginErr instanceof Error ? loginErr.message : "validation_failed";
        this.logger.warn("pending credential validation failed; rejecting rotation", {
          botApplicationId,
          credentialId,
          reason,
        });

        // Inform control plane to remove the bad pending credential
        await this.client.rejectRotation(botApplicationId, credentialId, reason).catch(() => undefined);
        return { ok: false, reason: "validation_failed" };
      }

      // 4. Pending runtime is READY! Send acknowledgement to promote in DB
      const ack = await this.client.acknowledgeRotation(botApplicationId, credentialId);
      if (!ack.ok) {
        // Acknowledgement failed (stale, expired, or rejected by API): destroy validation runtime
        this.logger.warn("rotation acknowledgement rejected by control plane", {
          botApplicationId,
          credentialId,
          reason: ack.reason,
        });
        await validationRuntime.stop();
        this.validationRuntimes.delete(botApplicationId);
        return { ok: false, reason: ack.reason ?? "acknowledgement_failed" };
      }

      // 5. DB successfully promoted PENDING to ACTIVE!
      // Atomic runtime swap: promote validation runtime to active and destroy old runtime
      const oldRuntime = this.activeRuntimes.get(botApplicationId);
      this.activeRuntimes.set(botApplicationId, validationRuntime);
      this.validationRuntimes.delete(botApplicationId);

      if (oldRuntime) {
        try {
          await oldRuntime.stop();
        } catch (stopErr) {
          this.logger.warn("error stopping superseded runtime after swap", {
            botApplicationId,
            error: stopErr instanceof Error ? stopErr.message : String(stopErr),
          });
        }
      }

      this.logger.info("credential rotation completed and runtime swapped", {
        botApplicationId,
        credentialId,
      });

      return { ok: true };
    } finally {
      this.activeRotations.delete(botApplicationId);
    }
  }

  /**
   * Graceful shutdown: stops all active and validation runtimes.
   */
  public async stopAll(): Promise<void> {
    const stops: Promise<void>[] = [];

    for (const runtime of this.validationRuntimes.values()) {
      stops.push(runtime.stop());
    }
    this.validationRuntimes.clear();
    this.activeRotations.clear();

    for (const runtime of this.activeRuntimes.values()) {
      stops.push(runtime.stop());
    }
    this.activeRuntimes.clear();

    await Promise.allSettled(stops);
    this.logger.info("all bot runtimes stopped cleanly");
  }
}
