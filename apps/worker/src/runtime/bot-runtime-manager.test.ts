import { describe, expect, it, vi, beforeEach } from "vitest";
import { createLogger } from "@creatorcore/logger";
import { BotRuntimeManager } from "./bot-runtime-manager.js";
import type { IDiscordClient } from "./discord-client.js";
import type { ControlPlaneClient } from "../client/control-plane-client.js";

class MockDiscordClient implements IDiscordClient {
  public loggedIn = false;
  public destroyed = false;
  public tokenProvided: string | null = null;
  public loginShouldFail = false;
  public loginErrorMessage = "Invalid bot token";
  public destroyShouldFail = false;
  private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  public async login(token: string): Promise<string> {
    this.tokenProvided = token;
    if (this.loginShouldFail) {
      throw new Error(this.loginErrorMessage);
    }
    this.loggedIn = true;
    setTimeout(() => {
      this.emit("ready");
    }, 10);
    return token;
  }

  public async destroy(): Promise<void> {
    if (this.destroyShouldFail) {
      throw new Error("Discord gateway close failed");
    }
    this.destroyed = true;
    this.loggedIn = false;
  }

  public isReady(): boolean {
    return this.loggedIn && !this.destroyed;
  }

  public on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
    return this;
  }

  public once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapped = (...args: unknown[]) => {
      this.removeListener(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  public removeListener(event: string, listener: (...args: unknown[]) => void): this {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
    }
    return this;
  }

  public emit(event: string, ...args: unknown[]): void {
    if (this.listeners[event]) {
      for (const listener of [...this.listeners[event]]) {
        listener(...args);
      }
    }
  }
}

interface MockControlPlaneClient {
  getActiveCredential: ReturnType<typeof vi.fn>;
  getPendingCredential: ReturnType<typeof vi.fn>;
  acknowledgeRotation: ReturnType<typeof vi.fn>;
  rejectRotation: ReturnType<typeof vi.fn>;
}

