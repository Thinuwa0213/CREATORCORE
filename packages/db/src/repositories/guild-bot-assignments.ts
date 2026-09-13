import { and, eq } from "drizzle-orm";
import { botApplications, guildBotAssignments, guilds } from "../schema/index.js";
import type { Db } from "../types.js";
import { assertTenantActive } from "./tenants.js";

export interface ResolvedGuildBotAssignment {
  guildId: bigint;
  botApplicationId: string;
  tenantId: string;
}

/**
 * The concrete two-hop-safe resolver for the Guild -> GuildBotAssignment ->
 * BotApplication chain (docs/THREAT_MODEL.md's two-hop credential-resolution
 * risk, docs/adr/0006). A single query joins guild_bot_assignments to BOTH
 * guilds and bot_applications, filtering on the caller's authorized
 * tenantId against BOTH parents in the same query -- a tenant mismatch at
 * either hop yields zero rows structurally, not via a separate app-level
 * double-check that could be forgotten on some other call path.
 */
export async function resolveBotApplicationForGuild(
  db: Db,
  tenantId: string,
  guildId: bigint,
): Promise<ResolvedGuildBotAssignment | undefined> {
  const [row] = await db
    .select({
      guildId: guildBotAssignments.guildId,
      botApplicationId: guildBotAssignments.botApplicationId,
      tenantId: guildBotAssignments.tenantId,
    })
    .from(guildBotAssignments)
    .innerJoin(
      guilds,
      and(eq(guilds.id, guildBotAssignments.guildId), eq(guilds.tenantId, tenantId)),
    )
    .innerJoin(
      botApplications,
      and(
        eq(botApplications.id, guildBotAssignments.botApplicationId),
        eq(botApplications.tenantId, tenantId),
      ),
    )
    .where(
      and(eq(guildBotAssignments.guildId, guildId), eq(guildBotAssignments.tenantId, tenantId)),
    )
    .limit(1);
  return row;
}

/**
 * Reverse of `resolveBotApplicationForGuild` — the guild(s) a BotApplication
 * is currently assigned to, tenant-scoped. Used by the credential-rotation
 * route (task §16) to resolve which Discord guild to synchronously
 * re-verify the caller's management authority against before rotating a
 * bot's credential.
 */
export async function listGuildsForBotApplication(
  db: Db,
  tenantId: string,
  botApplicationId: string,
): Promise<bigint[]> {
  const rows = await db
    .select({ guildId: guildBotAssignments.guildId })
    .from(guildBotAssignments)
    .where(
      and(
        eq(guildBotAssignments.botApplicationId, botApplicationId),
        eq(guildBotAssignments.tenantId, tenantId),
      ),
    );
  return rows.map((row) => row.guildId);
}

/**
 * Creates or replaces a guild's bot assignment. This is mutable
 * current-state, not append-only (see schema/guild-bot-assignments.ts) --
 * a guild has at most one active assignment, so reassigning is an upsert,
 * not an insert of a second row. tenantId is required and used to verify
 * the caller's authorized guild/bot-application chain before writing, in
 * addition to the schema-level composite-FK tenant-consistency guarantee.
 *
 * assertTenantActive is required here too (Phase 3 review finding M1) --
 * without it, a disabled tenant's guild/bot-application rows (which still
 * exist; disabling never cascade-deletes) could still have their assignment
 * changed, violating docs/TESTING.md's locked "disabled tenants cannot
 * continue to perform privileged operations" scenario. The composite FK
 * only guards tenant *consistency*, never tenant *status*.
 */
export async function reassignBotForGuild(
  db: Db,
  tenantId: string,
  guildId: bigint,
  botApplicationId: string,
): Promise<void> {
  await assertTenantActive(db, tenantId);
  await db
    .insert(guildBotAssignments)
    .values({ guildId, botApplicationId, tenantId })
    .onDuplicateKeyUpdate({ set: { botApplicationId, tenantId } });
}
