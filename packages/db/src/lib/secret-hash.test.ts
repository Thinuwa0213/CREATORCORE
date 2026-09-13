import { describe, expect, it } from "vitest";
import { generateSecret, hashSecret, verifySecret } from "./secret-hash.js";

/**
 * Direct unit coverage for worker bootstrap-secret hashing (Phase 3 review
 * finding M8) -- previously only exercised indirectly through full
 * real-MySQL integration tests. Pure logic, no DB.
 */
describe("hashSecret / verifySecret", () => {
  it("a correct secret verifies against its own hash", async () => {
    const secret = generateSecret();
    const { hash, salt } = await hashSecret(secret);
    await expect(verifySecret(secret, hash, salt)).resolves.toBe(true);
  });

  it("a wrong secret fails verification", async () => {
    const { hash, salt } = await hashSecret(generateSecret());
    await expect(verifySecret(generateSecret(), hash, salt)).resolves.toBe(false);
  });

  it("hashing the same plaintext twice produces a different salt and a different hash each time", async () => {
    const secret = "same-plaintext-both-times";
    const first = await hashSecret(secret);
    const second = await hashSecret(secret);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    // Each hash still verifies correctly against its own salt.
    await expect(verifySecret(secret, first.hash, first.salt)).resolves.toBe(true);
    await expect(verifySecret(secret, second.hash, second.salt)).resolves.toBe(true);
  });

  it("verifying against the right hash but the wrong salt fails, rather than false-accepting", async () => {
    const secret = "some-secret-value";
    const { hash } = await hashSecret(secret);
    const { salt: otherSalt } = await hashSecret("a-completely-different-secret");
    await expect(verifySecret(secret, hash, otherSalt)).resolves.toBe(false);
  });

  it("a stored-hash length mismatch fails safely (returns false) rather than throwing", async () => {
    const secret = "some-secret-value";
    const { salt } = await hashSecret(secret);
    const tooShortHash = "aa"; // valid hex, but far shorter than the real 64-byte derived key
    await expect(verifySecret(secret, tooShortHash, salt)).resolves.toBe(false);
  });

  it("generateSecret produces high-entropy, distinct values", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
  });

  it("the derived hash/salt never contain the plaintext secret as a substring", async () => {
    const secret = "a-fairly-distinctive-plaintext-secret-value-12345";
    const { hash, salt } = await hashSecret(secret);
    expect(hash).not.toContain(secret);
    expect(salt).not.toContain(secret);
  });

  it("if verifySecret ever throws, the plaintext secret never appears in the thrown error", async () => {
    const secret = "another-distinctive-plaintext-secret-value-67890";
    try {
      // Deliberately malformed (invalid hex + implausible length). verifySecret
      // is designed to return false rather than throw for a length mismatch
      // (see above) -- this is a safety net around that contract in case any
      // future change introduces a throwing path here.
      await verifySecret(secret, "not-valid-hex-zz", "deadbeef");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
