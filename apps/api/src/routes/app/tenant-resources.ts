import { Hono, type Context } from "hono";
import {
  findAssignment,
  findCredentialStatusForTenantBotApplication,
  findRuntimeStatusForTenantBotApplication,
  listGuildsForBotApplication,
  recordAuditEvent,
  resolveBotApplicationForGuild,
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
import { deriveRuntimeStatus } from "../../services/runtime-status.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantResourceRoutesDeps {
  db: DatabaseClient["db"];
  auth: Auth;
  discordGuildProvider: DiscordGuildProvider;
  webAppOrigin: string;
  botOnboardingService: BotOnboardingService;
  credentialService: CredentialService;
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
      const status = result.reason === "CREDENTIAL_VALIDATION_FAILED" ? 422 : 409;
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

    return c.json({ status, botApplicationId: botApplicationId ?? null });
  });

  return route;
}
