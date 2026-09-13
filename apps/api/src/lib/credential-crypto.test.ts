import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptBotCredential,
  encryptBotCredential,
  decryptDiscordOauthCredential,
  encryptDiscordOauthCredential,
  CredentialDecryptionError,
  CredentialEncryptionError,
  type CredentialEncryptionKeys,
  type DiscordOauthTokenEncryptionKeys,
} from "./credential-crypto.js";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);

const KEYS: CredentialEncryptionKeys = {
  keyDomain: "bot_credential",
  current: KEY_A,
  currentVersion: 1,
};

describe("credential-crypto (AES-256-GCM + AAD)", () => {
  const context = {
    botApplicationId: randomUUID(),
    credentialId: randomUUID(),
  };
  const token = "MTEyMjMzNDQ1NQ.GgHhIi.JjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

  it("encrypts and decrypts a plaintext bot token correctly", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.nonce.length).toBe(12);
    expect(encrypted.authTag.length).toBe(16);
    expect(encrypted.keyVersion).toBe(1);

    const decrypted = decryptBotCredential(encrypted, context, KEYS);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for the same plaintext due to random unique nonces", () => {
    const enc1 = encryptBotCredential(token, context, KEYS);
    const enc2 = encryptBotCredential(token, context, KEYS);

    expect(enc1.nonce.equals(enc2.nonce)).toBe(false);
    expect(enc1.ciphertext.equals(enc2.ciphertext)).toBe(false);
  });

  it("fails decryption if ciphertext is tampered", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    encrypted.ciphertext[0] = (encrypted.ciphertext[0] ?? 0) ^ 1; // Flip a bit

    expect(() => decryptBotCredential(encrypted, context, KEYS)).toThrow(
      CredentialDecryptionError,
    );
  });

  it("fails decryption if nonce is tampered", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    encrypted.nonce[0] = (encrypted.nonce[0] ?? 0) ^ 1;

    expect(() => decryptBotCredential(encrypted, context, KEYS)).toThrow(
      CredentialDecryptionError,
    );
  });

  it("fails decryption if authTag is tampered", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    encrypted.authTag[0] = (encrypted.authTag[0] ?? 0) ^ 1;

    expect(() => decryptBotCredential(encrypted, context, KEYS)).toThrow(
      CredentialDecryptionError,
    );
  });

  it("fails decryption if AAD context is transplanted to another botApplicationId", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    const foreignContext = {
      botApplicationId: randomUUID(),
      credentialId: context.credentialId,
    };

    expect(() => decryptBotCredential(encrypted, foreignContext, KEYS)).toThrow(
      CredentialDecryptionError,
    );
  });

  it("fails decryption if AAD context is transplanted to another credentialId", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    const foreignContext = {
      botApplicationId: context.botApplicationId,
      credentialId: randomUUID(),
    };

    expect(() => decryptBotCredential(encrypted, foreignContext, KEYS)).toThrow(
      CredentialDecryptionError,
    );
  });

  it("fails decryption when attempted with the wrong key", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    const wrongKeys: CredentialEncryptionKeys = {
      keyDomain: "bot_credential",
      current: KEY_B,
      currentVersion: 1,
    };

    expect(() => decryptBotCredential(encrypted, context, wrongKeys)).toThrow(
      CredentialDecryptionError,
    );
  });

  it("fails decryption when key version is unknown", () => {
    const encrypted = encryptBotCredential(token, context, KEYS);
    encrypted.keyVersion = 99;

    expect(() => decryptBotCredential(encrypted, context, KEYS)).toThrow(
      /Unknown or unconfigured key version/,
    );
  });

  it("decrypts successfully with previous key during key rotation", () => {
    // Encrypted with version 1
    const encryptedV1 = encryptBotCredential(token, context, {
      keyDomain: "bot_credential",
      current: KEY_A,
      currentVersion: 1,
    });

    // Keys rotated to version 2, keeping version 1 as previous
    const rotatedKeys: CredentialEncryptionKeys = {
      keyDomain: "bot_credential",
      current: KEY_B,
      currentVersion: 2,
      previous: KEY_A,
      previousVersion: 1,
    };

    const decrypted = decryptBotCredential(encryptedV1, context, rotatedKeys);
    expect(decrypted).toBe(token);
  });

  it("never includes token plaintext or key in thrown error messages", () => {
    try {
      const encrypted = encryptBotCredential(token, context, KEYS);
      encrypted.authTag[0] = (encrypted.authTag[0] ?? 0) ^ 1;
      decryptBotCredential(encrypted, context, KEYS);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).not.toContain(token);
      expect(msg).not.toContain(KEYS.current.toString());
    }
  });

  it("rejects empty token on encryption", () => {
    expect(() => encryptBotCredential("", context, KEYS)).toThrow(
      CredentialEncryptionError,
    );
  });
});

