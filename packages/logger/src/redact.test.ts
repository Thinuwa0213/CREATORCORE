import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("redacts top-level sensitive keys", () => {
    const result = redact({ password: "hunter2", username: "alice" }) as Record<string, unknown>;
    expect(result.password).toBe("[REDACTED]");
    expect(result.username).toBe("alice");
  });

  it("redacts sensitive keys nested arbitrarily deep", () => {
    const result = redact({
      request: {
        headers: {
          authorization: "Bearer abc123",
        },
      },
    }) as { request: { headers: { authorization: string } } };
    expect(result.request.headers.authorization).toBe("[REDACTED]");
  });

  it("redacts sensitive values inside arrays of objects", () => {
    const result = redact({
      credentials: [{ botToken: "real-token-1" }, { botToken: "real-token-2" }],
    }) as { credentials: { botToken: string }[] };
    expect(result.credentials[0]?.botToken).toBe("[REDACTED]");
    expect(result.credentials[1]?.botToken).toBe("[REDACTED]");
  });

  it("matches sensitive keys case-insensitively and through separators", () => {
    const result = redact({
      DB_PASSWORD: "x",
      "client-secret": "y",
      encryptionKey: "z",
    }) as Record<string, unknown>;
    expect(result.DB_PASSWORD).toBe("[REDACTED]");
    expect(result["client-secret"]).toBe("[REDACTED]");
    expect(result.encryptionKey).toBe("[REDACTED]");
  });

  it("preserves non-sensitive values unchanged", () => {
    const result = redact({ count: 3, active: true, name: "creatorcore" }) as Record<
      string,
      unknown
    >;
    expect(result).toEqual({ count: 3, active: true, name: "creatorcore" });
  });

  it("does not throw on an Error instance and drops no sensitive sibling fields", () => {
    const err = new Error("boom");
    const result = redact({ err, secret: "s3cr3t" }) as {
      err: { name: string; message: string };
      secret: string;
    };
    expect(result.err.name).toBe("Error");
    expect(result.err.message).toBe("boom");
    expect(result.secret).toBe("[REDACTED]");
  });

  it("does not infinitely recurse on a circular reference", () => {
    const obj: Record<string, unknown> = { name: "x" };
    obj.self = obj;
    expect(() => redact(obj)).not.toThrow();
  });

  it("documents an intentional limitation: does NOT scrub secret-shaped text embedded in an Error's message/stack", () => {
    // Redaction is key-based, not content-based (see the docstring above
    // redact()). This test exists so that limitation is an explicit,
    // verified contract rather than a silent surprise — callers must never
    // construct an Error whose message embeds a secret value; pass secrets
    // as separate structured fields instead, which ARE redacted (see the
    // "redacts sensitive keys nested arbitrarily deep" test above).
    const err = new Error("db connect failed for user super-secret-value");
    const result = redact(err) as { message: string };
    expect(result.message).toContain("super-secret-value");
  });
});
