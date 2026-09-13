import { describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "./database.js";
import { ConfigValidationError } from "./errors.js";

const VALID_URL = "mysql://creatorcore:s3cr3t-password@127.0.0.1:3306/creatorcore_test";

describe("loadDatabaseConfig", () => {
  it("accepts a valid MySQL DATABASE_URL", () => {
    const config = loadDatabaseConfig({ DATABASE_URL: VALID_URL });
    expect(config.DATABASE_URL).toBe(VALID_URL);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadDatabaseConfig({})).toThrow(ConfigValidationError);
  });

  it("rejects a malformed URL", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: "not a url" })).toThrow(ConfigValidationError);
  });

  it("rejects a non-MySQL protocol", () => {
    expect(() =>
      loadDatabaseConfig({
        DATABASE_URL: "postgres://creatorcore:password@127.0.0.1:5432/creatorcore_test",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects a URL with no database name in its path", () => {
    expect(() =>
      loadDatabaseConfig({ DATABASE_URL: "mysql://creatorcore:password@127.0.0.1:3306" }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects a URL with no host", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: "mysql:///creatorcore_test" })).toThrow(
      ConfigValidationError,
    );
  });

  it("rejects an out-of-range port", () => {
    expect(() =>
      loadDatabaseConfig({ DATABASE_URL: "mysql://127.0.0.1:99999/creatorcore_test" }),
    ).toThrow(ConfigValidationError);
  });

  it("accepts a URL with no userinfo (credentials supplied another way, e.g. IAM/socket auth)", () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: "mysql://127.0.0.1:3306/creatorcore_test",
    });
    expect(config.DATABASE_URL).toBe("mysql://127.0.0.1:3306/creatorcore_test");
  });

  it("never includes the supplied password, or the complete URL, in the thrown error", () => {
    const secretValue = "super-secret-db-password-xyz";
    const url = `mysql://creatorcore:${secretValue}@127.0.0.1:3306`; // missing db name -> rejected
    try {
      loadDatabaseConfig({ DATABASE_URL: url });
      expect.unreachable("expected loadDatabaseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const message = (error as Error).message;
      expect(message).not.toContain(secretValue);
      expect(message).not.toContain(url);
      expect(message).toContain("DATABASE_URL");
    }
  });

  it("never includes the password when the protocol itself is rejected", () => {
    const secretValue = "another-secret-value";
    const url = `postgres://creatorcore:${secretValue}@127.0.0.1:5432/creatorcore_test`;
    try {
      loadDatabaseConfig({ DATABASE_URL: url });
      expect.unreachable("expected loadDatabaseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const message = (error as Error).message;
      expect(message).not.toContain(secretValue);
      expect(message).not.toContain(url);
    }
  });

  it("never includes a secret-shaped substring when userinfo is present but the host is unparseable", () => {
    const secretValue = "hostless-secret-value";
    const url = `mysql://creatorcore:${secretValue}@/creatorcore_test`;
    try {
      loadDatabaseConfig({ DATABASE_URL: url });
      expect.unreachable("expected loadDatabaseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const message = (error as Error).message;
      expect(message).not.toContain(secretValue);
      expect(message).not.toContain(url);
    }
  });

  it("never includes a secret-shaped substring when the URL fails to parse at all", () => {
    const secretValue = "unparseable-secret-value";
    const url = `not a url containing ${secretValue}`;
    try {
      loadDatabaseConfig({ DATABASE_URL: url });
      expect.unreachable("expected loadDatabaseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const message = (error as Error).message;
      expect(message).not.toContain(secretValue);
      expect(message).not.toContain(url);
    }
  });
});