describe("discord OAuth-token encryption (Amendment 1 — separate key domain)", () => {
  const OAUTH_KEY_A = randomBytes(32);
  const OAUTH_KEYS: DiscordOauthTokenEncryptionKeys = {
    keyDomain: "discord_oauth_token",
    current: OAUTH_KEY_A,
    currentVersion: 1,
  };
  const oauthContext = { accountId: 123456789012345678n };
  const payload = JSON.stringify({ accessToken: "discord-access", refreshToken: "discord-refresh" });

  it("encrypts and decrypts an OAuth token payload correctly", () => {
    const encrypted = encryptDiscordOauthCredential(payload, oauthContext, OAUTH_KEYS);
    expect(encrypted.nonce.length).toBe(12);
    expect(encrypted.authTag.length).toBe(16);

    const decrypted = decryptDiscordOauthCredential(encrypted, oauthContext, OAUTH_KEYS);
    expect(decrypted).toBe(payload);
  });

  it("fails decryption if the AAD accountId is transplanted to another account", () => {
    const encrypted = encryptDiscordOauthCredential(payload, oauthContext, OAUTH_KEYS);
    const foreignContext = { accountId: 999999999999999999n };

    expect(() =>
      decryptDiscordOauthCredential(encrypted, foreignContext, OAUTH_KEYS),
    ).toThrow(CredentialDecryptionError);
  });

  it("a bot-credential ciphertext cannot be decrypted as a Discord OAuth credential, even with numerically matching key bytes", () => {
    const sharedKeyBytes = randomBytes(32);
    const botKeys: CredentialEncryptionKeys = {
      keyDomain: "bot_credential",
      current: sharedKeyBytes,
      currentVersion: 1,
    };
    const oauthKeysSameBytes: DiscordOauthTokenEncryptionKeys = {
      keyDomain: "discord_oauth_token",
      current: sharedKeyBytes,
      currentVersion: 1,
    };
    const botContext = { botApplicationId: randomUUID(), credentialId: randomUUID() };

    const encryptedAsBotCredential = encryptBotCredential("secret-bot-token", botContext, botKeys);

    // Even if the two domains were ever misconfigured to share key bytes,
    // the different AAD domain strings must still prevent cross-domain
    // decryption -- this is the whole point of a separate namespace.
    expect(() =>
      decryptDiscordOauthCredential(
        encryptedAsBotCredential,
        { accountId: 1n },
        oauthKeysSameBytes,
      ),
    ).toThrow(CredentialDecryptionError);
  });

  it("decrypts successfully with the previous key during key rotation", () => {
    const oauthKeyB = randomBytes(32);
    const encryptedV1 = encryptDiscordOauthCredential(payload, oauthContext, OAUTH_KEYS);
    const rotatedKeys: DiscordOauthTokenEncryptionKeys = {
      keyDomain: "discord_oauth_token",
      current: oauthKeyB,
      currentVersion: 2,
      previous: OAUTH_KEY_A,
      previousVersion: 1,
    };

    expect(decryptDiscordOauthCredential(encryptedV1, oauthContext, rotatedKeys)).toBe(payload);
  });

  it("never includes token plaintext or key in thrown error messages", () => {
    try {
      const encrypted = encryptDiscordOauthCredential(payload, oauthContext, OAUTH_KEYS);
      encrypted.authTag[0] = (encrypted.authTag[0] ?? 0) ^ 1;
      decryptDiscordOauthCredential(encrypted, oauthContext, OAUTH_KEYS);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).not.toContain(payload);
      expect(msg).not.toContain(OAUTH_KEYS.current.toString());
    }
  });
});
