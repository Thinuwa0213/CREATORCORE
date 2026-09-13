import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issueWorkerAccessToken, verifyWorkerAccessToken, type WorkerTokenSigningKeys } from "./worker-token.js";

/**
 * Direct unit coverage for the worker access-token verifier (Phase 3 review
 * finding H1: docs/TESTING.md's "worker impersonation is rejected" scenario
 * requires "an actual test asserting the rejection, not just a code review
 * claiming the check exists" for invalid/expired/wrong-audience/wrong-issuer
 * credentials -- none of that existed before this file). Pure logic, no DB.
 *
 * `sign`/`CONTEXT_STRING` below mirror worker-token.ts's private signing
 * construction exactly (verified against its source) so this suite can
 * forge arbitrary adversarial payloads signed with a known key, without
 * needing a testing seam exported from the production verifier itself. If
 * worker-token.ts's token format ever changes, keep this in sync.
 */
const CONTEXT_STRING = "creatorcore-worker-access-token-v1";

function sign(payloadSegment: string, key: string): string {
  return createHmac("sha256", key).update(`${CONTEXT_STRING}.${payloadSegment}`).digest("base64url");
}

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function forgeToken(payload: unknown, key: string): string {
  const payloadSegment = encodePayload(payload);
  return `${payloadSegment}.${sign(payloadSegment, key)}`;
}

const KEY = "a".repeat(32);
const OTHER_KEY = "b".repeat(32);

function keys(overrides: Partial<WorkerTokenSigningKeys> = {}): WorkerTokenSigningKeys {
  return { current: KEY, currentVersion: 1, ...overrides };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    kv: 1,
    sub: "worker-test",
    iss: "creatorcore-api",
    aud: "creatorcore-worker",
    iat: now,
    exp: now + 900,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("issueWorkerAccessToken / verifyWorkerAccessToken", () => {
  it("accepts a token it just issued, signed under the current key", () => {
    const token = issueWorkerAccessToken("worker-1", keys());
    expect(verifyWorkerAccessToken(token, keys())).toEqual({ ok: true, workerId: "worker-1" });
  });

  it("rejects an expired token, and attributes the authenticated workerId to the rejection", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const token = issueWorkerAccessToken("worker-expired", keys());
    vi.advanceTimersByTime((15 * 60 + 60 + 1) * 1000); // past target lifetime + clock-skew tolerance
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "expired",
      workerId: "worker-expired",
    });
  });

  it("rejects a token with the wrong issuer", () => {
    const token = forgeToken(validPayload({ iss: "someone-else" }), KEY);
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "issuer_mismatch",
      workerId: "worker-test",
    });
  });

  it("rejects a token with the wrong audience", () => {
    const token = forgeToken(validPayload({ aud: "someone-else" }), KEY);
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "audience_mismatch",
      workerId: "worker-test",
    });
  });

  it("rejects a valid-format token with the wrong signature, and does NOT attribute a workerId", () => {
    const token = forgeToken(validPayload(), OTHER_KEY); // signed with a key the verifier doesn't hold as current
    const result = verifyWorkerAccessToken(token, keys());
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
    expect("workerId" in result).toBe(false);
  });

  it("rejects an unknown key version", () => {
    const token = forgeToken(validPayload({ kv: 99 }), KEY);
    const result = verifyWorkerAccessToken(token, keys());
    expect(result).toEqual({ ok: false, reason: "unknown_signing_key_version" });
    expect("workerId" in result).toBe(false);
  });

  it("rejects a token whose lifetime exceeds the verifier's maximum", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = forgeToken(validPayload({ iat: now, exp: now + 21 * 60 }), KEY); // 21 min > 20 min max
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "lifetime_exceeds_maximum",
      workerId: "worker-test",
    });
  });

  it("rejects a token issued too far in the future", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = forgeToken(validPayload({ iat: now + 120, exp: now + 120 + 900 }), KEY);
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "issued_in_future",
      workerId: "worker-test",
    });
  });

  it("rejects a malformed (non-object) payload", () => {
    const payloadSegment = encodePayload([1, 2, 3]);
    const token = `${payloadSegment}.${sign(payloadSegment, KEY)}`;
    expect(verifyWorkerAccessToken(token, keys())).toEqual({ ok: false, reason: "malformed_payload_shape" });
  });

  it("rejects a payload that isn't valid JSON", () => {
    const payloadSegment = Buffer.from("not-json{{{", "utf8").toString("base64url");
    const token = `${payloadSegment}.${sign(payloadSegment, KEY)}`;
    expect(verifyWorkerAccessToken(token, keys())).toEqual({ ok: false, reason: "malformed_payload_json" });
  });

  it("rejects a token with the wrong number of segments", () => {
    expect(verifyWorkerAccessToken("only-one-segment", keys())).toEqual({
      ok: false,
      reason: "malformed_token_shape",
    });
    expect(verifyWorkerAccessToken("a.b.c", keys())).toEqual({ ok: false, reason: "malformed_token_shape" });
  });

  it("rejects a token with an empty segment", () => {
    expect(verifyWorkerAccessToken(".signature", keys())).toEqual({
      ok: false,
      reason: "malformed_token_shape",
    });
    expect(verifyWorkerAccessToken("payload.", keys())).toEqual({
      ok: false,
      reason: "malformed_token_shape",
    });
  });

  it("rejects a token containing invalid base64url characters", () => {
    expect(verifyWorkerAccessToken("not!valid.base64url!!", keys())).toEqual({
      ok: false,
      reason: "malformed_token_shape",
    });
  });

  it("rejects a signature of the wrong byte length safely, without throwing", () => {
    const payloadSegment = encodePayload(validPayload());
    const shortSignature = Buffer.from("short").toString("base64url");
    const token = `${payloadSegment}.${shortSignature}`;
    expect(() => verifyWorkerAccessToken(token, keys())).not.toThrow();
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "invalid_signature_length",
    });
  });

  it("rejects a token with trailing/extra data appended", () => {
    const token = issueWorkerAccessToken("worker-1", keys());
    expect(verifyWorkerAccessToken(`${token}.extra`, keys())).toEqual({
      ok: false,
      reason: "malformed_token_shape",
    });
  });

  it("accepts a token signed with the previous key at the correct previous version", () => {
    const token = forgeToken(validPayload({ kv: 1 }), KEY);
    const result = verifyWorkerAccessToken(
      token,
      keys({ current: OTHER_KEY, currentVersion: 2, previous: KEY }),
    );
    expect(result).toEqual({ ok: true, workerId: "worker-test" });
  });

  it("rejects a previous-key-version token when no previous key is configured", () => {
    const token = forgeToken(validPayload({ kv: 1 }), KEY);
    const result = verifyWorkerAccessToken(token, keys({ current: OTHER_KEY, currentVersion: 2 }));
    expect(result).toEqual({ ok: false, reason: "unknown_signing_key_version" });
    expect("workerId" in result).toBe(false);
  });

  it("rejects an unsupported token version", () => {
    const token = forgeToken(validPayload({ v: 99 }), KEY);
    expect(verifyWorkerAccessToken(token, keys())).toEqual({
      ok: false,
      reason: "unknown_token_version",
      workerId: "worker-test",
    });
  });

  it("does not attribute a workerId when the subject itself is missing, even though the signature verified", () => {
    const token = forgeToken(validPayload({ sub: "" }), KEY);
    const result = verifyWorkerAccessToken(token, keys());
    expect(result).toEqual({ ok: false, reason: "missing_subject" });
    expect("workerId" in result).toBe(false);
  });
});
