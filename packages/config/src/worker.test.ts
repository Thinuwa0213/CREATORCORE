import { describe, expect, it } from "vitest";
import { loadWorkerConfig, workerConfigSchema } from "./worker.js";

describe("loadWorkerConfig", () => {
  it("accepts an empty environment by applying defaults", () => {
    const config = loadWorkerConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.API_BASE_URL).toBe("http://localhost:8787");
    expect(config.WORKER_ID).toBeUndefined();
  });

  it("rejects a malformed API_BASE_URL", () => {
    expect(() => loadWorkerConfig({ API_BASE_URL: "not-a-url" })).toThrow();
  });

  it("never requires database credentials — apps/worker must not hold them", () => {
    const fieldNames = Object.keys(workerConfigSchema.shape);
    expect(fieldNames.some((name) => name.startsWith("DB_"))).toBe(false);
  });

  it("never exposes WORKER_TOKEN_SIGNING_KEY — the worker receives only an issued access token, never the signing key (docs/adr/0011)", () => {
    const fieldNames = Object.keys(workerConfigSchema.shape);
    expect(fieldNames).not.toContain("WORKER_TOKEN_SIGNING_KEY");

    const config = loadWorkerConfig({ WORKER_TOKEN_SIGNING_KEY: "e".repeat(32) });
    expect(config).not.toHaveProperty("WORKER_TOKEN_SIGNING_KEY");
  });

  it("loads WORKER_BOOTSTRAP_SECRET and WORKER_ID when provided", () => {
    const config = loadWorkerConfig({
      WORKER_ID: "worker-1",
      WORKER_BOOTSTRAP_SECRET: "secret-abc-123",
    });
    expect(config.WORKER_ID).toBe("worker-1");
    expect(config.WORKER_BOOTSTRAP_SECRET).toBe("secret-abc-123");
  });

  it("never exposes DATABASE_URL — apps/worker must not hold database credentials", () => {
    const fieldNames = Object.keys(workerConfigSchema.shape);
    expect(fieldNames).not.toContain("DATABASE_URL");

    const config = loadWorkerConfig({ DATABASE_URL: "mysql://leak@localhost:3306/db" });
    expect(config).not.toHaveProperty("DATABASE_URL");
  });
});

