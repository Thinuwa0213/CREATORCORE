import { describe, expect, it } from "vitest";
import * as bareConfig from "./index.js";
import { loadWorkerConfig } from "./worker.js";
import { loadWebConfig } from "./web.js";
import { loadApiConfig } from "./api.js";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64url");

describe("Credential encryption key configuration boundary", () => {
  it("bare @creatorcore/config entry point does NOT export apiConfigSchema or loadApiConfig", () => {
    expect("apiConfigSchema" in bareConfig).toBe(false);
    expect("loadApiConfig" in bareConfig).toBe(false);
  });

  it("apps/worker cannot load BOT_CREDENTIAL_ENCRYPTION_KEY", () => {
    const workerConfig = loadWorkerConfig({
      WORKER_ID: "worker-123",
      WORKER_BOOTSTRAP_SECRET: "s3cr3t".repeat(6),
      BOT_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
    });

    expect(
      (workerConfig as unknown as Record<string, unknown>).BOT_CREDENTIAL_ENCRYPTION_KEY,
    ).toBeUndefined();
  });

  it("apps/web cannot load BOT_CREDENTIAL_ENCRYPTION_KEY", () => {
    const webConfig = loadWebConfig({
      BOT_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
    });

    expect(
      (webConfig as unknown as Record<string, unknown>).BOT_CREDENTIAL_ENCRYPTION_KEY,
    ).toBeUndefined();
  });

  it("only api configuration can access BOT_CREDENTIAL_ENCRYPTION_KEY", () => {
    const apiConfig = loadApiConfig({
      DATABASE_URL: "mysql://localhost:3306/db",
      WORKER_TOKEN_SIGNING_KEY: "w".repeat(32),
      BOT_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
    });

    expect(apiConfig.BOT_CREDENTIAL_ENCRYPTION_KEY).toBe(VALID_KEY);
  });
});
