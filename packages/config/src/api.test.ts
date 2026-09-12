import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./api.js";
import { ConfigValidationError } from "./errors.js";

const VALID_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  PORT: "8787",
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_NAME: "creatorcore_test",
  DB_USER: "creatorcore",
  DB_PASSWORD: "s3cr3t-password",
  DB_CONNECTION_LIMIT: "5",
};

describe("loadApiConfig", () => {
  it("accepts a fully valid environment", () => {
    const config = loadApiConfig(VALID_ENV);
    expect(config.DB_HOST).toBe("127.0.0.1");
    expect(config.PORT).toBe(8787);
    expect(config.DB_PORT).toBe(3306);
  });

  it("throws when a required variable is missing", () => {
    const { DB_PASSWORD: _DB_PASSWORD, ...rest } = VALID_ENV;
    expect(() => loadApiConfig(rest)).toThrow(ConfigValidationError);
  });

  it("throws when a variable is malformed", () => {
    expect(() => loadApiConfig({ ...VALID_ENV, DB_PORT: "not-a-number" })).toThrow(
      ConfigValidationError,
    );
  });

  it("never includes the secret value in the thrown error message", () => {
    const secretValue = "super-secret-db-password-xyz";
    try {
      loadApiConfig({ ...VALID_ENV, DB_PASSWORD: "" });
      expect.unreachable("expected loadApiConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).not.toContain(secretValue);
      expect((error as Error).message).toContain("DB_PASSWORD");
    }
  });

  it("applies defaults for optional fields", () => {
    const {
      LOG_LEVEL: _LOG_LEVEL,
      PORT: _PORT,
      DB_CONNECTION_LIMIT: _DB_CONNECTION_LIMIT,
      ...rest
    } = VALID_ENV;
    const config = loadApiConfig(rest);
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.PORT).toBe(8787);
    expect(config.DB_CONNECTION_LIMIT).toBe(10);
  });
});
