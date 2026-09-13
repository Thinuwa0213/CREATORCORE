import {
  assertTenantActive,
  findBotApplicationByTenantAndId,
  findGuildByTenantAndId,
  findTenantMembership,
  TenantNotActiveError,
  type BotApplication,
  type DatabaseClient,
  type Guild,
  type TenantMembership,
} from "@creatorcore/db";
import { DiscordUnavailableError, type DiscordGuildProvider } from "../discord/types.js";

/**
 * Reusable server-side authorization layer (task §10). Every `/app/*`
 * route composes these instead of writing its own tenant/guild SQL — this
 * is what makes the User -> TenantMembership -> Tenant -> Guild ->
 * GuildBotAssignment -> BotApplication IDOR chain safe: each step below
 * walks a trusted, already-tenant-scoped repository function
 * (`packages/db`), never a bare-ID lookup. Browser-supplied IDs are
 * selectors only, checked against these chains — never authority on their
 * own.
 */
export type AuthorizationErrorCode =
  | "TENANT_MEMBERSHIP_REQUIRED"
  | "GUILD_ACCESS_DENIED"
  | "DISCORD_REVERIFICATION_FAILED"
  | "BOT_APPLICATION_NOT_FOUND";

export class AuthorizationError extends Error {
  public readonly code: AuthorizationErrorCode;

  constructor(code: AuthorizationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthorizationError";
    this.code = code;
  }
}

/**
 * Membership + tenant-active check, the base every other check builds on.
 * `TenantNotActiveError` (a distinct, lower-level error from
 * `assertTenantActive`) is folded into the same `AuthorizationError` code
 * here so every route has exactly one error surface to handle — a caller
 * must never be able to distinguish "no membership" from "tenant disabled"
 * from this error alone, matching `assertTenantActive`'s own stated intent.
 */
export async function requireTenantMembership(
  db: DatabaseClient["db"],
  userId: bigint,
  tenantId: string,
): Promise<TenantMembership> {
  const membership = await findTenantMembership(db, userId, tenantId);
  if (!membership) {
    throw new AuthorizationError("TENANT_MEMBERSHIP_REQUIRED");
  }
  try {
    await assertTenantActive(db, tenantId);
  } catch (error) {
    if (error instanceof TenantNotActiveError) {
      throw new AuthorizationError("TENANT_MEMBERSHIP_REQUIRED");
    }
    throw error;
  }
  return membership;
}

export async function requireGuildAccess(
  db: DatabaseClient["db"],
  userId: bigint,
  tenantId: string,
  guildId: bigint,
): Promise<Guild> {
  await requireTenantMembership(db, userId, tenantId);
  const guild = await findGuildByTenantAndId(db, tenantId, guildId);
  if (!guild) {
    throw new AuthorizationError("GUILD_ACCESS_DENIED");
  }
  return guild;
}

export async function requireBotApplicationAccess(
  db: DatabaseClient["db"],
  userId: bigint,
  tenantId: string,
  botApplicationId: string,
): Promise<BotApplication> {
  await requireTenantMembership(db, userId, tenantId);
  const botApplication = await findBotApplicationByTenantAndId(db, tenantId, botApplicationId);
  if (!botApplication) {
    throw new AuthorizationError("BOT_APPLICATION_NOT_FOUND");
  }
  return botApplication;
}

/**
 * Synchronous, always-live Discord guild-management reverification (ADR-0003's
 * Gate 1 condition — task §8). Never served from `DiscordGuildProvider`'s
 * read-only cache. If Discord cannot be reached, this fails closed
 * (`DISCORD_REVERIFICATION_FAILED`), never falling back to a prior/cached
 * decision.
 */
export async function requireCurrentDiscordGuildManager(
  discordGuildProvider: DiscordGuildProvider,
  userId: bigint,
  discordGuildId: bigint,
): Promise<void> {
  let isManager: boolean;
  try {
    isManager = await discordGuildProvider.verifyCurrentGuildManager(userId, discordGuildId);
  } catch (error) {
    if (error instanceof DiscordUnavailableError) {
      throw new AuthorizationError("DISCORD_REVERIFICATION_FAILED");
    }
    throw error;
  }
  if (!isManager) {
    throw new AuthorizationError("GUILD_ACCESS_DENIED");
  }
}
