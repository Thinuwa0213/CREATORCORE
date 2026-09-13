import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { isTestHarnessEnabled } from "../../src/routes/internal/test-harness.js";
import { createLogger } from "@creatorcore/logger";
import type { DatabaseClient } from "@creatorcore/db";

describe("Test Harness Boundary Gate (Amendment 1 & 4)", () => {
  const logger = createLogger({ service: "test-harness-gate", write: () => undefined });
  const mockDb = {} as DatabaseClient["db"];
  const signingKeys = { current: "test-key-32-chars-minimum-length!", currentVersion: 1 };

  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Start from clean state
    delete process.env.ENABLE_E2E_TEST_HARNESS;
    delete process.env.USE_FAKE_DISCORD;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("evaluates isTestHarnessEnabled to false when ENABLE_E2E_TEST_HARNESS is missing", () => {
    process.env.NODE_ENV = "test";
    process.env.USE_FAKE_DISCORD = "true";
    delete process.env.ENABLE_E2E_TEST_HARNESS;

    expect(isTestHarnessEnabled()).toBe(false);
  });

  it("evaluates isTestHarnessEnabled to false when USE_FAKE_DISCORD is not true", () => {
    process.env.NODE_ENV = "test";
    process.env.USE_FAKE_DISCORD = "false";
    process.env.ENABLE_E2E_TEST_HARNESS = "true";

    expect(isTestHarnessEnabled()).toBe(false);
  });

  it("evaluates isTestHarnessEnabled to false when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    process.env.USE_FAKE_DISCORD = "true";
    process.env.ENABLE_E2E_TEST_HARNESS = "true";

    expect(isTestHarnessEnabled()).toBe(false);
  });

  it("strictly returns 404 for /internal/test/session when harness is disabled (route is not mounted)", async () => {
    process.env.NODE_ENV = "test";
    process.env.USE_FAKE_DISCORD = "true";
    delete process.env.ENABLE_E2E_TEST_HARNESS;

    const app = createApp({
      logger,
      db: mockDb,
      signingKeys,
      checkDatabaseReady: async () => true,
    });

    const res = await app.request("/internal/test/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId: "123456789" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("strictly returns 404 for /internal/test/discord/guilds when harness is disabled", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.USE_FAKE_DISCORD;
    delete process.env.ENABLE_E2E_TEST_HARNESS;

    const app = createApp({
      logger,
      db: mockDb,
      signingKeys,
      checkDatabaseReady: async () => true,
    });

    const res = await app.request("/internal/test/discord/guilds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId: "123456789", guilds: [] }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("mounts /internal/test strictly when ALL THREE conditions are true", async () => {
    process.env.NODE_ENV = "test";
    process.env.USE_FAKE_DISCORD = "true";
    process.env.ENABLE_E2E_TEST_HARNESS = "true";

    expect(isTestHarnessEnabled()).toBe(true);

    const app = createApp({
      logger,
      db: mockDb,
      signingKeys,
      checkDatabaseReady: async () => true,
    });

    // Request without body should return 400 (from within the mounted handler), NOT 404
    const res = await app.request("/internal/test/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_DISCORD_USER_ID" });
  });
});
