import { describe, expect, it, vi, beforeEach } from "vitest";
import { AssignmentCoordinator } from "./assignment-coordinator.js";
import {
  ControlPlaneClient,
  ControlPlaneTransportError,
  WorkerAuthRevokedError,
} from "../client/control-plane-client.js";
import type { Logger } from "@creatorcore/logger";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("AssignmentCoordinator", () => {
  let mockClient: ControlPlaneClient;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockClient = {
      discoverEligibleWork: vi.fn().mockResolvedValue([]),
      claim: vi.fn().mockResolvedValue({ ok: true, leaseExpiresAt: "2026-09-13T12:00:00Z" }),
      renew: vi.fn().mockResolvedValue({ ok: true }),
      release: vi.fn().mockResolvedValue({ ok: true }),
      clearTokens: vi.fn(),
    } as unknown as ControlPlaneClient;
  });

  it("discovers claimable work and transitions successful claim to OWNED", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-1", claimable: true },
    ]);

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
      discoveryIntervalMs: 60_000,
      renewalIntervalMs: 30_000,
    });

    await coordinator.start();

    expect(mockClient.claim).toHaveBeenCalledWith("app-1");
    expect(coordinator.getAssignmentState("app-1")).toBe("OWNED");
    expect(coordinator.isPrivilegedActivityAllowed("app-1")).toBe(true);

    await coordinator.stop();
  });

  it("does not track or permit privileged activity when claim is denied (e.g. race lost)", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-racing", claimable: true },
    ]);
    vi.mocked(mockClient.claim).mockResolvedValueOnce({
      ok: false,
      reason: "claim_denied",
    });

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
    });

    await coordinator.start();

    expect(coordinator.getAssignmentState("app-racing")).toBeUndefined();
    expect(coordinator.isPrivilegedActivityAllowed("app-racing")).toBe(false);

    await coordinator.stop();
  });

  it("transitions to UNCERTAIN on ambiguous transport failure, suspending privileged activity (Amendment 2)", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-flaky", claimable: true },
    ]);

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
    });

    await coordinator.start();
    expect(coordinator.getAssignmentState("app-flaky")).toBe("OWNED");
    expect(coordinator.isPrivilegedActivityAllowed("app-flaky")).toBe(true);

    // Simulate renewal transport failure (timeout / connection refused)
    vi.mocked(mockClient.renew).mockRejectedValueOnce(
      new ControlPlaneTransportError("Network timeout"),
    );

    await coordinator.attemptRenewal("app-flaky");

    // Must be UNCERTAIN, and privileged activity MUST be suspended
    expect(coordinator.getAssignmentState("app-flaky")).toBe("UNCERTAIN");
    expect(coordinator.isPrivilegedActivityAllowed("app-flaky")).toBe(false);

    // Reconciling via successful renewal transitions back to OWNED
    vi.mocked(mockClient.renew).mockResolvedValueOnce({ ok: true });
    await coordinator.attemptRenewal("app-flaky");

    expect(coordinator.getAssignmentState("app-flaky")).toBe("OWNED");
    expect(coordinator.isPrivilegedActivityAllowed("app-flaky")).toBe(true);

    await coordinator.stop();
  });

  it("transitions to LOST and drops assignment on explicit renewal denial", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-expired", claimable: true },
    ]);

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
    });

    await coordinator.start();
    expect(coordinator.getAssignmentState("app-expired")).toBe("OWNED");

    // Renewal explicitly denied by control plane (403)
    vi.mocked(mockClient.renew).mockResolvedValueOnce({ ok: false });

    await coordinator.attemptRenewal("app-expired");

    // Assignment must be dropped and activity forbidden
    expect(coordinator.getAssignmentState("app-expired")).toBeUndefined();
    expect(coordinator.isPrivilegedActivityAllowed("app-expired")).toBe(false);

    await coordinator.stop();
  });

  it("halts and drops assignment when worker authentication is revoked", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-revoked", claimable: true },
    ]);

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
    });

    await coordinator.start();
    expect(coordinator.getAssignmentState("app-revoked")).toBe("OWNED");

    // Renewal throws WorkerAuthRevokedError
    vi.mocked(mockClient.renew).mockRejectedValueOnce(new WorkerAuthRevokedError());

    await coordinator.attemptRenewal("app-revoked");

    expect(coordinator.isPrivilegedActivityAllowed("app-revoked")).toBe(false);
  });

  it("gracefully releases owned assignments on stop and clears token material", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-to-release", claimable: true },
    ]);

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
    });

    await coordinator.start();
    expect(coordinator.getAssignmentState("app-to-release")).toBe("OWNED");

    await coordinator.stop();

    expect(mockClient.release).toHaveBeenCalledWith("app-to-release");
    expect(mockClient.clearTokens).toHaveBeenCalled();
    expect(coordinator.getTrackedAssignments()).toHaveLength(0);
  });

  it("does not hang indefinitely on stop if release times out or fails", async () => {
    vi.mocked(mockClient.discoverEligibleWork).mockResolvedValueOnce([
      { botApplicationId: "app-slow-release", claimable: true },
    ]);
    vi.mocked(mockClient.release).mockRejectedValueOnce(new Error("Network unreachable"));

    const coordinator = new AssignmentCoordinator({
      client: mockClient,
      logger: mockLogger,
      releaseTimeoutMs: 50,
    });

    await coordinator.start();
    // Stop must complete without throwing
    await expect(coordinator.stop()).resolves.toBeUndefined();
    expect(mockClient.clearTokens).toHaveBeenCalled();
  });
});
