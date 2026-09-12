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
});
