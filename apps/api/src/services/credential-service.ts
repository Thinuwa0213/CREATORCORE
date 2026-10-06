import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@creatorcore/db";
import {
  createInitialActiveCredential,
  createPendingCredential,
  findActiveCredential,
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
  private readonly botProfileCache = new Map<
    string,
    {
      profile: {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        avatarUrl: string | null;
        globalName: string | null;
      };
      expiresAt: number;
    }
  >();

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
      this.logger.warn("credential.validation_failed", {
        botApplicationId,
        reason: validation.reason,
      });
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
      this.logger.warn("credential.rotation_failed", {
        botApplicationId,
        reason: pendingResult.reason,
      });
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
    const credRow = await getActiveCredentialForAssignedWorker(this.db, workerId, botApplicationId);

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
      this.logger.warn("credential.rotation_failed", {
        workerId,
        botApplicationId,
        credentialId,
        reason: result.reason,
      });
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

  /**
   * Fetches the live Discord bot profile (/users/@me) using the decrypted active credential.
   * Caches response for 5 minutes to avoid Discord rate limits.
   */
  public async getBotUserProfile(botApplicationId: string): Promise<{
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    avatarUrl: string | null;
    globalName: string | null;
  } | null> {
    const cached = this.botProfileCache.get(botApplicationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }

    const credRow = await findActiveCredential(this.db, botApplicationId);
    if (!credRow) return null;

    try {
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

      const res = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${plaintext}` },
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        global_name: string | null;
      };

      const avatarUrl = data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.${data.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(data.id) >> 22n) % 6n)}.png`;

      const profile = {
        id: data.id,
        username: data.username,
        discriminator: data.discriminator,
        avatar: data.avatar,
        avatarUrl,
        globalName: data.global_name,
      };

      this.botProfileCache.set(botApplicationId, {
        profile,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return profile;
    } catch (err) {
      this.logger.warn("discord.bot_profile_fetch_failed", { botApplicationId, err });
      return null;
    }
  }

  /**
   * Updates bot identity on live Discord API:
   * 1. If nickname & guildId provided, updates member nickname for that guild.
   * 2. If avatarDataUri provided, updates global bot avatar (subject to 2/hour Discord cooldown).
   */
  public async updateDiscordBotIdentity(
    botApplicationId: string,
    options: {
      guildId?: bigint | undefined;
      nickname?: string | undefined;
      avatarDataUri?: string | undefined;
      bannerDataUri?: string | undefined;
    },
  ): Promise<{ ok: true } | { ok: false; error: string; retryAfterSeconds?: number }> {
    const credRow = await findActiveCredential(this.db, botApplicationId);
    if (!credRow) {
      return { ok: false, error: "NO_ACTIVE_CREDENTIAL" };
    }

    let plaintext: string;
    try {
      plaintext = decryptBotCredential(
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
    } catch {
      return { ok: false, error: "DECRYPTION_FAILED" };
    }

    // 1. Update nickname if requested
    if (options.guildId !== undefined && options.nickname !== undefined) {
      try {
        const nickRes = await fetch(
          `https://discord.com/api/v10/guilds/${options.guildId}/members/@me`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bot ${plaintext}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ nick: options.nickname.trim() }),
          },
        );
        if (!nickRes.ok && nickRes.status !== 429) {
          this.logger.warn("discord.nickname_update_warning", { status: nickRes.status });
        }
      } catch (err) {
        this.logger.warn("discord.nickname_update_failed", { err });
      }
    }

    // 2. Update avatar on Discord if requested
    if (options.avatarDataUri) {
      try {
        const avatarRes = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH",
          headers: {
            Authorization: `Bot ${plaintext}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ avatar: options.avatarDataUri }),
        });

        if (avatarRes.status === 429) {
          const errData = (await avatarRes.json().catch(() => ({}))) as {
            retry_after?: number;
            message?: string;
          };
          const retryAfter = Math.ceil(errData.retry_after ?? 900);
          return {
            ok: false,
            error: "DISCORD_COOLDOWN",
            retryAfterSeconds: retryAfter,
          };
        }

        if (!avatarRes.ok) {
          const errText = await avatarRes.text();
          this.logger.warn("discord.avatar_update_failed", { status: avatarRes.status, errText });
          return { ok: false, error: "DISCORD_API_ERROR" };
        }

        // Invalidate cache so fresh avatar is fetched immediately
        this.botProfileCache.delete(botApplicationId);
      } catch (err) {
        this.logger.warn("discord.avatar_update_network_error", { err });
        return { ok: false, error: "NETWORK_ERROR" };
      }
    }

    // 3. Update banner on Discord if requested
    if (options.bannerDataUri) {
      try {
        const bannerRes = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH",
          headers: {
            Authorization: `Bot ${plaintext}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ banner: options.bannerDataUri }),
        });

        if (bannerRes.status === 429) {
          const errData = (await bannerRes.json().catch(() => ({}))) as {
            retry_after?: number;
          };
          const retryAfter = Math.ceil(errData.retry_after ?? 900);
          return {
            ok: false,
            error: "DISCORD_COOLDOWN",
            retryAfterSeconds: retryAfter,
          };
        }

        if (!bannerRes.ok) {
          const errText = await bannerRes.text();
          this.logger.warn("discord.banner_update_failed", { status: bannerRes.status, errText });
        } else {
          this.botProfileCache.delete(botApplicationId);
        }
      } catch (err) {
        this.logger.warn("discord.banner_update_network_error", { err });
      }
    }

    return { ok: true };
  }

  /**
   * Fetches real live channels and roles for a Discord guild using the active bot credentials.
   */
  public async fetchGuildDiscordResources(
    botApplicationId: string,
    guildId: bigint,
  ): Promise<{
    ok: true;
    data: {
      guildName: string;
      channels: { id: string; name: string; type: number; position: number }[];
      roles: { id: string; name: string; color: string; position: number }[];
    };
  } | { ok: false; error: string }> {
    const credRow = await findActiveCredential(this.db, botApplicationId);
    if (!credRow) {
      return { ok: false, error: "NO_ACTIVE_CREDENTIAL" };
    }

    let plaintext: string;
    try {
      plaintext = decryptBotCredential(
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
    } catch {
      return { ok: false, error: "DECRYPTION_FAILED" };
    }

    try {
      const [guildRes, channelsRes, rolesRes] = await Promise.all([
        fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
          headers: { Authorization: `Bot ${plaintext}` },
        }),
        fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: { Authorization: `Bot ${plaintext}` },
        }),
        fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
          headers: { Authorization: `Bot ${plaintext}` },
        }),
      ]);

      let guildName = "Discord Server";
      if (guildRes.ok) {
        const gData = (await guildRes.json().catch(() => ({}))) as { name?: string };
        if (gData.name) guildName = gData.name;
      }

      let channels: { id: string; name: string; type: number; position: number }[] = [];
      if (channelsRes.ok) {
        const cData = (await channelsRes.json().catch(() => [])) as {
          id: string;
          name: string;
          type: number;
          position: number;
        }[];
        if (Array.isArray(cData)) {
          channels = cData
            .filter((c) => c.type === 0 || c.type === 5) // Text and announcement channels
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((c) => ({
              id: c.id,
              name: `#${c.name}`,
              type: c.type,
              position: c.position ?? 0,
            }));
        }
      }

      let roles: { id: string; name: string; color: number; position: number }[] = [];
      if (rolesRes.ok) {
        const rData = (await rolesRes.json().catch(() => [])) as {
          id: string;
          name: string;
          color: number;
          position: number;
        }[];
        if (Array.isArray(rData)) {
          roles = rData
            .filter((r) => r.name !== "@everyone")
            .sort((a, b) => (b.position ?? 0) - (a.position ?? 0)); // Highest role hierarchy first
        }
      }

      const formattedRoles = roles.map((r) => ({
        id: r.id,
        name: `@${r.name}`,
        color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "#99AAB5",
        position: r.position ?? 0,
      }));

      return {
        ok: true,
        data: {
          guildName,
          channels,
          roles: formattedRoles,
        },
      };
    } catch (err) {
      this.logger.warn("discord.fetch_resources_failed", { err });
      return { ok: false, error: "FETCH_FAILED" };
    }
  }
}

