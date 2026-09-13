import { bigint, char, foreignKey, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { botApplications } from "./bot-applications.js";
import { guilds } from "./guilds.js";

/**
 * Join entity between BotApplication and Guild (docs/adr/0006). PK is
 * `guildId` directly, not a separate UUID — a guild has at most one active
 * bot assignment at a time (one-to-one current state), so keying by the
 * natural single-owner column makes "one assignment per guild" a trivial PK
 * guarantee instead of a separate unique constraint. Reassigning a guild's
 * bot is an UPDATE (see repositories/guild-bot-assignments.ts), not an
 * insert of a new row — history lives in AuditEvent, not here.
 *
 * Tenant consistency for this relationship is enforced as a REAL DATABASE
 * CONSTRAINT, not just application logic: both foreign keys below are
 * composite, referencing each parent's (id, tenantId) composite unique key
 * rather than just its primary key. This makes it structurally impossible
 * to insert a row where this guild's tenant and this bot application's
 * tenant disagree — MySQL/InnoDB rejects the INSERT outright. This is what
 * closes the Guild -> GuildBotAssignment -> BotApplication two-hop IDOR
 * risk (docs/THREAT_MODEL.md, docs/adr/0006's Consequences section) at the
 * schema level, not only via repository-layer checks.
 *
 * No separate single-column FKs on guildId/botApplicationId exist — the
 * composite FKs already imply membership in each parent's primary key.
 * Both cascade on delete: if the tenant is later deleted, the cascade from
 * tenants -> guilds/bot_applications must not be blocked by this table
 * (an earlier draft mixed CASCADE/RESTRICT here, which is a real bug —
 * InnoDB does not guarantee cascade-check ordering across a multi-table
 * cascade, so a RESTRICT here could non-deterministically fail a tenant
 * deletion depending on which cascade path InnoDB evaluates first).
 */
export const guildBotAssignments = mysqlTable(
  "guild_bot_assignments",
  {
    guildId: bigint("guild_id", { mode: "bigint", unsigned: true }).primaryKey(),
    botApplicationId: char("bot_application_id", { length: 36 }).notNull(),
    tenantId: char("tenant_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    foreignKey({
      name: "guild_bot_assignments_guild_tenant_fk",
      columns: [table.guildId, table.tenantId],
      foreignColumns: [guilds.id, guilds.tenantId],
    }).onDelete("cascade"),
    foreignKey({
      name: "guild_bot_assignments_bot_application_tenant_fk",
      columns: [table.botApplicationId, table.tenantId],
      foreignColumns: [botApplications.id, botApplications.tenantId],
    }).onDelete("cascade"),
  ],
);
