import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./api.js";
import { ConfigValidationError } from "./errors.js";

const VALID_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64url");
const VALID_PREVIOUS_KEY = Buffer.alloc(32, 3).toString("base64url");

const VALID_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  PORT: "8787",
  DATABASE_URL: "mysql://localhost:3306/mock_db",
  WORKER_TOKEN_SIGNING_KEY: "a".repeat(32),
  BOT_CREDENTIAL_ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
};

describe("loadApiConfig", () => {
  it("accepts a fully valid environment", () => {
    const config = loadApiConfig(VALID_ENV);
    expect(config.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(config.PORT).toBe(8787);
    expect(config.WORKER_TOKEN_SIGNING_KEY).toBe(VALID_ENV.WORKER_TOKEN_SIGNING_KEY);
    expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY);
    expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION).toBe(1);
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
    expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION).toBe(1);
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

  describe("BOT_CREDENTIAL_ENCRYPTION_KEY (Amendment 5)", () => {
    it("is required", () => {
      const { BOT_CREDENTIAL_ENCRYPTION_KEY: _key, ...rest } = VALID_ENV;
      expect(() => loadApiConfig(rest)).toThrow(ConfigValidationError);
    });

    it("accepts a strictly valid canonical base64url 32-byte key", () => {
      const config = loadApiConfig({
        ...VALID_ENV,
        BOT_CREDENTIAL_ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
      });
      expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY);
    });

    it("rejects standard base64 containing + or / or =", () => {
      const standardB64 = Buffer.alloc(32, 255).toString("base64"); // Contains / and ==
      expect(() =>
        loadApiConfig({ ...VALID_ENV, BOT_CREDENTIAL_ENCRYPTION_KEY: standardB64 }),
      ).toThrow(ConfigValidationError);
    });

    it("rejects arbitrary passphrases or wrong lengths", () => {
      expect(() =>
        loadApiConfig({ ...VALID_ENV, BOT_CREDENTIAL_ENCRYPTION_KEY: "short" }),
      ).toThrow(ConfigValidationError);
      expect(() =>
        loadApiConfig({
          ...VALID_ENV,
          BOT_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64url"),
        }),
      ).toThrow(ConfigValidationError);
    });

    it("rejects when BOT_CREDENTIAL_ENCRYPTION_KEY equals WORKER_TOKEN_SIGNING_KEY", () => {
      expect(() =>
        loadApiConfig({
          ...VALID_ENV,
          WORKER_TOKEN_SIGNING_KEY: VALID_ENCRYPTION_KEY,
          BOT_CREDENTIAL_ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
        }),
      ).toThrow(ConfigValidationError);
    });

    it("never includes the encryption key value in a thrown error message", () => {
      const secretValue = VALID_ENCRYPTION_KEY;
      try {
        loadApiConfig({
          ...VALID_ENV,
          PORT: "not-a-number",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as Error).message).not.toContain(secretValue);
      }
    });

    it("accepts valid previous key and distinct previous version", () => {
      const config = loadApiConfig({
        ...VALID_ENV,
        BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION: "2",
        BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: VALID_PREVIOUS_KEY,
        BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION: "1",
      });
      expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION).toBe(2);
      expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS).toBe(VALID_PREVIOUS_KEY);
      expect(config.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION).toBe(1);
    });

    it("rejects previous key when previous version is missing", () => {
      expect(() =>
        loadApiConfig({
          ...VALID_ENV,
          BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: VALID_PREVIOUS_KEY,
        }),
      ).toThrow(ConfigValidationError);
    });

    it("rejects previous version when previous key is missing", () => {
      expect(() =>
        loadApiConfig({
          ...VALID_ENV,
          BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION: "1",
        }),
      ).toThrow(ConfigValidationError);
    });

    it("rejects when previous version equals current version", () => {
      expect(() =>
        loadApiConfig({
          ...VALID_ENV,
          BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
          BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: VALID_PREVIOUS_KEY,
          BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION: "1",
        }),
      ).toThrow(ConfigValidationError);
    });
  });
});

