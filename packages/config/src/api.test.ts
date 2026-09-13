import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./api.js";
import { ConfigValidationError } from "./errors.js";

const VALID_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  PORT: "8787",
  DATABASE_URL: "mysql://creatorcore:s3cr3t-password@127.0.0.1:3306/creatorcore_test",
  WORKER_TOKEN_SIGNING_KEY: "a".repeat(32),
};

describe("loadApiConfig", () => {
  it("accepts a fully valid environment", () => {
    const config = loadApiConfig(VALID_ENV);
    expect(config.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(config.PORT).toBe(8787);
    expect(config.WORKER_TOKEN_SIGNING_KEY).toBe(VALID_ENV.WORKER_TOKEN_SIGNING_KEY);
  });

  it("throws when a required variable is missing", () => {
    const { DATABASE_URL: _DATABASE_URL, ...rest } = VALID_ENV;
    expect(() => loadApiConfig(rest)).toThrow(ConfigValidationError);
  });

  it("throws when a variable is malformed", () => {
    expect(() => loadApiConfig({ ...VALID_ENV, PORT: "not-a-number" })).toThrow(
      ConfigValidationError,
    );
  });

  it("never includes the secret value in the thrown error message", () => {
    const secretValue = "super-secret-db-password-xyz";
    try {
      loadApiConfig({ ...VALID_ENV, DATABASE_URL: "" });
      expect.unreachable("expected loadApiConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).not.toContain(secretValue);
      expect((error as Error).message).toContain("DATABASE_URL");
    }
  });

  it("applies defaults for optional fields", () => {
    const { LOG_LEVEL: _LOG_LEVEL, PORT: _PORT, ...rest } = VALID_ENV;
    const config = loadApiConfig(rest);
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.PORT).toBe(8787);
    expect(config.WORKER_TOKEN_SIGNING_KEY_VERSION).toBe(1);
  });

  describe("WORKER_TOKEN_SIGNING_KEY (docs/adr/0011)", () => {
    it("is required", () => {
      const { WORKER_TOKEN_SIGNING_KEY: _key, ...rest } = VALID_ENV;
      expect(() => loadApiConfig(rest)).toThrow(ConfigValidationError);
    });

    it("rejects a key shorter than 32 characters", () => {
      expect(() =>
        loadApiConfig({ ...VALID_ENV, WORKER_TOKEN_SIGNING_KEY: "too-short" }),
      ).toThrow(ConfigValidationError);
    });

    it("never includes the signing key value in a thrown error message", () => {
      const secretValue = "b".repeat(40);
      try {
        loadApiConfig({ ...VALID_ENV, WORKER_TOKEN_SIGNING_KEY: "short", PORT: "not-a-number" });
        expect.unreachable("expected loadApiConfig to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as Error).message).not.toContain(secretValue);
      }
    });

    it("accepts an optional previous key for rotation, and a custom version", () => {
      const config = loadApiConfig({
        ...VALID_ENV,
        WORKER_TOKEN_SIGNING_KEY_VERSION: "2",
        WORKER_TOKEN_SIGNING_KEY_PREVIOUS: "c".repeat(32),
      });
      expect(config.WORKER_TOKEN_SIGNING_KEY_VERSION).toBe(2);
      expect(config.WORKER_TOKEN_SIGNING_KEY_PREVIOUS).toBe("c".repeat(32));
    });

    it("leaves WORKER_TOKEN_SIGNING_KEY_PREVIOUS undefined when not set", () => {
      const config = loadApiConfig(VALID_ENV);
      expect(config.WORKER_TOKEN_SIGNING_KEY_PREVIOUS).toBeUndefined();
    });
  });
});
