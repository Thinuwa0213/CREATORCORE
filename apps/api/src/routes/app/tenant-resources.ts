import path from "node:path";
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import {
  deleteMediaAsset,
  findAssignment,
  findCredentialStatusForTenantBotApplication,
  findRuntimeStatusForTenantBotApplication,
  findSubscriptionByTenant,
  getMediaAssetForGuild,
  getTenantTotalStorageUsed,
  listGuildsForBotApplication,
  recordAuditEvent,
  resolveBotApplicationForGuild,
  upsertMediaAsset,
  type DatabaseClient,
} from "@creatorcore/db";
import {
  AuthorizationError,
  requireBotApplicationAccess,
  requireCurrentDiscordGuildManager,
  requireGuildAccess,
} from "../../authz/index.js";
import { DiscordUnavailableError, type DiscordGuildProvider } from "../../discord/types.js";
import {
  createRequireAuthenticatedUser,
  type AuthenticatedUserEnv,
} from "../../middleware/require-authenticated-user.js";
import { createOriginCheckMiddleware } from "../../middleware/origin-check.js";
import type { Auth } from "../../auth/index.js";
import type { BotOnboardingService } from "../../services/bot-onboarding-service.js";
import type { CredentialService } from "../../services/credential-service.js";
import { LocalStorageService, type StorageService } from "../../services/storage-service.js";
import { deriveRuntimeStatus } from "../../services/runtime-status.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantResourceRoutesDeps {
  db: DatabaseClient["db"];
  auth: Auth;
  discordGuildProvider: DiscordGuildProvider;
  webAppOrigin: string;
  botOnboardingService: BotOnboardingService;
  credentialService: CredentialService;
  storageService?: StorageService | undefined;
}

function parseDiscordSnowflake(raw: string): bigint | undefined {
  if (!/^[0-9]{1,20}$/.test(raw)) {
    return undefined;
  }
  try {
    const value = BigInt(raw);
    return value > 0n ? value : undefined;
  } catch {
    return undefined;
  }
}

function authorizationErrorStatus(code: AuthorizationError["code"]): 403 | 404 | 503 {
  if (code === "DISCORD_REVERIFICATION_FAILED") {
    return 503;
  }
  if (code === "BOT_APPLICATION_NOT_FOUND") {
    return 404;
  }
  return 403;
}

function respondToAuthorizationError(c: Context, error: unknown): Response | undefined {
  if (error instanceof AuthorizationError) {
    return c.json({ error: error.code }, authorizationErrorStatus(error.code));
  }
  return undefined;
}

/**
 * `/app/tenants/:tenantId/*` — every resource here is explicitly tenant-
 * scoped in the URL as a SELECTOR only; `tenantId` from the browser is
 * never authority on its own (task §13) — every handler re-derives access
 * through `requireGuildAccess`/`requireBotApplicationAccess` before doing
 * anything else. Origin/CSRF check and session resolution run first on
 * every request, before any of that authorization work.
 */
