/**
 * Case-insensitive key fragments that must never reach a log line.
 * docs/SECURITY.md and docs/adr/0010-observability-audit.md require
 * redaction to live in one shared place, not per-call-site discipline.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "token",
  "authorization",
  "cookie",
  "password",
  "secret",
  "clientsecret",
  "bottoken",
  "databaseurl",
  "encryptionkey",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "privatekey",
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 10;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * Deep-redacts sensitive fields from a value before it is logged. Handles
 * nested objects/arrays (a sensitive value one level down must not survive
 * just because it isn't top-level) and Error instances (logged safely rather
 * than thrown during serialization). Circular references are cut off rather
 * than recursed into forever.
 *
 * **Scope of the guarantee — key-based, not content-based.** Redaction
 * matches *key names* against `SENSITIVE_KEY_FRAGMENTS`; it does not scan
 * free-text string *values* (including an `Error`'s `message`/`stack`) for
 * secret-shaped content, because reliably detecting an arbitrary secret
 * embedded in prose is not a solvable pattern-matching problem — a
 * half-working scrubber would create false confidence, which is worse than
 * an honestly-scoped one. Concretely: `redact({ password: "x" })` redacts
 * `password`; `redact(new Error("db connect failed for user x"))` does
 * **not** redact `x` inside that message, because it's text, not a keyed
 * field. **Callers must never construct an Error (or any free-text message)
 * that embeds a secret value** — pass the secret as a separate, named field
 * instead (which this function does redact), never interpolated into a
 * message string. See `src/redact.test.ts` for this documented as an
 * explicit, intentional limitation, not an oversight.
 */
export function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH_EXCEEDED]";

  if (value instanceof Error) {
    return redact(serializeError(value), seen, depth + 1);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redact(val, seen, depth + 1);
    }
    return result;
  }

  return value;
}
