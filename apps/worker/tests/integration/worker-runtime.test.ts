import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "@creatorcore/config/database";
import {
  createBotApplication,
  createDatabaseClient,
  createTenant,
  provisionWorker,
  revokeWorker,
  checkDatabaseConnectivity,
  type DatabaseClient,
} from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { createApp } from "@creatorcore/api/app";
import { CredentialService } from "@creatorcore/api/services/credential-service";
import { DiscordValidator } from "@creatorcore/api/services/discord-validator";
import {
  ControlPlaneClient,
  WorkerAuthRevokedError,
} from "../../src/client/control-plane-client.js";
import { AssignmentCoordinator } from "../../src/runtime/assignment-coordinator.js";
import { BotRuntimeManager } from "../../src/runtime/bot-runtime-manager.js";
import type { IDiscordClient } from "../../src/runtime/discord-client.js";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(fileURLToPath(import.meta.url), "../../../../../.env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const SIGNING_KEYS = {
  current: "integration-test-signing-key-minimum-32-chars-long!",
  currentVersion: 1,
};

const ENCRYPTION_KEYS = {
  keyDomain: "bot_credential" as const,
  current: randomBytes(32),
  currentVersion: 1,
};

async function probeDatabase(): Promise<boolean> {
  try {
    const client = createDatabaseClient(loadDatabaseConfig());
    const ok = await checkDatabaseConnectivity(client.pool);
    await client.close();
    return ok;
  } catch {
    return false;
  }
}