export function createTenantResourceRoutes(
  deps: TenantResourceRoutesDeps,
): Hono<AuthenticatedUserEnv> {
  const route = new Hono<AuthenticatedUserEnv>();
  route.use("*", createOriginCheckMiddleware(deps.webAppOrigin));
  route.use("*", createRequireAuthenticatedUser({ auth: deps.auth, db: deps.db }));

  /**
   * BotApplication + initial credential onboarding (task §13/§14), one
   * user-facing call backed by `BotOnboardingService`'s atomic sequence.
   */
  route.post("/guilds/:guildId/bot-application", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) {
      return c.json({ error: "INVALID_GUILD_ID" }, 400);
    }

    let guild;
    try {
      guild = await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    try {
      await requireCurrentDiscordGuildManager(deps.discordGuildProvider, userId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown; name?: unknown };
    const token = typeof body.token === "string" ? body.token : undefined;
    if (!token) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const name =
      typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : guild.name;

    const result = await deps.botOnboardingService.onboardBotApplication({
      userId,
      tenantId,
      guildId,
      name,
      token,
    });
    if (!result.ok) {
      const status =
        result.reason === "CREDENTIAL_VALIDATION_FAILED"
          ? 422
          : result.reason === "BOT_NOT_IN_GUILD"
            ? 400
            : 409;
      return c.json({ error: result.reason }, status);
    }

    return c.json({ botApplicationId: result.botApplicationId, status: "configured" });
  });

  /**
   * Credential replacement (task §16) — exact BotApplication scope,
   * current guild-management reverification against whichever guild(s)
   * the BotApplication is actually assigned to, then the existing Phase 4
   * rotation path (`CredentialService.requestCredentialRotation`) — no
   * second rotation implementation.
   */
  route.post("/bot-applications/:botApplicationId/credential/rotate", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    const botApplicationId = c.req.param("botApplicationId");
    if (!tenantId || !UUID_SHAPE.test(botApplicationId)) {
      return c.json({ error: "invalid_request" }, 400);
    }

    try {
      await requireBotApplicationAccess(deps.db, userId, tenantId, botApplicationId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const assignedGuildIds = await listGuildsForBotApplication(deps.db, tenantId, botApplicationId);
    let reverified = false;
    let lastError: unknown;
    for (const guildId of assignedGuildIds) {
      try {
        await requireCurrentDiscordGuildManager(deps.discordGuildProvider, userId, guildId);
        reverified = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!reverified) {
      await recordAuditEvent(deps.db, {
        actorType: "USER",
        actorUserId: userId,
        tenantId,
        targetType: "BotApplication",
        targetId: botApplicationId,
        action: "credential.action_denied",
        outcome: "DENIED",
        metadata: {
          reason: lastError instanceof AuthorizationError ? lastError.code : "GUILD_ACCESS_DENIED",
        },
      });
      if (lastError instanceof DiscordUnavailableError) {
        return c.json({ error: "DISCORD_REVERIFICATION_FAILED" }, 503);
      }
      return c.json({ error: "GUILD_ACCESS_DENIED" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token : undefined;
    if (!token) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await deps.credentialService.requestCredentialRotation(botApplicationId, token);
    if (!result.ok) {
      return c.json({ error: "CREDENTIAL_VALIDATION_FAILED" }, 422);
    }

    await recordAuditEvent(deps.db, {
      actorType: "USER",
      actorUserId: userId,
      tenantId,
      targetType: "BotApplication",
      targetId: botApplicationId,
      action: "credential.rotation_requested",
      outcome: "SUCCESS",
    });

    return c.json({ status: "rotation_requested" });
  });

  /**
   * Read-only runtime status (task §18) — authoritative control-plane data
   * only, composed via `deriveRuntimeStatus`.
   */
  route.get("/guilds/:guildId/runtime-status", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) {
      return c.json({ error: "INVALID_GUILD_ID" }, 400);
    }

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const resolved = await resolveBotApplicationForGuild(deps.db, tenantId, guildId);
    const botApplicationId = resolved?.botApplicationId;

    const [credential, assignment, runtimeStatus] = await Promise.all([
      botApplicationId
        ? findCredentialStatusForTenantBotApplication(deps.db, tenantId, botApplicationId)
        : Promise.resolve(undefined),
      botApplicationId ? findAssignment(deps.db, botApplicationId) : Promise.resolve(undefined),
      botApplicationId
        ? findRuntimeStatusForTenantBotApplication(deps.db, tenantId, botApplicationId)
        : Promise.resolve(undefined),
    ]);

    const status = deriveRuntimeStatus({
      botApplicationId,
      credential,
      assignment,
      runtimeStatus,
      now: new Date(),
    });

    return c.json({
      status,
      botApplicationId: botApplicationId ?? null,
      botName: resolved?.botName ?? null,
    });
  });

  /**
   * Fetches the live Discord bot profile for branding and identity previews.
   */
  route.get("/guilds/:guildId/bot-profile", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) {
      return c.json({ error: "INVALID_GUILD_ID" }, 400);
    }

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const resolved = await resolveBotApplicationForGuild(deps.db, tenantId, guildId);
    if (!resolved?.botApplicationId) {
      return c.json({
        configured: false,
        botApplicationId: null,
        botName: null,
        botAvatarUrl: null,
        botTag: null,
      });
    }

    const botProfile = await deps.credentialService.getBotUserProfile(resolved.botApplicationId);

    const botName = botProfile?.username ?? resolved.botName ?? null;
    const botAvatarUrl = botProfile?.avatarUrl ?? null;
    const botTag = botProfile
      ? botProfile.discriminator && botProfile.discriminator !== "0"
        ? `@${botProfile.username}#${botProfile.discriminator}`
        : `@${botProfile.username.toLowerCase().replace(/[^a-z0-9_]/g, "")}`
      : botName
        ? `@${botName.toLowerCase().replace(/[^a-z0-9_]/g, "")}`
        : null;

    return c.json({
      configured: true,
      botApplicationId: resolved.botApplicationId,
      botName,
      botAvatarUrl,
      botTag,
    });
  });

  /**
   * Reads full branding state: plan, storage usage, limits, and avatar details.
   */
  route.get("/guilds/:guildId/branding", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const [resolved, subscription, usedStorageBytes, customAvatar, customBanner] = await Promise.all([
      resolveBotApplicationForGuild(deps.db, tenantId, guildId),
      findSubscriptionByTenant(deps.db, tenantId),
      getTenantTotalStorageUsed(deps.db, tenantId),
      getMediaAssetForGuild(deps.db, guildId, "BOT_AVATAR"),
      getMediaAssetForGuild(deps.db, guildId, "BOT_BANNER"),
    ]);

    const plan = subscription?.plan ?? "FREE";
    const limits = {
      FREE: 10 * 1024 * 1024,
      PRO: 100 * 1024 * 1024,
      ENTERPRISE: 250 * 1024 * 1024,
    };
    const maxStorageBytes = limits[plan];

    let botProfile = null;
    if (resolved?.botApplicationId) {
      botProfile = await deps.credentialService.getBotUserProfile(resolved.botApplicationId);
    }

    const botName = botProfile?.username ?? resolved?.botName ?? "CreatorBot";
    const discordAvatarUrl = botProfile?.avatarUrl ?? null;
    const botTag = botProfile
      ? botProfile.discriminator && botProfile.discriminator !== "0"
        ? `@${botProfile.username}#${botProfile.discriminator}`
        : `@${botProfile.username.toLowerCase().replace(/[^a-z0-9_]/g, "")}`
      : `@${botName.toLowerCase().replace(/[^a-z0-9_]/g, "")}`;

    return c.json({
      plan,
      maxStorageBytes,
      usedStorageBytes,
      botName,
      botTag,
      discordAvatarUrl,
      customAvatarUrl: customAvatar ? `/storage/${customAvatar.storagePath}` : null,
      customAvatarSizeBytes: customAvatar?.fileSizeBytes ?? 0,
      customBannerUrl: customBanner ? `/storage/${customBanner.storagePath}` : null,
      customBannerSizeBytes: customBanner?.fileSizeBytes ?? 0,
    });
  });

  /**
   * Uploads and stores custom bot avatar for this guild, enforcing storage quota.
   * Auto-deletes previous avatar file from storage.
   */
  route.post("/guilds/:guildId/branding/avatar", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    let buffer: Buffer;
    let mimeType: string;
    let originalName: string;
    let sizeBytes: number;

    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const body = await c.req.parseBody();
      const rawFile = body["avatar"];
      const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;
      const isFileLike =
        file instanceof File ||
        (typeof file === "object" &&
          file !== null &&
          "name" in file &&
          "size" in file &&
          typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function");

      if (!isFileLike || !file) {
        return c.json({ error: "INVALID_FILE", message: "Please provide an image file." }, 400);
      }
      originalName = (file as { name?: string }).name || "avatar.png";
      mimeType = (file as { type?: string }).type || "image/png";
      sizeBytes = (file as { size?: number }).size || 0;
      const arrayBuffer = await (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const jsonBody = (await c.req.json().catch(() => ({}))) as {
        dataUri?: string;
        fileName?: string;
      };
      if (!jsonBody.dataUri || !jsonBody.dataUri.startsWith("data:image/")) {
        return c.json({ error: "INVALID_FILE", message: "Invalid data URI image." }, 400);
      }
      const match = jsonBody.dataUri.match(/^data:([^;]+);base64,(.*)$/);
      if (!match || !match[1] || !match[2]) {
        return c.json({ error: "INVALID_FILE", message: "Invalid image encoding." }, 400);
      }
      mimeType = match[1];
      buffer = Buffer.from(match[2], "base64");
      sizeBytes = buffer.length;
      originalName = jsonBody.fileName || "avatar.png";
    }

    const allowedMime = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowedMime.includes(mimeType)) {
      return c.json(
        { error: "INVALID_MIME", message: "Allowed formats: PNG, JPG, GIF, WebP." },
        400,
      );
    }

    const MAX_FILE_SIZE = 3 * 1024 * 1024;
    if (sizeBytes > MAX_FILE_SIZE) {
      return c.json({ error: "FILE_TOO_LARGE", message: "File exceeds 3MB limit." }, 400);
    }

    const [subscription, currentUsedBytes, existingAsset] = await Promise.all([
      findSubscriptionByTenant(deps.db, tenantId),
      getTenantTotalStorageUsed(deps.db, tenantId),
      getMediaAssetForGuild(deps.db, guildId, "BOT_AVATAR"),
    ]);

    const plan = subscription?.plan ?? "FREE";
    const limits = {
      FREE: 10 * 1024 * 1024,
      PRO: 100 * 1024 * 1024,
      ENTERPRISE: 250 * 1024 * 1024,
    };
    const maxStorageBytes = limits[plan];

    const existingSize = existingAsset?.fileSizeBytes ?? 0;
    const projectedUsage = currentUsedBytes - existingSize + sizeBytes;

    if (projectedUsage > maxStorageBytes) {
      return c.json(
        {
          error: "STORAGE_QUOTA_EXCEEDED",
          message: `Storage quota exceeded for ${plan} plan (${(maxStorageBytes / (1024 * 1024)).toFixed(0)}MB limit). Upgrade to Pro for more space.`,
          currentUsedBytes,
          maxStorageBytes,
        },
        413,
      );
    }

    const ext =
      path.extname(originalName) ||
      (mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg");
    const relativePath = `tenants/${tenantId}/guilds/${guildId}/avatar/${Date.now()}_${randomUUID()}${ext}`;

    const storage = deps.storageService ?? new LocalStorageService();
    const savedPath = await storage.saveFile(relativePath, buffer);

    const { previousStoragePath } = await upsertMediaAsset(deps.db, {
      tenantId,
      guildId,
      assetType: "BOT_AVATAR",
      storagePath: savedPath,
      fileSizeBytes: sizeBytes,
      mimeType,
    });

    if (previousStoragePath && previousStoragePath !== savedPath) {
      await storage.deleteFile(previousStoragePath).catch(() => {});
    }

    const newUsedBytes = await getTenantTotalStorageUsed(deps.db, tenantId);

    return c.json({
      ok: true,
      avatarUrl: `/storage/${savedPath}`,
      fileSizeBytes: sizeBytes,
      usedStorageBytes: newUsedBytes,
      maxStorageBytes,
    });
  });

  /**
   * Uploads and stores custom bot banner for this guild, enforcing storage quota.
   * Auto-deletes previous banner file from storage.
   */
  route.post("/guilds/:guildId/branding/banner", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    let buffer: Buffer;
    let mimeType: string;
    let originalName: string;
    let sizeBytes: number;

    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const body = await c.req.parseBody();
      const rawFile = body["banner"];
      const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;
      const isFileLike =
        file instanceof File ||
        (typeof file === "object" &&
          file !== null &&
          "name" in file &&
          "size" in file &&
          typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function");

      if (!isFileLike || !file) {
        return c.json({ error: "INVALID_FILE", message: "Please provide an image file." }, 400);
      }
      originalName = (file as { name?: string }).name || "banner.png";
      mimeType = (file as { type?: string }).type || "image/png";
      sizeBytes = (file as { size?: number }).size || 0;
      const arrayBuffer = await (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const jsonBody = (await c.req.json().catch(() => ({}))) as {
        dataUri?: string;
        fileName?: string;
      };
      if (!jsonBody.dataUri || !jsonBody.dataUri.startsWith("data:image/")) {
        return c.json({ error: "INVALID_FILE", message: "Invalid data URI image." }, 400);
      }
      const match = jsonBody.dataUri.match(/^data:([^;]+);base64,(.*)$/);
      if (!match || !match[1] || !match[2]) {
        return c.json({ error: "INVALID_FILE", message: "Invalid image encoding." }, 400);
      }
      mimeType = match[1];
      buffer = Buffer.from(match[2], "base64");
      sizeBytes = buffer.length;
      originalName = jsonBody.fileName || "banner.png";
    }

    const allowedMime = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowedMime.includes(mimeType)) {
      return c.json(
        { error: "INVALID_MIME", message: "Allowed formats: PNG, JPG, GIF, WebP." },
        400,
      );
    }

    const MAX_FILE_SIZE = 3 * 1024 * 1024;
    if (sizeBytes > MAX_FILE_SIZE) {
      return c.json({ error: "FILE_TOO_LARGE", message: "File exceeds 3MB limit." }, 400);
    }

    const [subscription, currentUsedBytes, existingAsset] = await Promise.all([
      findSubscriptionByTenant(deps.db, tenantId),
      getTenantTotalStorageUsed(deps.db, tenantId),
      getMediaAssetForGuild(deps.db, guildId, "BOT_BANNER"),
    ]);

    const plan = subscription?.plan ?? "FREE";
    const limits = {
      FREE: 10 * 1024 * 1024,
      PRO: 100 * 1024 * 1024,
      ENTERPRISE: 250 * 1024 * 1024,
    };
    const maxStorageBytes = limits[plan];

    const existingSize = existingAsset?.fileSizeBytes ?? 0;
    const projectedUsage = currentUsedBytes - existingSize + sizeBytes;

    if (projectedUsage > maxStorageBytes) {
      return c.json(
        {
          error: "STORAGE_QUOTA_EXCEEDED",
          message: `Storage quota exceeded for ${plan} plan (${(maxStorageBytes / (1024 * 1024)).toFixed(0)}MB limit). Upgrade to Pro for more space.`,
          currentUsedBytes,
          maxStorageBytes,
        },
        413,
      );
    }

    const ext =
      path.extname(originalName) ||
      (mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg");
    const relativePath = `tenants/${tenantId}/guilds/${guildId}/banner/${Date.now()}_${randomUUID()}${ext}`;

    const storage = deps.storageService ?? new LocalStorageService();
    const savedPath = await storage.saveFile(relativePath, buffer);

    const { previousStoragePath } = await upsertMediaAsset(deps.db, {
      tenantId,
      guildId,
      assetType: "BOT_BANNER",
      storagePath: savedPath,
      fileSizeBytes: sizeBytes,
      mimeType,
    });

    if (previousStoragePath && previousStoragePath !== savedPath) {
      await storage.deleteFile(previousStoragePath).catch(() => {});
    }

    const newUsedBytes = await getTenantTotalStorageUsed(deps.db, tenantId);

    return c.json({
      ok: true,
      bannerUrl: `/storage/${savedPath}`,
      fileSizeBytes: sizeBytes,
      usedStorageBytes: newUsedBytes,
      maxStorageBytes,
    });
  });

  /**
   * Applies branding changes (nickname + avatar + banner) to Discord live API.
   */
  route.post("/guilds/:guildId/branding/save", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      nickname?: string;
      syncAvatarToDiscord?: boolean;
      syncBannerToDiscord?: boolean;
    };

    const resolved = await resolveBotApplicationForGuild(deps.db, tenantId, guildId);
    if (!resolved?.botApplicationId) {
      return c.json({ error: "BOT_NOT_CONFIGURED" }, 400);
    }

    let avatarDataUri: string | undefined;
    if (body.syncAvatarToDiscord) {
      const customAsset = await getMediaAssetForGuild(deps.db, guildId, "BOT_AVATAR");
      if (customAsset) {
        const storage = deps.storageService ?? new LocalStorageService();
        const fileBuffer = await storage.readFile(customAsset.storagePath);
        if (fileBuffer) {
          avatarDataUri = `data:${customAsset.mimeType};base64,${fileBuffer.toString("base64")}`;
        }
      }
    }

    let bannerDataUri: string | undefined;
    if (body.syncBannerToDiscord) {
      const customBannerAsset = await getMediaAssetForGuild(deps.db, guildId, "BOT_BANNER");
      if (customBannerAsset) {
        const storage = deps.storageService ?? new LocalStorageService();
        const fileBuffer = await storage.readFile(customBannerAsset.storagePath);
        if (fileBuffer) {
          bannerDataUri = `data:${customBannerAsset.mimeType};base64,${fileBuffer.toString("base64")}`;
        }
      }
    }

    const result = await deps.credentialService.updateDiscordBotIdentity(
      resolved.botApplicationId,
      {
        guildId,
        ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
        ...(avatarDataUri !== undefined ? { avatarDataUri } : {}),
        ...(bannerDataUri !== undefined ? { bannerDataUri } : {}),
      },
    );

    if (!result.ok) {
      return c.json(result, 400);
    }

    return c.json({ ok: true, syncedWithDiscord: true });
  });

  /**
   * Deletes custom avatar for guild, restoring default Discord bot avatar.
   */
  route.delete("/guilds/:guildId/branding/avatar", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const removedPath = await deleteMediaAsset(deps.db, tenantId, guildId, "BOT_AVATAR");
    if (removedPath) {
      const storage = deps.storageService ?? new LocalStorageService();
      await storage.deleteFile(removedPath).catch(() => {});
    }

    const newUsedBytes = await getTenantTotalStorageUsed(deps.db, tenantId);
    return c.json({ ok: true, usedStorageBytes: newUsedBytes });
  });

  /**
   * Deletes custom banner for guild.
   */
  route.delete("/guilds/:guildId/branding/banner", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const removedPath = await deleteMediaAsset(deps.db, tenantId, guildId, "BOT_BANNER");
    if (removedPath) {
      const storage = deps.storageService ?? new LocalStorageService();
      await storage.deleteFile(removedPath).catch(() => {});
    }

    const newUsedBytes = await getTenantTotalStorageUsed(deps.db, tenantId);
    return c.json({ ok: true, usedStorageBytes: newUsedBytes });
  });

  /**
   * Retrieves saved presence and rich activity settings for guild.
   */
  route.get("/guilds/:guildId/presence", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const storage = deps.storageService ?? new LocalStorageService();
    const configPath = `tenants/${tenantId}/guilds/${guildId}/presence.json`;
    const buffer = await storage.readFile(configPath);

    if (!buffer) {
      // First setup: completely empty activities list (no default mock items)
      return c.json({
        statusMode: "online",
        rotationInterval: 60,
        activities: [],
      });
    }

    try {
      const parsed = JSON.parse(buffer.toString("utf-8"));
      return c.json({
        statusMode: parsed.statusMode ?? "online",
        rotationInterval: parsed.rotationInterval ?? 60,
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      });
    } catch {
      return c.json({
        statusMode: "online",
        rotationInterval: 60,
        activities: [],
      });
    }
  });

  /**
   * Saves presence and rich activity settings for guild.
   */
  route.post("/guilds/:guildId/presence", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "invalid_request" }, 400);
    const guildId = parseDiscordSnowflake(c.req.param("guildId"));
    if (guildId === undefined) return c.json({ error: "INVALID_GUILD_ID" }, 400);

    try {
      await requireGuildAccess(deps.db, userId, tenantId, guildId);
    } catch (error) {
      const response = respondToAuthorizationError(c, error);
      if (response) return response;
      throw error;
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      statusMode?: string;
      rotationInterval?: number;
      activities?: Array<{
        id: string;
        type: string;
        text: string;
        streamUrl?: string;
      }>;
    };

    // Plan quota enforcement
    const sub = await findSubscriptionByTenant(deps.db, tenantId);
    const plan = sub?.plan ?? "FREE";
    const maxAllowed = plan === "ENTERPRISE" ? 10 : plan === "PRO" ? 5 : 2;

    const rawActivities = Array.isArray(body.activities) ? body.activities : [];
    if (rawActivities.length > maxAllowed) {
      return c.json({ error: `Exceeded maximum ${maxAllowed} status slots for ${plan} plan` }, 400);
    }

    const statusMode = body.statusMode === "idle" || body.statusMode === "dnd" ? body.statusMode : "online";
    const rotationInterval =
      typeof body.rotationInterval === "number" && body.rotationInterval >= 10 ? body.rotationInterval : 60;

    const validActivities = rawActivities.slice(0, maxAllowed).map((act, index) => ({
      id: act.id || `act-${Date.now()}-${index}`,
      type: ["WATCHING", "PLAYING", "LISTENING", "STREAMING", "COMPETING"].includes(act.type)
        ? act.type
        : "PLAYING",
      text: typeof act.text === "string" ? act.text.slice(0, 128) : "",
      ...(act.streamUrl ? { streamUrl: String(act.streamUrl).slice(0, 256) } : {}),
    }));

    const config = {
      statusMode,
      rotationInterval,
      activities: validActivities,
      updatedAt: new Date().toISOString(),
    };

    const storage = deps.storageService ?? new LocalStorageService();
    const configPath = `tenants/${tenantId}/guilds/${guildId}/presence.json`;
    await storage.saveFile(configPath, Buffer.from(JSON.stringify(config, null, 2), "utf-8"));

    return c.json({
      ok: true,
      statusMode: config.statusMode,
      rotationInterval: config.rotationInterval,
      activities: config.activities,
    });
  });

  return route;
}
