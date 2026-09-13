import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@creatorcore/db";
import {
  createInitialActiveCredential,
  createPendingCredential,
  getActiveCredentialForAssignedWorker,
  getPendingCredentialForAssignedWorker,
  promotePendingCredential,
  rejectPendingCredential,
  recordAuditEvent,
} from "@creatorcore/db";
import type { Logger } from "@creatorcore/logger";
import {
  decryptBotCredential,
  encryptBotCredential,
  type CredentialEncryptionKeys,
} from "../lib/credential-crypto.js";
import { DiscordValidator } from "./discord-validator.js";

export interface CredentialServiceOptions {
  db: DatabaseClient["db"];
  keys: CredentialEncryptionKeys;
  logger: Logger;
  validator?: DiscordValidator;
}

export interface DecryptedCredentialResult {
  botApplicationId: string;
  credentialId: string;
  token: string;
  status: "ACTIVE" | "PENDING";
}

export class CredentialService {
  private readonly db: DatabaseClient["db"];
  private readonly keys: CredentialEncryptionKeys;
  private readonly logger: Logger;
  private readonly validator: DiscordValidator;

  constructor(options: CredentialServiceOptions) {
    this.db = options.db;
    this.keys = options.keys;
    this.logger = options.logger;
    this.validator = options.validator ?? new DiscordValidator();
  }

  /**
   * Internal provisioning / test helper: stores initial ACTIVE credential for a BotApplication.
   */
  public async storeInitialCredential(
    botApplicationId: string,
    plaintextToken: string,
  ): Promise<{ credentialId: string; keyVersion: number }> {
    const validation = await this.validator.validateToken(plaintextToken);
    if (!validation.valid) {
      throw new Error(`Token validation failed: ${validation.reason}`);
    }

    const credentialId = randomUUID();
    const encrypted = encryptBotCredential(
      plaintextToken,
      { botApplicationId, credentialId },
      this.keys,
    );

    await createInitialActiveCredential(this.db, {
      id: credentialId,
      botApplicationId,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
    });

    await recordAuditEvent(this.db, {
      actorType: "SYSTEM",
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.stored",
      outcome: "SUCCESS",
      metadata: { credentialId, version: String(encrypted.keyVersion) },
    });

    this.logger.info("credential.stored", { botApplicationId, credentialId });

    return {
      credentialId,
      keyVersion: encrypted.keyVersion,
    };
  }

  /**
   * Initiates a credential rotation: validates token, encrypts with AAD, and persists PENDING.
   * Failure at any point leaves the current ACTIVE credential untouched.
   */
  public async requestCredentialRotation(
    botApplicationId: string,
    plaintextToken: string,
  ): Promise<{ ok: true; credentialId: string } | { ok: false; reason: string }> {
    const validation = await this.validator.validateToken(plaintextToken);
    if (!validation.valid) {
      await recordAuditEvent(this.db, {
        actorType: "SYSTEM",
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "credential.validation_failed",
        outcome: "DENIED",
        metadata: { reason: validation.reason },
      });
      this.logger.warn("credential.validation_failed", { botApplicationId, reason: validation.reason });
      return { ok: false, reason: validation.reason };
    }

    await recordAuditEvent(this.db, {
      actorType: "SYSTEM",
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.validation_passed",
      outcome: "SUCCESS",
    });

    const credentialId = randomUUID();
    const encrypted = encryptBotCredential(
      plaintextToken,
      { botApplicationId, credentialId },
      this.keys,
    );

    const pendingResult = await createPendingCredential(this.db, {
      id: credentialId,
      botApplicationId,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
    });

    if (!pendingResult.ok) {
      await recordAuditEvent(this.db, {
        actorType: "SYSTEM",
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "credential.rotation_failed",
        outcome: "DENIED",
        metadata: { reason: pendingResult.reason },
      });
      this.logger.warn("credential.rotation_failed", { botApplicationId, reason: pendingResult.reason });
      return { ok: false, reason: pendingResult.reason };
    }

    await recordAuditEvent(this.db, {
      actorType: "SYSTEM",
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.rotation_requested",
      outcome: "SUCCESS",
      metadata: { credentialId, version: String(encrypted.keyVersion) },
    });

    this.logger.info("credential.rotation_requested", { botApplicationId, credentialId });

    return { ok: true, credentialId };
  }

