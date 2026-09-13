import { describe, expect, it } from "vitest";
import { DEFAULT_LEASE_DURATION_MS } from "@creatorcore/db";
import { deriveRuntimeStatus } from "./runtime-status.js";

const NOW = new Date("2026-01-01T00:00:00Z");

const ACTIVE_CREDENTIAL = { status: "ACTIVE" as const, keyVersion: 1, updatedAt: NOW };

const LIVE_ASSIGNMENT = {
  botApplicationId: "bot-1",
  workerId: "worker-1",
  status: "ACTIVE" as const,
  claimedAt: NOW,
  leaseExpiresAt: new Date(NOW.getTime() + 60_000),
  lastHeartbeatAt: NOW,
  releasedAt: null,
};

describe("deriveRuntimeStatus (task §18 — authoritative-data-only, never inferred)", () => {
  it("NOT_CONFIGURED when there is no BotApplication at all", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: undefined,
        credential: undefined,
        assignment: undefined,
        runtimeStatus: undefined,
        now: NOW,
      }),
    ).toBe("NOT_CONFIGURED");
  });

  it("PENDING_CREDENTIAL when a BotApplication exists but has no ACTIVE credential", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: undefined,
        assignment: undefined,
        runtimeStatus: undefined,
        now: NOW,
      }),
    ).toBe("PENDING_CREDENTIAL");
  });

  it("UNASSIGNED when the credential is ACTIVE but there is no live worker assignment", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: undefined,
        runtimeStatus: undefined,
        now: NOW,
      }),
    ).toBe("UNASSIGNED");
  });

  it("UNASSIGNED when the assignment is RELEASED", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: { ...LIVE_ASSIGNMENT, status: "RELEASED" },
        runtimeStatus: undefined,
        now: NOW,
      }),
    ).toBe("UNASSIGNED");
  });

  it("UNASSIGNED when the assignment's lease has expired", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: { ...LIVE_ASSIGNMENT, leaseExpiresAt: new Date(NOW.getTime() - 1000) },
        runtimeStatus: undefined,
        now: NOW,
      }),
    ).toBe("UNASSIGNED");
  });

  it("ACTIVE_ASSIGNMENT (never ONLINE) when the assignment is live but no runtime report exists yet", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: LIVE_ASSIGNMENT,
        runtimeStatus: undefined,
        now: NOW,
      }),
    ).toBe("ACTIVE_ASSIGNMENT");
  });

  it("ACTIVE_ASSIGNMENT when the runtime report says STARTING", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: LIVE_ASSIGNMENT,
        runtimeStatus: {
          botApplicationId: "bot-1",
          workerId: "worker-1",
          state: "STARTING",
          connectedAt: null,
          lastSeenAt: NOW,
          discordBotUserId: null,
          errorCategory: null,
        },
        now: NOW,
      }),
    ).toBe("ACTIVE_ASSIGNMENT");
  });

  it("ONLINE when the runtime report says READY and lastSeenAt is fresh", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: LIVE_ASSIGNMENT,
        runtimeStatus: {
          botApplicationId: "bot-1",
          workerId: "worker-1",
          state: "READY",
          connectedAt: NOW,
          lastSeenAt: NOW,
          discordBotUserId: "9999",
          errorCategory: null,
        },
        now: NOW,
      }),
    ).toBe("ONLINE");
  });

  it("ACTIVE_ASSIGNMENT (not ONLINE) when READY but lastSeenAt is stale beyond the freshness window", () => {
    const staleLastSeen = new Date(NOW.getTime() - DEFAULT_LEASE_DURATION_MS * 3);
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: LIVE_ASSIGNMENT,
        runtimeStatus: {
          botApplicationId: "bot-1",
          workerId: "worker-1",
          state: "READY",
          connectedAt: NOW,
          lastSeenAt: staleLastSeen,
          discordBotUserId: "9999",
          errorCategory: null,
        },
        now: NOW,
      }),
    ).toBe("ACTIVE_ASSIGNMENT");
  });

  it("DEGRADED when the runtime report says ERROR, even with a live assignment", () => {
    expect(
      deriveRuntimeStatus({
        botApplicationId: "bot-1",
        credential: ACTIVE_CREDENTIAL,
        assignment: LIVE_ASSIGNMENT,
        runtimeStatus: {
          botApplicationId: "bot-1",
          workerId: "worker-1",
          state: "ERROR",
          connectedAt: null,
          lastSeenAt: NOW,
          discordBotUserId: null,
          errorCategory: "GATEWAY_DISCONNECT",
        },
        now: NOW,
      }),
    ).toBe("DEGRADED");
  });

  it("a credential alone never implies ONLINE (the exact dishonesty task §18 forbids)", () => {
    const status = deriveRuntimeStatus({
      botApplicationId: "bot-1",
      credential: ACTIVE_CREDENTIAL,
      assignment: undefined,
      runtimeStatus: undefined,
      now: NOW,
    });
    expect(status).not.toBe("ONLINE");
  });
});
