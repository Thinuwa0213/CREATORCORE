import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface CredentialEncryptionKeys {
  current: Buffer;
  currentVersion: number;
  previous?: Buffer | undefined;
  previousVersion?: number | undefined;
}

export interface CredentialAuthContext {
  botApplicationId: string;
  credentialId: string;
}

export interface EncryptedCredentialPayload {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export class CredentialDecryptionError extends Error {
  constructor(message = "Credential decryption or authentication failed") {
    super(message);
    this.name = "CredentialDecryptionError";
  }
}

export class CredentialEncryptionError extends Error {
  constructor(message = "Credential encryption failed") {
    super(message);
    this.name = "CredentialEncryptionError";
  }
}

/**
 * Builds the canonical Additional Authenticated Data (AAD) buffer for AES-256-GCM.
 * Cryptographically binds ciphertext to the specific botApplicationId, credentialId,
 * and keyVersion so ciphertext cannot be transplanted across records.
 */
function buildAuthContextBuffer(
  context: CredentialAuthContext,
  keyVersion: number,
): Buffer {
  const domain = "creatorcore:bot_credential:v1";
  return Buffer.from(
    `${domain}|${context.botApplicationId}|${context.credentialId}|${keyVersion}`,
    "utf8",
  );
}

/**
 * Encrypts a Discord bot token using AES-256-GCM with AAD context binding.
 *
 * Uses Node's built-in crypto module:
 * - 256-bit key from keys.current
 * - 12-byte cryptographically random IV/nonce
 * - 16-byte authentication tag
 * - AAD binding to botApplicationId and credentialId
 */
export function encryptBotCredential(
  plaintext: string,
  context: CredentialAuthContext,
  keys: CredentialEncryptionKeys,
): EncryptedCredentialPayload {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new CredentialEncryptionError("Plaintext token must be a non-empty string");
  }

  if (keys.current.length !== 32) {
    throw new CredentialEncryptionError("Current encryption key must be exactly 32 bytes");
  }

  try {
    const nonce = randomBytes(12);
    const keyVersion = keys.currentVersion;
    const aad = buildAuthContextBuffer(context, keyVersion);

    const cipher = createCipheriv("aes-256-gcm", keys.current, nonce);
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      nonce,
      authTag,
      keyVersion,
    };
  } catch (error) {
    throw new CredentialEncryptionError(
      error instanceof CredentialEncryptionError
        ? error.message
        : "Failed to encrypt credential",
    );
  }
}

/**
 * Decrypts an encrypted bot credential using AES-256-GCM with AAD verification.
 *
 * Integrity verification:
 * - Reconstructs identical AAD buffer
 * - Validates authentication tag
 * - Rejects tampered ciphertext, tampered nonce, tampered auth tag, or context mismatch
 * - Error messages never echo key or plaintext material
 */
export function decryptBotCredential(
  encrypted: EncryptedCredentialPayload,
  context: CredentialAuthContext,
  keys: CredentialEncryptionKeys,
): string {
  let key: Buffer;

  if (encrypted.keyVersion === keys.currentVersion) {
    key = keys.current;
  } else if (
    keys.previous &&
    keys.previousVersion !== undefined &&
    encrypted.keyVersion === keys.previousVersion
  ) {
    key = keys.previous;
  } else {
    throw new CredentialDecryptionError(
      `Unknown or unconfigured key version: ${encrypted.keyVersion}`,
    );
  }

  if (key.length !== 32) {
    throw new CredentialDecryptionError("Selected encryption key must be exactly 32 bytes");
  }

  try {
    const aad = buildAuthContextBuffer(context, encrypted.keyVersion);
    const decipher = createDecipheriv("aes-256-gcm", key, encrypted.nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(encrypted.authTag);

    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]).toString("utf8");

    return plaintext;
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      throw error;
    }
    throw new CredentialDecryptionError("Credential decryption or authentication failed");
  }
}
