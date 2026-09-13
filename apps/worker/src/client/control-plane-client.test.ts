import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ControlPlaneClient,
  ControlPlaneTransportError,
  WorkerAuthRevokedError,
} from "./control-plane-client.js";
import type { Logger } from "@creatorcore/logger";

function createMockLogger(): Logger & { messages: string[]; payloads: unknown[] } {
  const messages: string[] = [];
  const payloads: unknown[] = [];
  const logFn = (msg: string, payload?: unknown) => {
    messages.push(msg);
    if (payload !== undefined) {
      payloads.push(payload);
    }
  };
  return {
    debug: logFn,
    info: logFn,
    warn: logFn,
    error: logFn,
    messages,
    payloads,
  };
}

describe("ControlPlaneClient", () => {
  const workerId = "test-worker-01";
  const bootstrapSecret = "super-secret-bootstrap-credential-value";
  const apiBaseUrl = "http://localhost:8787";

  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.restoreAllMocks();
  });

  it("authenticates and stores token in-memory only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "jwt-test-token-123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ControlPlaneClient({
      apiBaseUrl,
      workerId,
      bootstrapSecret,
      logger: mockLogger,
      requestTimeoutMs: 1000,
    });

    expect(client.hasToken()).toBe(false);
    const token = await client.authenticate();
    expect(token).toBe("jwt-test-token-123");
    expect(client.hasToken()).toBe(true);

    // Verify request payload was sent to exchange
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/internal/workers/exchange`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ workerId, bootstrapSecret }),
      }),
    );

    // Verify clearTokens wipes the in-memory token
    client.clearTokens();
    expect(client.hasToken()).toBe(false);
  });

  it("never logs the bootstrap secret or access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "jwt-sensitive-token-xyz" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ControlPlaneClient({
      apiBaseUrl,
      workerId,
      bootstrapSecret,
      logger: mockLogger,
    });

    await client.authenticate();

    // Check every logged message and payload
    for (const msg of mockLogger.messages) {
      expect(msg).not.toContain(bootstrapSecret);
      expect(msg).not.toContain("jwt-sensitive-token-xyz");
    }
    for (const p of mockLogger.payloads) {
      const serialized = JSON.stringify(p);
      expect(serialized).not.toContain(bootstrapSecret);
      expect(serialized).not.toContain("jwt-sensitive-token-xyz");
    }
  });

  it("throws WorkerAuthRevokedError immediately when exchange returns 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ControlPlaneClient({
      apiBaseUrl,
      workerId,
      bootstrapSecret,
      logger: mockLogger,
    });

    await expect(client.authenticate()).rejects.toThrow(WorkerAuthRevokedError);
    expect(client.hasToken()).toBe(false);
  });

  it("re-authenticates when request returns 401 due to expired token", async () => {
    let exchangeCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/internal/workers/exchange")) {
        exchangeCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ accessToken: `token-v${exchangeCalls}` }),
        };
      }
      if (url.endsWith("/internal/worker-assignments/eligible")) {
        if (exchangeCalls === 1) {
          // First attempt with token-v1 returns 401 (expired)
          return { ok: false, status: 401, json: async () => ({ error: "unauthorized" }) };
        }
        // Second attempt with token-v2 succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            eligibleWork: [{ botApplicationId: "app-1", claimable: true }],
          }),
        };
      }
      throw new Error(`Unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ControlPlaneClient({
      apiBaseUrl,
      workerId,
      bootstrapSecret,
      logger: mockLogger,
    });

    // Seed with initial token
    await client.authenticate();
    expect(exchangeCalls).toBe(1);

    const work = await client.discoverEligibleWork();
    expect(work).toEqual([{ botApplicationId: "app-1", claimable: true }]);
    expect(exchangeCalls).toBe(2);
  });

  it("throws ControlPlaneTransportError on network failure after exhausting retries", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ControlPlaneClient({
      apiBaseUrl,
      workerId,
      bootstrapSecret,
      logger: mockLogger,
      maxRetries: 2,
      baseBackoffMs: 1,
      maxBackoffMs: 5,
    });

    await expect(client.authenticate()).rejects.toThrow(ControlPlaneTransportError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles claim denial (403) cleanly without throwing", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/internal/workers/exchange")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ accessToken: "test-token" }),
        };
      }
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: "claim_denied" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ControlPlaneClient({
      apiBaseUrl,
      workerId,
      bootstrapSecret,
      logger: mockLogger,
    });

    const result = await client.claim("app-denied");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("claim_denied");
    }
  });
});
