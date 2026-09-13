import { Hono } from "hono";
import {
  connectGuildForUser,
  listConnectedGuildIdsForUser,
  recordAuditEvent,
  type DatabaseClient,
} from "@creatorcore/db";
import { AuthorizationError, requireCurrentDiscordGuildManager } from "../../authz/index.js";
import { DiscordUnavailableError, type DiscordGuildProvider } from "../../discord/types.js";
import {
  createRequireAuthenticatedUser,
  type AuthenticatedUserEnv,
} from "../../middleware/require-authenticated-user.js";
import { createOriginCheckMiddleware } from "../../middleware/origin-check.js";
import type { Auth } from "../../auth/index.js";

export interface GuildRoutesDeps {
  db: DatabaseClient["db"];
  auth: Auth;
  discordGuildProvider: DiscordGuildProvider;
  webAppOrigin: string;
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

/**
 * `/app/guilds` — the first user-facing (non-`/internal/*`) route group
 * (Phase 5). Origin/CSRF check runs first on every request (security-review
 * M4), before authentication or any DB/network work, so a forged-origin
 * request never even reaches the session check.
 */
export function createGuildRoutes(deps: GuildRoutesDeps): Hono<AuthenticatedUserEnv> {
  const route = new Hono<AuthenticatedUserEnv>();
  route.use("*", createOriginCheckMiddleware(deps.webAppOrigin));
  route.use("*", createRequireAuthenticatedUser({ auth: deps.auth, db: deps.db }));

  /**
   * Read-only, may reflect `DiscordGuildProvider`'s bounded (max 5 minute)
   * cache — never used to authorize anything on its own (ADR-0003).
   */
  route.get("/", async (c) => {
    const userId = c.get("userId");
    let manageableGuilds;
    try {
      manageableGuilds = await deps.discordGuildProvider.listManageableGuilds(userId);
    } catch (error) {
      if (error instanceof DiscordUnavailableError) {
        return c.json({ error: "RUNTIME_UNAVAILABLE" }, 503);
      }
      throw error;
    }

    const connectedGuildIds = new Set(
      (await listConnectedGuildIdsForUser(deps.db, userId)).map((id) => id.toString()),
    );

    return c.json({
      guilds: manageableGuilds.map((guild) => ({
        id: guild.id.toString(),
        name: guild.name,
        connected: connectedGuildIds.has(guild.id.toString()),
      })),
    });
  });

  /**
   * Connects a Discord guild to CreatorCore (task §9/§11). Sequence:
   * authenticate (middleware, above) -> synchronous live Discord
   * guild-manager reverification -> transactional connect-or-resolve. A
   * guild already managed by a tenant the caller does not belong to is
   * never auto-transferred (409, not silently granted or merged).
   */
  route.post("/:discordGuildId/connect", async (c) => {
    const userId = c.get("userId");
    const discordGuildId = parseDiscordSnowflake(c.req.param("discordGuildId"));
    if (discordGuildId === undefined) {
      return c.json({ error: "INVALID_GUILD_ID" }, 400);
    }

    try {
      await requireCurrentDiscordGuildManager(deps.discordGuildProvider, userId, discordGuildId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        await recordAuditEvent(deps.db, {
          actorType: "USER",
          actorUserId: userId,
          guildId: discordGuildId,
          targetType: "Guild",
          targetId: discordGuildId.toString(),
          action: "guild.connect",
          outcome: "DENIED",
          metadata: { reason: error.code },
        });
        const status = error.code === "DISCORD_REVERIFICATION_FAILED" ? 503 : 403;
        return c.json({ error: error.code }, status);
      }
      throw error;
    }

    let guildName = discordGuildId.toString();
    try {
      const manageableGuilds = await deps.discordGuildProvider.listManageableGuilds(userId);
      const match = manageableGuilds.find((guild) => guild.id === discordGuildId);
      if (match) {
        guildName = match.name;
      }
    } catch {
      // A display-name lookup failure is not fatal -- the sensitive
      // authorization check above already ran live and succeeded.
    }

    const result = await connectGuildForUser(deps.db, userId, discordGuildId, guildName);

    if (result.outcome === "conflict") {
      await recordAuditEvent(deps.db, {
        actorType: "USER",
        actorUserId: userId,
        guildId: discordGuildId,
        targetType: "Guild",
        targetId: discordGuildId.toString(),
        action: "guild.connect",
        outcome: "DENIED",
        metadata: { reason: "GUILD_ALREADY_MANAGED" },
      });
      return c.json({ error: "GUILD_ALREADY_MANAGED" }, 409);
    }

    await recordAuditEvent(deps.db, {
      actorType: "USER",
      actorUserId: userId,
      tenantId: result.tenantId,
      guildId: discordGuildId,
      targetType: "Guild",
      targetId: discordGuildId.toString(),
      action: result.outcome === "created" ? "guild.connected" : "guild.connect.idempotent",
      outcome: "SUCCESS",
    });

    return c.json({
      tenantId: result.tenantId,
      guildId: discordGuildId.toString(),
      status: result.outcome,
    });
  });

  return route;
}
