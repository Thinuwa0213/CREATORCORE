import { eq } from "drizzle-orm";
import { guilds, tenantMemberships } from "../schema/index.js";
import type { Db } from "../types.js";
import { isDuplicateKeyError } from "../lib/duplicate-key-error.js";
import { createGuild } from "./guilds.js";
import { createTenant } from "./tenants.js";
import { createTenantMembership, findTenantMembership } from "./tenants.js";

/**
 * All guild IDs already connected under any tenant the given user is a
 * member of — scoped entirely by `userId` (via the join on
 * `tenant_memberships`), so this can never surface another user's tenant's
 * guilds. Read-only, used only to annotate the guild-selection listing
 * ("already connected") — never an authorization decision on its own.
 */
export async function listConnectedGuildIdsForUser(db: Db, userId: bigint): Promise<bigint[]> {
  const rows = await db
    .select({ guildId: guilds.id })
    .from(guilds)
    .innerJoin(tenantMemberships, eq(tenantMemberships.tenantId, guilds.tenantId))
    .where(eq(tenantMemberships.userId, userId));
  return rows.map((row) => row.guildId);
}

export type ConnectGuildResult =
  | { outcome: "created"; tenantId: string }
  | { outcome: "already_connected"; tenantId: string }
  | { outcome: "conflict" };

/**
 * A guild-only, tenant-agnostic lookup used solely to discover whether a
 * Discord guild has already been adopted by *any* CreatorCore tenant — the
 * one legitimate exception to docs/DATABASE_RULES.md's findByTenantAndId
 * rule, matching `findTenantById`'s own precedent (tenants.ts): there is no
 * tenant to scope by yet, since discovering it is the entire point of this
 * query. Not exported from this package's public entry point — used only
 * by `connectGuildForUser` below, never as a general-purpose bare lookup.
 */
async function findGuildByIdAcrossTenants(
  db: Db,
  guildId: bigint,
): Promise<{ id: bigint; tenantId: string } | undefined> {
  const [row] = await db
    .select({ id: guilds.id, tenantId: guilds.tenantId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  return row;
}

async function resolveAgainstExistingGuild(
  db: Db,
  userId: bigint,
  guild: { tenantId: string },
): Promise<ConnectGuildResult> {
  const membership = await findTenantMembership(db, userId, guild.tenantId);
  if (membership) {
    return { outcome: "already_connected", tenantId: guild.tenantId };
  }
  // The guild is already managed by a different tenant (or by this
  // tenant, but the caller has no membership in it) -- never
  // auto-transfer or auto-grant membership from Discord-side permissions
  // alone (task §11/§9). A real membership-invite flow is future work.
  return { outcome: "conflict" };
}

/**
 * Connects a Discord guild to CreatorCore for the given (already
 * Discord-authorized — the caller must have run
 * `requireCurrentDiscordGuildManager` first) user. Amendment 5: relies on
 * `guilds.id` being the Discord snowflake itself (a proven InnoDB
 * primary-key uniqueness guarantee, not an application-level check) —
 * insert-first, catch-duplicate, exactly like `worker-assignments.ts`'s
 * `claimAssignment`, rather than a TOCTOU-vulnerable select-then-insert.
 *
 * Tenant + guild + membership are created inside one transaction: if two
 * requests race to adopt the same never-before-seen guild, the loser's
 * `createGuild` call fails on the primary key and its *entire* transaction
 * (including the tenant it just created) rolls back — no orphaned tenant
 * results from this race, only a clean re-resolution against the winner.
 */
export async function connectGuildForUser(
  db: Db,
  userId: bigint,
  guildId: bigint,
  guildName: string,
): Promise<ConnectGuildResult> {
  const existing = await findGuildByIdAcrossTenants(db, guildId);
  if (existing) {
    return resolveAgainstExistingGuild(db, userId, existing);
  }

  try {
    return await db.transaction(async (tx) => {
      const tenant = await createTenant(tx, guildName);
      await createGuild(tx, tenant.id, guildId, guildName);
      await createTenantMembership(tx, tenant.id, userId, "owner");
      return { outcome: "created" as const, tenantId: tenant.id };
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const winner = await findGuildByIdAcrossTenants(db, guildId);
    if (!winner) {
      // Should not happen (the duplicate-key error means a row exists) --
      // surfacing the original error is safer than silently swallowing it.
      throw error;
    }
    return resolveAgainstExistingGuild(db, userId, winner);
  }
}