const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[apps/worker] worker-runtime integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("Worker Runtime Real HTTP Integration (Phase 4A)", () => {
  let dbClient: DatabaseClient;
  let server: Server;
  let apiBaseUrl: string;

  const prefix = `p4a-rt-${Date.now().toString(36)}`;
  const workerAId = `${prefix}-wA`;
  const workerBId = `${prefix}-wB`;
  let secretA: string;

  let tenantId: string;
  let botApp1Id: string;
  let botAppRaceId: string;

  let clientA: ControlPlaneClient;
  let clientB: ControlPlaneClient;
  let credentialService: CredentialService;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());

    const testLogger = createLogger({
      service: "apps/worker-integration-test",
      write: () => undefined,
    });

    const discordValidator = new DiscordValidator({
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ id: "1234567890", username: "TestBot" }),
        }) as unknown as Response,
    });

    credentialService = new CredentialService({
      db: dbClient.db,
      logger: testLogger,
      keys: ENCRYPTION_KEYS,
      validator: discordValidator,
    });

    const app = createApp({
      logger: testLogger,
      db: dbClient.db,
      signingKeys: SIGNING_KEYS,
      credentialService,
      checkDatabaseReady: async () => true,
    });

    // Spin up real HTTP server listening on an ephemeral port (Amendment 4)
    server = serve({ fetch: app.fetch, port: 0 }) as unknown as Server;
    const address = server.address() as AddressInfo;
    apiBaseUrl = `http://127.0.0.1:${address.port}`;

    // Provision workers in database
    const pA = await provisionWorker(dbClient.db, workerAId);
    const pB = await provisionWorker(dbClient.db, workerBId);
    secretA = pA.bootstrapSecret;

    // Create tenant and bot applications
    const tenant = await createTenant(dbClient.db, `${prefix}-tenant`);
    tenantId = tenant.id;

    const baseSnowflake = BigInt(Date.now()) * 1000n;
    // Both workers are active, so assignEligibleWorkers assigns both to both bot apps
    const b1 = await createBotApplication(
      dbClient.db,
      tenantId,
      baseSnowflake + 1n,
      `${prefix}-bot1`,
    );
    botApp1Id = b1.id;

    const b2 = await createBotApplication(
      dbClient.db,
      tenantId,
      baseSnowflake + 2n,
      `${prefix}-bot-race`,
    );
    botAppRaceId = b2.id;

    // Real ControlPlaneClient instances pointing to the live test server
    clientA = new ControlPlaneClient({
      apiBaseUrl,
      workerId: workerAId,
      bootstrapSecret: pA.bootstrapSecret,
      logger: testLogger,
      requestTimeoutMs: 3000,
    });

    clientB = new ControlPlaneClient({
      apiBaseUrl,
      workerId: workerBId,
      bootstrapSecret: pB.bootstrapSecret,
      logger: testLogger,
      requestTimeoutMs: 3000,
    });
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (dbClient) {
      await dbClient.pool.query("DELETE FROM tenants WHERE id = ?", [tenantId]);
      await dbClient.pool.query("DELETE FROM workers WHERE id IN (?, ?)", [workerAId, workerBId]);
      await dbClient.close();
    }
  });

  // Scenario 1: Worker authenticates
  it("1. worker authenticates with bootstrap secret over real HTTP", async () => {
    expect(clientA.hasToken()).toBe(false);
    const token = await clientA.authenticate();
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(clientA.hasToken()).toBe(true);
  });

  // Scenario 2: Discovers only authorized work
  it("2. discovers only authorized work over real HTTP", async () => {
    const work = await clientA.discoverEligibleWork();
    const ids = work.map((w) => w.botApplicationId);
    expect(ids).toContain(botApp1Id);
    expect(ids).toContain(botAppRaceId);
    // Verified capability-oriented shape: no worker ID or foreign lease info leaked
    for (const item of work) {
      expect(item).toHaveProperty("botApplicationId");
      expect(item).toHaveProperty("claimable", true);
      expect(item).not.toHaveProperty("workerId");
      expect(item).not.toHaveProperty("leaseExpiresAt");
    }
  });

  // Scenario 3: Claims assignment
  it("3. claims assignment over real HTTP", async () => {
    const claimRes = await clientA.claim(botApp1Id);
    expect(claimRes.ok).toBe(true);
    if (claimRes.ok) {
      expect(claimRes.leaseExpiresAt).toBeDefined();
    }
  });

  // Scenario 4: Renews assignment
  it("4. renews assignment over real HTTP", async () => {
    const renewRes = await clientA.renew(botApp1Id);
    expect(renewRes.ok).toBe(true);
  });

  // Scenario 5: /current confirms ownership
  it("5. /current confirms ownership over real HTTP", async () => {
    const assignments = await clientA.getCurrentAssignments();
    const ids = assignments.map((a) => a.botApplicationId);
    expect(ids).toContain(botApp1Id);
  });

  // Scenario 6: Revoked worker loses authenticated control-plane access
  it("6. revoked worker loses authenticated control-plane access (401 / WorkerAuthRevokedError)", async () => {
    // Provision a temporary worker and revoke it
    const tempWorkerId = `${prefix}-revoked`;
    const pTemp = await provisionWorker(dbClient.db, tempWorkerId);

    const revokedClient = new ControlPlaneClient({
      apiBaseUrl,
      workerId: tempWorkerId,
      bootstrapSecret: pTemp.bootstrapSecret,
      logger: createLogger({ service: "test", write: () => undefined }),
    });

    // Obtains token while active
    await revokedClient.authenticate();
    expect(revokedClient.hasToken()).toBe(true);

    // Revoke in database
    await revokeWorker(dbClient.db, tempWorkerId);

    // Next request must fail with WorkerAuthRevokedError and token must be wiped
    await expect(revokedClient.discoverEligibleWork()).rejects.toThrow(WorkerAuthRevokedError);
    expect(revokedClient.hasToken()).toBe(false);

    await dbClient.pool.query("DELETE FROM workers WHERE id = ?", [tempWorkerId]);
  });

  // Scenario 7 & 8: Two workers race for one claim, exactly one wins; losing worker does not track ownership
  it("7 & 8. two workers race for one claim: exactly one wins, loser does not track ownership", async () => {
    const [resA, resB] = await Promise.all([
      clientA.claim(botAppRaceId),
      clientB.claim(botAppRaceId),
    ]);

    // Exactly one must succeed, exactly one must fail
    const results = [resA.ok, resB.ok];
    expect(results.filter((ok) => ok === true)).toHaveLength(1);
    expect(results.filter((ok) => ok === false)).toHaveLength(1);

    const winnerClient = resA.ok ? clientA : clientB;
    const loserClient = resA.ok ? clientB : clientA;

    // Verify winner has it in /current
    const winnerAssignments = await winnerClient.getCurrentAssignments();
    expect(winnerAssignments.map((a) => a.botApplicationId)).toContain(botAppRaceId);

    // Verify loser does NOT have it in /current
    const loserAssignments = await loserClient.getCurrentAssignments();
    expect(loserAssignments.map((a) => a.botApplicationId)).not.toContain(botAppRaceId);
  });

  // Scenario 9: Graceful release allows another eligible worker to acquire the assignment
  it("9. graceful release allows another eligible worker to acquire the assignment", async () => {
    // Determine who owns botAppRaceId currently
    const currA = await clientA.getCurrentAssignments();
    const aOwns = currA.some((a) => a.botApplicationId === botAppRaceId);
    const owner = aOwns ? clientA : clientB;
    const nonOwner = aOwns ? clientB : clientA;

    // Owner releases
    const releaseRes = await owner.release(botAppRaceId);
    expect(releaseRes.ok).toBe(true);

    // Non-owner can now claim it
    const claimRes = await nonOwner.claim(botAppRaceId);
    expect(claimRes.ok).toBe(true);

    // Clean up
    await nonOwner.release(botAppRaceId);
    await clientA.release(botApp1Id);
  });

  // Scenario 10: Ambiguous network failure transitions runtime ownership to UNCERTAIN rather than assuming ownership
  it("10. ambiguous network failure transitions runtime ownership to UNCERTAIN, suspending privileged activity (Amendment 2)", async () => {
    const testLogger = createLogger({
      service: "apps/worker-uncertain-test",
      write: () => undefined,
    });
    const coordinator = new AssignmentCoordinator({
      client: clientA,
      logger: testLogger,
      renewalIntervalMs: 60_000,
      reconciliationIntervalMs: 10_000,
    });

    // Worker A claims botApp1Id
    await clientA.claim(botApp1Id);
    coordinator["setOwnershipState"](botApp1Id, "OWNED");
    expect(coordinator.isPrivilegedActivityAllowed(botApp1Id)).toBe(true);

    // Create client pointing to a closed/unreachable port to simulate network failure
    const brokenClient = new ControlPlaneClient({
      apiBaseUrl: "http://127.0.0.1:1", // guaranteed connection refused
      workerId: workerAId,
      bootstrapSecret: secretA,
      logger: testLogger,
      requestTimeoutMs: 300,
      maxRetries: 1,
      baseBackoffMs: 1,
    });

    const coordinatorWithBrokenClient = new AssignmentCoordinator({
      client: brokenClient,
      logger: testLogger,
    });
    // Set running to true and seed with OWNED
    coordinatorWithBrokenClient["running"] = true;
    coordinatorWithBrokenClient["setOwnershipState"](botApp1Id, "OWNED");
    expect(coordinatorWithBrokenClient.isPrivilegedActivityAllowed(botApp1Id)).toBe(true);

    // Attempt renewal through broken network
    await coordinatorWithBrokenClient.attemptRenewal(botApp1Id);

    // MUST transition to UNCERTAIN, and isPrivilegedActivityAllowed MUST return false
    expect(coordinatorWithBrokenClient.getAssignmentState(botApp1Id)).toBe("UNCERTAIN");
    expect(coordinatorWithBrokenClient.isPrivilegedActivityAllowed(botApp1Id)).toBe(false);

    await coordinatorWithBrokenClient.stop();
    await coordinator.stop();
    await clientA.release(botApp1Id);
  });

  describe("Phase 4B/4C: Credential Delivery, Rotation, and Discord Runtime over Real HTTP", () => {
    class IntegrationMockClient implements IDiscordClient {
      public loggedIn = false;
      public destroyed = false;
      public tokenProvided: string | null = null;
      private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

      public async login(token: string): Promise<string> {
        this.tokenProvided = token;
        this.loggedIn = true;
        setTimeout(() => {
          this.emit("ready");
        }, 10);
        return token;
      }

      public async destroy(): Promise<void> {
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

    it("delivers decrypted credential to claiming worker and runs Discord gateway lifecycle through rotation", async () => {
      const testLogger = createLogger({ service: "apps/worker-cred-test", write: () => undefined });
      const clientsCreated: IntegrationMockClient[] = [];
      const clientFactory = () => {
        const c = new IntegrationMockClient();
        clientsCreated.push(c);
        return c;
      };

      // 1. Store initial active credential in MySQL
      const initialToken = "initial-bot-token-12345";
      const initialCred = await credentialService.storeInitialCredential(botApp1Id, initialToken);
      expect(initialCred.credentialId).toBeDefined();

      // 2. Worker A claims the assignment
      const claimResult = await clientA.claim(botApp1Id);
      expect(claimResult.ok).toBe(true);

      // 3. Worker A starts BotRuntimeManager
      const manager = new BotRuntimeManager({
        client: clientA,
        logger: testLogger,
        clientFactory,
      });

      await manager.handleOwnershipChange(botApp1Id, "OWNED");

      expect(manager.isRunning(botApp1Id)).toBe(true);
      expect(clientsCreated).toHaveLength(1);
      const activeClient1 = clientsCreated[0];
      expect(activeClient1).toBeDefined();
      if (!activeClient1) throw new Error("activeClient1 not found");
      expect(activeClient1.tokenProvided).toBe(initialToken);
      expect(activeClient1.isReady()).toBe(true);

      // 4. Control plane initiates a credential rotation in MySQL
      const rotationToken = "rotated-bot-token-67890";
      const rotation = await credentialService.requestCredentialRotation(botApp1Id, rotationToken);
      if (!rotation.ok) {
        throw new Error(`Rotation request failed: ${rotation.reason}`);
      }
      expect(rotation.credentialId).toBeDefined();

      // 5. Worker executes rotation
      const rotateResult = await manager.rotateCredential(botApp1Id, rotation.credentialId);
      expect(rotateResult.ok).toBe(true);

      // Verify two clients were created
      expect(clientsCreated).toHaveLength(2);
      const activeClient2 = clientsCreated[1];
      expect(activeClient2).toBeDefined();
      if (!activeClient2) throw new Error("activeClient2 not found");

      // Old client must be destroyed
      expect(activeClient1.destroyed).toBe(true);
      // New client must be active and ready
      expect(activeClient2.isReady()).toBe(true);
      expect(activeClient2.tokenProvided).toBe(rotationToken);

      // 6. Verify database truth in MySQL:
      // The promoted credential is ACTIVE, and superseded credential was deleted
      const activeFromDb = await clientA.getActiveCredential(botApp1Id);
      expect(activeFromDb?.credentialId).toBe(rotation.credentialId);
      expect(activeFromDb?.token).toBe(rotationToken);

      // 7. Verify crash-recovery convergence:
      // Worker restarts with a completely clean manager (no memory state)
      const restartedManager = new BotRuntimeManager({
        client: clientA,
        logger: testLogger,
        clientFactory,
      });

      await restartedManager.handleOwnershipChange(botApp1Id, "OWNED");
      expect(restartedManager.isRunning(botApp1Id)).toBe(true);
      expect(restartedManager.getActiveRuntime(botApp1Id)?.credentialId).toBe(
        rotation.credentialId,
      );

      // Cleanup
      await manager.stopAll();
      await restartedManager.stopAll();
      await clientA.release(botApp1Id);
    });
  });
});
