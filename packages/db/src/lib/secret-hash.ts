import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Fixed scrypt cost parameters (a code constant, not configurable per-call --
// consistency matters more than tuning for this internal, low-QPS use case).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  const options: ScryptOptions = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

/**
 * One-way hashing for worker bootstrap secrets (docs/adr/0011) using Node's
 * built-in `crypto.scrypt` -- no new dependency (no bcrypt/argon2). The
 * plaintext secret is never stored; only the hash + a random per-secret
 * salt are persisted (workers.bootstrapSecretHash/bootstrapSecretSalt).
 */
export async function hashSecret(plaintext: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(plaintext, salt, KEY_LENGTH);
  return { hash: derived.toString("hex"), salt };
}

/**
 * Verifies a presented plaintext secret against a stored hash+salt.
 * Timing-safe comparison via `crypto.timingSafeEqual` -- length-checked
 * first, since it throws on a length mismatch rather than returning false.
 */
export async function verifySecret(
  plaintext: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const derived = await scryptAsync(plaintext, storedSalt, KEY_LENGTH);
  const stored = Buffer.from(storedHash, "hex");
  if (derived.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(derived, stored);
}

/** Generates a high-entropy plaintext bootstrap secret (returned once, never stored). */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}
