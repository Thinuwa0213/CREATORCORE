import type { Logger } from "@creatorcore/logger";

export interface ControlPlaneClientOptions {
  apiBaseUrl: string;
  workerId: string;
  bootstrapSecret: string;
  logger: Logger;
  requestTimeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface EligibleWorkItem {
  botApplicationId: string;
  claimable: true;
}

export interface CurrentAssignmentItem {
  botApplicationId: string;
  leaseExpiresAt: string;
}

export interface ClaimSuccessResult {
  ok: true;
  leaseExpiresAt: string;
}

export interface ClaimDeniedResult {
  ok: false;
  reason: string;
}

export type ClaimResult = ClaimSuccessResult | ClaimDeniedResult;

export interface BotCredentialPayload {
  botApplicationId: string;
  credentialId: string;
  token: string;
  status: "ACTIVE" | "PENDING";
}

/**
 * Thrown when the control-plane API explicitly rejects worker authentication
 * (HTTP 401 on exchange or after token re-auth). This indicates the worker identity
 * is invalid or revoked. Privileged activity must halt immediately.
 */
export class WorkerAuthRevokedError extends Error {
  constructor(message = "Worker authentication rejected or worker revoked") {
    super(message);
    this.name = "WorkerAuthRevokedError";
  }
}

/**
 * Thrown when communication with the control-plane encounters an ambiguous
 * network or server failure (timeout, network drop, HTTP 5xx) after exhausting retries.
 * Indicates an UNCERTAIN transport state, not an authoritative denial.
 */
export class ControlPlaneTransportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ControlPlaneTransportError";
  }
}

/**
 * Internal API client for apps/worker (docs/adr/0011).
 *
 * Security guarantees (Amendment 3):
 * - Bootstrap secret is held memory-only within this instance; never written to disk,
 *   never serialized, never placed in query strings, and never logged.
 * - Access tokens are held memory-only (cleared on revocation or shutdown).
 * - All requests use bounded timeouts to prevent hanging indefinitely.
 * - Transient network failures retry with bounded exponential backoff + jitter.
 */
export class ControlPlaneClient {
  private readonly apiBaseUrl: string;
  private readonly workerId: string;
  private readonly bootstrapSecret: string;
  private readonly logger: Logger;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  private accessToken: string | null = null;

  constructor(options: ControlPlaneClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.workerId = options.workerId;
    this.bootstrapSecret = options.bootstrapSecret;
    this.logger = options.logger;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 8_000;
  }

  /** Returns true if this client currently holds an in-memory access token. */
  public hasToken(): boolean {
    return this.accessToken !== null;
  }

  /** Clears access token from memory references on shutdown or revocation. */
  public clearTokens(): void {
    this.accessToken = null;
  }

