import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived (target 15 min, docs/adr/0011) internal worker access token.
 *
 * This is deliberately NOT JWT-shaped: two base64url segments
 * (`payload.signature`), no header, no `alg` field anywhere. This is a
 * stronger guarantee than "we hardcoded HS256 and ignore the header" --
 * there is no algorithm-selection surface to confuse at all, by
 * construction. ADR-0011's "no generic JWT framework, use a narrow internal
 * service-auth implementation" is best honored by removing the feature
 * class the JWT `alg` vulnerability lives in, not by defending against it.
 *
 * The HMAC input is domain-separated: `CONTEXT_STRING + "." + payloadSegment`,
 * where CONTEXT_STRING is a fixed literal naming this token's exact
 * purpose, so it can never verify successfully as any other token purpose
 * even if a future token type were signed under the same key by mistake.
 *
 * The HMAC is computed/verified over the LITERAL received base64url
 * payload segment bytes, never a JSON.parse -> JSON.stringify round trip
 * -- this sidesteps JSON key-ordering/number-formatting ambiguity
 * entirely, since two independently-produced serializations are never
 * compared for equality, only raw bytes are, via HMAC.
 */

const TOKEN_VERSION = 1;
const CONTEXT_STRING = "creatorcore-worker-access-token-v1";
const ISSUER = "creatorcore-api";
const AUDIENCE = "creatorcore-worker";
const TARGET_LIFETIME_SECONDS = 15 * 60;
const MAX_LIFETIME_SECONDS = 20 * 60;
const CLOCK_SKEW_TOLERANCE_SECONDS = 60;
const HMAC_SHA256_DIGEST_LENGTH = 32;

// Anchored: exactly two non-empty base64url segments, one dot, nothing else.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface WorkerTokenSigningKeys {
  current: string;
  currentVersion: number;
  /** Accepted for tokens issued under the previous key during a rotation cutover window. */
  previous?: string;
}

interface WorkerTokenPayload {
  v: number;
  kv: number;
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type VerifyWorkerTokenResult =
  | { ok: true; workerId: string }
  | { ok: false; reason: string; workerId?: string };

function computeSignature(payloadSegment: string, key: string): Buffer {
  return createHmac("sha256", key).update(`${CONTEXT_STRING}.${payloadSegment}`).digest();
}

/**
 * Builds a rejection result, optionally attributing it to an authenticated
 * workerId (Phase 3 review finding M3). `exactOptionalPropertyTypes` means
 * `workerId` must be omitted entirely when unset, never assigned an
 * explicit `undefined`.
 */
function rejected(reason: string, authenticatedWorkerId?: string): VerifyWorkerTokenResult {
  return authenticatedWorkerId !== undefined
    ? { ok: false, reason, workerId: authenticatedWorkerId }
    : { ok: false, reason };
}

/** Issues a token, always signed with the CURRENT key, tagged with the current key version. */
export function issueWorkerAccessToken(workerId: string, keys: WorkerTokenSigningKeys): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: WorkerTokenPayload = {
    v: TOKEN_VERSION,
    kv: keys.currentVersion,
    sub: workerId,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + TARGET_LIFETIME_SECONDS,
  };
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = computeSignature(payloadSegment, keys.current);
  return `${payloadSegment}.${signature.toString("base64url")}`;
}

/**
 * Verifies a worker access token. Every rejection returns `ok: false` with
 * a `reason` intended ONLY for the server-side failed-auth AuditEvent
 * (docs/adr/0011) -- callers must return one generic client-facing
 * rejection regardless of `reason`, never exposing which specific check
 * failed (avoids handing an attacker a structural oracle).
 */
export function verifyWorkerAccessToken(
  token: string,
  keys: WorkerTokenSigningKeys,
): VerifyWorkerTokenResult {
  if (!TOKEN_SHAPE.test(token)) {
    return { ok: false, reason: "malformed_token_shape" };
  }
  const parts = token.split(".");
  const payloadSegment = parts[0];
  const signatureSegment = parts[1];
  if (parts.length !== 2 || payloadSegment === undefined || signatureSegment === undefined) {
    return { ok: false, reason: "malformed_token_shape" };
  }

  let presentedSignature: Buffer;
  try {
    presentedSignature = Buffer.from(signatureSegment, "base64url");
  } catch {
    return { ok: false, reason: "malformed_signature_encoding" };
  }
  if (presentedSignature.length !== HMAC_SHA256_DIGEST_LENGTH) {
    return { ok: false, reason: "invalid_signature_length" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed_payload_json" };
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    return { ok: false, reason: "malformed_payload_shape" };
  }
  const candidate = decoded as Record<string, unknown>;

  // `kv` is read from the still-unverified payload, but ONLY as a lookup
  // index into the small, fixed, server-held set of currently-trusted keys
  // (current/previous) -- never as an attacker-suppliable key or algorithm
  // itself. A value naming neither known version is rejected before any
  // HMAC computation happens for this token at all.
  if (typeof candidate.kv !== "number") {
    return { ok: false, reason: "malformed_key_version" };
  }
  let keyToVerifyWith: string;
  if (candidate.kv === keys.currentVersion) {
    keyToVerifyWith = keys.current;
  } else if (keys.previous !== undefined && candidate.kv === keys.currentVersion - 1) {
    keyToVerifyWith = keys.previous;
  } else {
    return { ok: false, reason: "unknown_signing_key_version" };
  }

  const expectedSignature = computeSignature(payloadSegment, keyToVerifyWith);
  if (
    expectedSignature.length !== presentedSignature.length ||
    !timingSafeEqual(expectedSignature, presentedSignature)
  ) {
    return { ok: false, reason: "signature_mismatch" };
  }

  // Only past this point is anything in the payload treated as authenticated.
  // `authenticatedWorkerId` is attached to every rejection from here on (via
  // `rejected()`) whenever the subject itself is a well-formed, non-empty
  // string -- this lets a failed-auth AuditEvent attribute a rejection (e.g.
  // expired, wrong-audience) to a specific worker even though that worker's
  // request is still correctly denied (Phase 3 review finding M3). Never
  // populated for any rejection ABOVE this line, where the subject is not
  // yet authenticated at all -- an unverified signature must never lead to a
  // trusted `sub` being audited.
  const payload = candidate as unknown as WorkerTokenPayload;
  const authenticatedWorkerId =
    typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : undefined;

  if (payload.v !== TOKEN_VERSION) {
    return rejected("unknown_token_version", authenticatedWorkerId);
  }
  if (payload.iss !== ISSUER) {
    return rejected("issuer_mismatch", authenticatedWorkerId);
  }
  if (payload.aud !== AUDIENCE) {
    return rejected("audience_mismatch", authenticatedWorkerId);
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return rejected("missing_subject");
  }
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    return rejected("malformed_timestamps", authenticatedWorkerId);
  }
  if (payload.exp - payload.iat > MAX_LIFETIME_SECONDS) {
    return rejected("lifetime_exceeds_maximum", authenticatedWorkerId);
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp + CLOCK_SKEW_TOLERANCE_SECONDS) {
    return rejected("expired", authenticatedWorkerId);
  }
  if (now < payload.iat - CLOCK_SKEW_TOLERANCE_SECONDS) {
    return rejected("issued_in_future", authenticatedWorkerId);
  }

  return { ok: true, workerId: payload.sub };
}
