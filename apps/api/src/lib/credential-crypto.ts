import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface CredentialEncryptionKeys {
  /**
   * A required literal discriminant, not just documentation: without it,
   * `CredentialEncryptionKeys` and `DiscordOauthTokenEncryptionKeys` below
   * are structurally identical, so TypeScript would accept either keyring
   * in either domain's functions with no error (a real gap found in
   * security review — structural typing doesn't care that two interfaces
   * have different names). This field makes them genuinely incompatible
   * types, not just differently-named aliases of the same shape.
   */
  readonly keyDomain: "bot_credential";
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

/**
 * Amendment 1: Discord user OAuth access/refresh tokens are encrypted with
 * a key domain wholly independent of bot-credential encryption (a
 * compromise of one key must never imply the other). `keyDomain`'s literal
 * type (distinct from `CredentialEncryptionKeys`'s) is what actually
 * enforces this at compile time — TypeScript's structural typing would
 * otherwise treat the two interfaces as interchangeable despite the
 * different names, since every other field is identically shaped.
 */
export interface DiscordOauthTokenEncryptionKeys {
  readonly keyDomain: "discord_oauth_token";
  current: Buffer;
  currentVersion: number;
  previous?: Buffer | undefined;
  previousVersion?: number | undefined;
}

export interface DiscordOauthTokenAuthContext {
  accountId: bigint;
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
function buildAuthContextBuffer(context: CredentialAuthContext, keyVersion: number): Buffer {
  const domain = "creatorcore:bot_credential:v1";
  return Buffer.from(
    `${domain}|${context.botApplicationId}|${context.credentialId}|${keyVersion}`,
    "utf8",
  );
}

/**
 * Amendment 1's AAD for the Discord OAuth-token domain: purpose/version,
 * the CreatorCore user identity (the Discord account id — see
 * discord-oauth-credentials.ts's schema comment on why this is the same
 * value as users.id), and keyVersion. A wholly separate domain string from
 * `buildAuthContextBuffer` above, so ciphertext from one domain can never
 * decrypt under the other even if a key were ever shared by mistake.
 */
function buildDiscordOauthAuthContextBuffer(
  context: DiscordOauthTokenAuthContext,
  keyVersion: number,
): Buffer {
  const domain = "creatorcore:discord_oauth_token:v1";
  return Buffer.from(`${domain}|${context.accountId}|${keyVersion}`, "utf8");
}

/**
 * Generic AES-256-GCM envelope encryption, shared by every domain in this
 * file (bot credentials, Discord OAuth tokens). Not exported: each domain
 * gets its own narrowly-typed wrapper below so a caller cannot pass one
 * domain's AAD/keys to another's ciphertext by accident.
 */
function encryptEnvelope(plaintext: string, aad: Buffer, key: Buffer, keyVersion: number) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new CredentialEncryptionError("Plaintext must be a non-empty string");
  }
  if (key.length !== 32) {
    throw new CredentialEncryptionError("Encryption key must be exactly 32 bytes");
  }

  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { ciphertext, nonce, authTag, keyVersion };
  } catch (error) {
    throw new CredentialEncryptionError(
      error instanceof CredentialEncryptionError ? error.message : "Failed to encrypt credential",
    );
  }
}

function resolveDecryptionKey(
  keyVersion: number,
  keys: {
    current: Buffer;
    currentVersion: number;
    previous?: Buffer | undefined;
    previousVersion?: number | undefined;
  },
): Buffer {
  if (keyVersion === keys.currentVersion) {
    return keys.current;
  }
  if (keys.previous && keys.previousVersion !== undefined && keyVersion === keys.previousVersion) {
    return keys.previous;
  }
  throw new CredentialDecryptionError(`Unknown or unconfigured key version: ${keyVersion}`);
}

function decryptEnvelope(encrypted: EncryptedCredentialPayload, aad: Buffer, key: Buffer): string {
  if (key.length !== 32) {
    throw new CredentialDecryptionError("Selected encryption key must be exactly 32 bytes");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, encrypted.nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(encrypted.authTag);

    return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      throw error;
    }
    throw new CredentialDecryptionError("Credential decryption or authentication failed");
  }
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
  const keyVersion = keys.currentVersion;
  const aad = buildAuthContextBuffer(context, keyVersion);
  return encryptEnvelope(plaintext, aad, keys.current, keyVersion);
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
  const key = resolveDecryptionKey(encrypted.keyVersion, keys);
  const aad = buildAuthContextBuffer(context, encrypted.keyVersion);
  return decryptEnvelope(encrypted, aad, key);
}

/**
 * Encrypts a Discord user's OAuth access/refresh token pair (Amendment 1/2)
 * using the same AES-256-GCM envelope as bot credentials, but a wholly
 * separate key domain and AAD namespace (`buildDiscordOauthAuthContextBuffer`
 * above) — a compromise of DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY must never
 * imply anything about BOT_CREDENTIAL_ENCRYPTION_KEY, or vice versa.
 *
 * `plaintext` is one JSON payload (`{ accessToken, refreshToken }`), not two
 * independently-encrypted fields: encrypting both under the same nonce
 * would be AES-GCM nonce reuse (see discord-oauth-credentials.ts's schema
 * comment).
 */
export function encryptDiscordOauthCredential(
  plaintext: string,
  context: DiscordOauthTokenAuthContext,
  keys: DiscordOauthTokenEncryptionKeys,
): EncryptedCredentialPayload {
  const keyVersion = keys.currentVersion;
  const aad = buildDiscordOauthAuthContextBuffer(context, keyVersion);
  return encryptEnvelope(plaintext, aad, keys.current, keyVersion);
}

export function decryptDiscordOauthCredential(
  encrypted: EncryptedCredentialPayload,
  context: DiscordOauthTokenAuthContext,
  keys: DiscordOauthTokenEncryptionKeys,
): string {
  const key = resolveDecryptionKey(encrypted.keyVersion, keys);
  const aad = buildDiscordOauthAuthContextBuffer(context, encrypted.keyVersion);
  return decryptEnvelope(encrypted, aad, key);
}