  /**
   * Retrieves and decrypts the currently ACTIVE credential for an authorized worker.
   */
  public async getDecryptedActiveCredential(
    workerId: string,
    botApplicationId: string,
  ): Promise<DecryptedCredentialResult | null> {
    const credRow = await getActiveCredentialForAssignedWorker(
      this.db,
      workerId,
      botApplicationId,
    );

    if (!credRow) {
      await recordAuditEvent(this.db, {
        actorType: "WORKER",
        actorWorkerId: workerId,
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "credential.access_denied",
        outcome: "DENIED",
      });
      this.logger.warn("credential.access_denied", { workerId, botApplicationId });
      return null;
    }

    const plaintext = decryptBotCredential(
      {
        ciphertext: Buffer.from(credRow.ciphertext),
        nonce: Buffer.from(credRow.nonce),
        authTag: Buffer.from(credRow.authTag),
        keyVersion: credRow.keyVersion,
      },
      {
        botApplicationId: credRow.botApplicationId,
        credentialId: credRow.id,
      },
      this.keys,
    );

    await recordAuditEvent(this.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.delivered",
      outcome: "SUCCESS",
      metadata: { credentialId: credRow.id, status: "ACTIVE" },
    });

    return {
      botApplicationId: credRow.botApplicationId,
      credentialId: credRow.id,
      token: plaintext,
      status: "ACTIVE",
    };
  }

  /**
   * Retrieves and decrypts an exact PENDING credential candidate for validation during rotation.
   */
  public async getDecryptedPendingCredential(
    workerId: string,
    botApplicationId: string,
    credentialId: string,
  ): Promise<DecryptedCredentialResult | null> {
    const credRow = await getPendingCredentialForAssignedWorker(
      this.db,
      workerId,
      botApplicationId,
      credentialId,
    );

    if (!credRow) {
      await recordAuditEvent(this.db, {
        actorType: "WORKER",
        actorWorkerId: workerId,
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "credential.access_denied",
        outcome: "DENIED",
        metadata: { credentialId, status: "PENDING" },
      });
      this.logger.warn("credential.access_denied", { workerId, botApplicationId, credentialId });
      return null;
    }

    const plaintext = decryptBotCredential(
      {
        ciphertext: Buffer.from(credRow.ciphertext),
        nonce: Buffer.from(credRow.nonce),
        authTag: Buffer.from(credRow.authTag),
        keyVersion: credRow.keyVersion,
      },
      {
        botApplicationId: credRow.botApplicationId,
        credentialId: credRow.id,
      },
      this.keys,
    );

    await recordAuditEvent(this.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.delivered",
      outcome: "SUCCESS",
      metadata: { credentialId, status: "PENDING" },
    });

    return {
      botApplicationId: credRow.botApplicationId,
      credentialId: credRow.id,
      token: plaintext,
      status: "PENDING",
    };
  }

  /**
   * Handles worker acknowledgement of a successful Discord connection with pending credential.
   * Atomically promotes to ACTIVE and deletes superseded credential.
   */
  public async acknowledgeRotation(
    workerId: string,
    botApplicationId: string,
    credentialId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const result = await promotePendingCredential(this.db, {
      workerId,
      botApplicationId,
      credentialId,
    });

    if (!result.ok) {
      await recordAuditEvent(this.db, {
        actorType: "WORKER",
        actorWorkerId: workerId,
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "credential.rotation_failed",
        outcome: "DENIED",
        metadata: { credentialId, reason: result.reason ?? "failed" },
      });
      this.logger.warn("credential.rotation_failed", { workerId, botApplicationId, credentialId, reason: result.reason });
      return result;
    }

    await recordAuditEvent(this.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.activated",
      outcome: "SUCCESS",
      metadata: { credentialId },
    });

    this.logger.info("credential.rotation_activated", { workerId, botApplicationId, credentialId });
    return { ok: true };
  }

  /**
   * Handles worker rejection of a pending credential that failed to connect.
   */
  public async rejectRotation(
    workerId: string,
    botApplicationId: string,
    credentialId: string,
    reason?: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const result = await rejectPendingCredential(this.db, {
      workerId,
      botApplicationId,
      credentialId,
      ...(reason !== undefined ? { reason } : {}),
    });

    await recordAuditEvent(this.db, {
      actorType: "WORKER",
      actorWorkerId: workerId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.rotation_failed",
      outcome: result.ok ? "SUCCESS" : "DENIED",
      metadata: { credentialId, reason: reason ?? "worker_rejected" },
    });

    return result;
  }
}