describe("BotRuntimeManager (Phase 4C Discord Gateway Runtime)", () => {
  const logger = createLogger({ service: "test-worker", write: () => undefined });
  let mockClient: MockControlPlaneClient;
  let createdClients: MockDiscordClient[];

  beforeEach(() => {
    createdClients = [];
    mockClient = {
      getActiveCredential: vi.fn(),
      getPendingCredential: vi.fn(),
      acknowledgeRotation: vi.fn(),
      rejectRotation: vi.fn(),
    };
  });

  const clientFactory = () => {
    const client = new MockDiscordClient();
    createdClients.push(client);
    return client;
  };

  it("starts active runtime on assignment OWNED by retrieving ACTIVE credential from control plane", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "active-discord-token",
      status: "ACTIVE",
    });

    await manager.handleOwnershipChange("app-1", "OWNED");

    expect(mockClient.getActiveCredential).toHaveBeenCalledWith("app-1");
    expect(manager.isRunning("app-1")).toBe(true);
    expect(createdClients).toHaveLength(1);
    expect(createdClients[0]?.tokenProvided).toBe("active-discord-token");
    expect(createdClients[0]?.isReady()).toBe(true);
  });

  it("stops and destroys active and validation runtimes when assignment state becomes UNCERTAIN", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "active-discord-token",
      status: "ACTIVE",
    });

    await manager.handleOwnershipChange("app-1", "OWNED");
    expect(manager.isRunning("app-1")).toBe(true);

    await manager.handleOwnershipChange("app-1", "UNCERTAIN");

    expect(manager.isRunning("app-1")).toBe(false);
    expect(createdClients[0]?.destroyed).toBe(true);
  });

  it("stops and destroys runtime when assignment state becomes LOST", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "active-discord-token",
      status: "ACTIVE",
    });

    await manager.handleOwnershipChange("app-1", "OWNED");
    expect(manager.isRunning("app-1")).toBe(true);

    await manager.handleOwnershipChange("app-1", "LOST");

    expect(manager.isRunning("app-1")).toBe(false);
    expect(createdClients[0]?.destroyed).toBe(true);
  });

  it("executes successful credential rotation: validates with temporary runtime, acks, swaps, and destroys old client", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    // 1. Initial ACTIVE
    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "active-token-1",
      status: "ACTIVE",
    });
    await manager.handleOwnershipChange("app-1", "OWNED");
    const oldClient = createdClients[0];
    expect(oldClient).toBeDefined();
    if (!oldClient) throw new Error("oldClient not found");
    expect(oldClient.isReady()).toBe(true);

    // 2. Rotation requested
    mockClient.getPendingCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-2",
      token: "pending-token-2",
      status: "PENDING",
    });
    mockClient.acknowledgeRotation.mockResolvedValueOnce({ ok: true });

    const result = await manager.rotateCredential("app-1", "cred-2");

    expect(result.ok).toBe(true);
    expect(mockClient.getPendingCredential).toHaveBeenCalledWith("app-1", "cred-2");
    expect(mockClient.acknowledgeRotation).toHaveBeenCalledWith("app-1", "cred-2");

    // Two clients were created
    expect(createdClients).toHaveLength(2);
    const newClient = createdClients[1];
    expect(newClient).toBeDefined();
    if (!newClient) throw new Error("newClient not found");

    // Old client destroyed
    expect(oldClient.destroyed).toBe(true);

    // New client is active
    expect(newClient.isReady()).toBe(true);
    expect(manager.getActiveRuntime("app-1")?.credentialId).toBe("cred-2");
    expect(manager.getValidationRuntime("app-1")).toBeUndefined();
  });

  it("rejects duplicate concurrent rotation requests for the same botApplicationId", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "token-1",
      status: "ACTIVE",
    });
    await manager.handleOwnershipChange("app-1", "OWNED");

    mockClient.getPendingCredential.mockImplementation(async () => {
      // simulate slow network
      await new Promise((r) => setTimeout(r, 50));
      return {
        botApplicationId: "app-1",
        credentialId: "cred-2",
        token: "token-2",
        status: "PENDING",
      };
    });
    mockClient.acknowledgeRotation.mockResolvedValue({ ok: true });

    const p1 = manager.rotateCredential("app-1", "cred-2");
    const p2 = manager.rotateCredential("app-1", "cred-2");

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1?.ok).toBe(true);
    expect(res2?.ok).toBe(false);
    expect(res2?.reason).toBe("rotation_in_progress");
  });

  it("handles pending login failure: destroys validation runtime, notifies control plane reject, keeps old runtime", async () => {
    let callCount = 0;
    const failingClientFactory = () => {
      callCount += 1;
      const client = new MockDiscordClient();
      if (callCount === 2) {
        client.loginShouldFail = true;
        client.loginErrorMessage = "401: Unauthorized bot token";
      }
      createdClients.push(client);
      return client;
    };

    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory: failingClientFactory,
    });

    // 1. Initial ACTIVE
    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "active-token-1",
      status: "ACTIVE",
    });
    await manager.handleOwnershipChange("app-1", "OWNED");
    const oldClient = createdClients[0];
    expect(oldClient).toBeDefined();
    if (!oldClient) throw new Error("oldClient not found");
    expect(oldClient.isReady()).toBe(true);

    // 2. Pending rotation
    mockClient.getPendingCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-bad",
      token: "bad-token",
      status: "PENDING",
    });
    mockClient.rejectRotation.mockResolvedValueOnce({ ok: true });

    const result = await manager.rotateCredential("app-1", "cred-bad");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("validation_failed");
    expect(mockClient.rejectRotation).toHaveBeenCalledWith(
      "app-1",
      "cred-bad",
      expect.stringContaining("401"),
    );

    // Old client is STILL intact and connected
    expect(oldClient.destroyed).toBe(false);
    expect(oldClient.isReady()).toBe(true);
    expect(manager.getActiveRuntime("app-1")?.credentialId).toBe("cred-1");
  });

  it("handles acknowledgement rejection by control plane: destroys validation runtime and keeps old runtime", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "active-token-1",
      status: "ACTIVE",
    });
    await manager.handleOwnershipChange("app-1", "OWNED");
    const oldClient = createdClients[0];
    expect(oldClient).toBeDefined();
    if (!oldClient) throw new Error("oldClient not found");

    mockClient.getPendingCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-2",
      token: "pending-token-2",
      status: "PENDING",
    });
    // Control plane says acknowledgement failed (e.g. lease expired or stale)
    mockClient.acknowledgeRotation.mockResolvedValueOnce({
      ok: false,
      reason: "acknowledgement_stale",
    });

    const result = await manager.rotateCredential("app-1", "cred-2");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("acknowledgement_stale");

    // Validation client was destroyed
    const validationClient = createdClients[1];
    expect(validationClient).toBeDefined();
    if (!validationClient) throw new Error("validationClient not found");
    expect(validationClient.destroyed).toBe(true);

    // Old client is STILL active
    expect(oldClient.destroyed).toBe(false);
    expect(oldClient.isReady()).toBe(true);
    expect(manager.getActiveRuntime("app-1")?.credentialId).toBe("cred-1");
  });

  it("recovers from process restart by converging on database ACTIVE truth without local state", async () => {
    // Simulate crash and restart: a new manager instance starts fresh
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    // Control plane returns the promoted credential as ACTIVE in DB
    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "promoted-cred-after-crash",
      token: "new-promoted-token",
      status: "ACTIVE",
    });

    // Worker claims or recovers assignment
    await manager.handleOwnershipChange("app-1", "OWNED");

    expect(manager.isRunning("app-1")).toBe(true);
    expect(manager.getActiveRuntime("app-1")?.credentialId).toBe("promoted-cred-after-crash");
    expect(createdClients[0]?.tokenProvided).toBe("new-promoted-token");
  });

  it("survives old runtime destruction errors without crashing the manager", async () => {
    let count = 0;
    const clientFactoryWithDestroyError = () => {
      count += 1;
      const client = new MockDiscordClient();
      if (count === 1) {
        client.destroyShouldFail = true;
      }
      createdClients.push(client);
      return client;
    };

    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory: clientFactoryWithDestroyError,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "tok-1",
      status: "ACTIVE",
    });
    await manager.handleOwnershipChange("app-1", "OWNED");

    mockClient.getPendingCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-2",
      token: "tok-2",
      status: "PENDING",
    });
    mockClient.acknowledgeRotation.mockResolvedValueOnce({ ok: true });

    // Rotate should succeed even if old client throws in destroy
    const res = await manager.rotateCredential("app-1", "cred-2");
    expect(res.ok).toBe(true);
    expect(manager.getActiveRuntime("app-1")?.credentialId).toBe("cred-2");
  });

  it("stops all active and validation runtimes cleanly on stopAll()", async () => {
    const manager = new BotRuntimeManager({
      client: mockClient as unknown as ControlPlaneClient,
      logger,
      clientFactory,
    });

    mockClient.getActiveCredential.mockResolvedValueOnce({
      botApplicationId: "app-1",
      credentialId: "cred-1",
      token: "tok-1",
      status: "ACTIVE",
    });
    await manager.handleOwnershipChange("app-1", "OWNED");

    await manager.stopAll();

    expect(manager.isRunning("app-1")).toBe(false);
    expect(createdClients[0]?.destroyed).toBe(true);
  });
});