  /**
   * Exchanges the bootstrap secret for a short-lived access token.
   * On 401, throws WorkerAuthRevokedError without logging secret material.
   */
  public async authenticate(): Promise<string> {
    const url = `${this.apiBaseUrl}/internal/workers/exchange`;

    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workerId: this.workerId,
            bootstrapSecret: this.bootstrapSecret,
          }),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (response.status === 401) {
          this.accessToken = null;
          this.logger.warn("worker authentication rejected: unauthorized / revoked", {
            workerId: this.workerId,
          });
          throw new WorkerAuthRevokedError();
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as { accessToken?: string };
        if (!data.accessToken || typeof data.accessToken !== "string") {
          throw new Error("Invalid exchange response shape: missing accessToken");
        }

        this.accessToken = data.accessToken;
        this.logger.info("worker authenticated", { workerId: this.workerId });
        return this.accessToken;
      } catch (error) {
        if (error instanceof WorkerAuthRevokedError) {
          throw error;
        }

        if (attempt >= this.maxRetries) {
          this.logger.warn("worker exchange failed after retries", {
            workerId: this.workerId,
            attempts: attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new ControlPlaneTransportError(`Exchange failed after ${attempt} attempts`, error);
        }

        await this.sleepWithBackoff(attempt);
      }
    }
  }

  /**
   * Capability-oriented discovery: returns only work the control plane authorizes
   * this worker to attempt to claim right now (Amendment 1).
   */
  public async discoverEligibleWork(): Promise<EligibleWorkItem[]> {
    const data = await this.requestWithAuth<{ eligibleWork?: EligibleWorkItem[] }>(
      "/internal/worker-assignments/eligible",
      { method: "GET" },
    );
    return data.eligibleWork ?? [];
  }

  /**
   * Inspects current assignments actively owned by this worker.
   */
  public async getCurrentAssignments(): Promise<CurrentAssignmentItem[]> {
    const data = await this.requestWithAuth<{ assignments?: CurrentAssignmentItem[] }>(
      "/internal/worker-assignments/current",
      { method: "GET" },
    );
    return data.assignments ?? [];
  }

  /**
   * Attempts to claim a specific BotApplication assignment.
   * Returns ok: true with lease expiration on success, or ok: false on denial.
   */
  public async claim(botApplicationId: string): Promise<ClaimResult> {
    return this.requestAssignmentMutation(
      `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/claim`,
      "claim",
    );
  }

  /**
   * Renews an owned assignment.
   */
  public async renew(botApplicationId: string): Promise<{ ok: boolean }> {
    const res = await this.requestAssignmentMutation(
      `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/renew`,
      "renew",
    );
    return { ok: res.ok };
  }

  /**
   * Releases an owned assignment during graceful shutdown or relinquishment.
   */
  public async release(botApplicationId: string): Promise<{ ok: boolean }> {
    const res = await this.requestAssignmentMutation(
      `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/release`,
      "release",
    );
    return { ok: res.ok };
  }

  /**
   * Retrieves the currently authoritative decrypted ACTIVE credential for an assigned BotApplication.
   * Bound to live assignment ownership verified by API.
   */
  public async getActiveCredential(botApplicationId: string): Promise<BotCredentialPayload | null> {
    try {
      return await this.requestWithAuth<BotCredentialPayload>(
        `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/credentials/active`,
        { method: "GET" },
      );
    } catch (error) {
      if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Retrieves an exact decrypted PENDING credential candidate for validation during rotation.
   * Bound to live assignment ownership and exact credential ID.
   */
  public async getPendingCredential(
    botApplicationId: string,
    credentialId: string,
  ): Promise<BotCredentialPayload | null> {
    try {
      return await this.requestWithAuth<BotCredentialPayload>(
        `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/rotations/${encodeURIComponent(credentialId)}`,
        { method: "GET" },
      );
    } catch (error) {
      if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atomically acknowledges successful validation of a pending credential,
   * promoting it to ACTIVE in database truth.
   */
  public async acknowledgeRotation(
    botApplicationId: string,
    credentialId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await this.requestWithAuth<{ ok: boolean }>(
        `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/rotations/${encodeURIComponent(credentialId)}/acknowledge`,
        { method: "POST" },
      );
      return { ok: res.ok };
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        return { ok: false, reason: error.errorBody?.error ?? "acknowledgement_failed" };
      }
      throw error;
    }
  }

  /**
   * Reports runtime health to the control plane (Phase 5, task §19,
   * Amendment 4) — the one source honest enough to distinguish "this
   * worker's lease is live" from "the Discord Gateway client actually
   * reached READY." Best-effort from the caller's perspective: a rejection
   * (this worker no longer holds the live assignment) or transport failure
   * here must never crash the runtime or block its primary job of running
   * the bot — callers should treat this as fire-and-forget.
   */
  public async reportRuntimeStatus(
    botApplicationId: string,
    report: {
      state: "STARTING" | "READY" | "ERROR" | "STOPPED";
      connectedAt?: string;
      discordBotUserId?: string;
      errorCategory?: string;
    },
  ): Promise<{ ok: boolean }> {
    try {
      const res = await this.requestWithAuth<{ ok: boolean }>(
        `/internal/bot-runtime-status/${encodeURIComponent(botApplicationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report),
        },
      );
      return { ok: res.ok };
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        return { ok: false };
      }
      throw error;
    }
  }

  /**
   * Rejects a pending credential candidate after failed validation, removing it from database.
   */
  public async rejectRotation(
    botApplicationId: string,
    credentialId: string,
    reason?: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await this.requestWithAuth<{ ok: boolean }>(
        `/internal/worker-assignments/${encodeURIComponent(botApplicationId)}/rotations/${encodeURIComponent(credentialId)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      return { ok: res.ok };
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        return { ok: false, reason: error.errorBody?.error ?? "rejection_failed" };
      }
      throw error;
    }
  }

  private async requestAssignmentMutation(
    path: string,
    action: "claim" | "renew" | "release",
  ): Promise<ClaimResult> {
    try {
      const data = await this.requestWithAuth<{
        botApplicationId?: string;
        leaseExpiresAt?: string;
        ok?: boolean;
        error?: string;
      }>(path, { method: "POST" });

      return {
        ok: true,
        leaseExpiresAt: data.leaseExpiresAt ?? "",
      };
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        return {
          ok: false,
          reason: error.errorBody?.error ?? `${action}_denied`,
        };
      }
      throw error;
    }
  }

  /**
   * Executes an authenticated request, re-authenticating on 401 and
   * retrying transient network errors with bounded exponential backoff.
   */
  private async requestWithAuth<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    let attempt = 0;
    let hasRetriedAuth = false;

    while (true) {
      attempt += 1;
      const url = `${this.apiBaseUrl}${path}`;

      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...(init.headers ? (init.headers as Record<string, string>) : {}),
          Authorization: `Bearer ${this.accessToken}`,
        };

        const response = await fetch(url, {
          ...init,
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (response.status === 401) {
          // Token expired or invalid: attempt re-authentication once
          if (!hasRetriedAuth) {
            hasRetriedAuth = true;
            this.logger.info("access token rejected (401), refreshing token", {
              workerId: this.workerId,
            });
            this.accessToken = null;
            await this.authenticate();
            continue;
          }

          // Still 401 after re-authenticating: worker identity is revoked
          this.accessToken = null;
          throw new WorkerAuthRevokedError();
        }

        if (response.status === 403) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new HttpError(403, body);
        }

        if (!response.ok) {
          throw new HttpError(response.status);
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof WorkerAuthRevokedError || error instanceof HttpError) {
          throw error;
        }

        // Network error / timeout
        if (attempt >= this.maxRetries) {
          this.logger.warn("control plane transport failure after retries", {
            workerId: this.workerId,
            path,
            attempts: attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new ControlPlaneTransportError(
            `Request to ${path} failed after ${attempt} attempts`,
            error,
          );
        }

        await this.sleepWithBackoff(attempt);
      }
    }
  }

  private async sleepWithBackoff(attempt: number): Promise<void> {
    const exp = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** (attempt - 1));
    const jitter = Math.random() * 0.3 * exp; // 0-30% full jitter
    const delay = Math.floor(exp + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorBody?: { error?: string },
  ) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}
