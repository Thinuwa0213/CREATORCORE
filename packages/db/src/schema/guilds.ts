import { bigint, char, mysqlTable, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
import { tenants } from "./tenants.js";

/**
 * A Discord server connected under exactly one Tenant (docs/adr/0006). PK is
 * the Discord guild snowflake itself — no surrogate key, since it's already
 * a globally-unique, immutable natural key and using it directly preserves
 * exact precision (bigint unsigned, never a JS number).
 *
 * The composite UNIQUE(id, tenantId) is redundant with the PK alone but is
 * required as the target of guild_bot_assignments' composite foreign key,
 * which is how tenant-consistency for the Guild<->BotApplication join is
 * enforced at the database level (see guild-bot-assignments.ts).
 */
export const guilds = mysqlTable(
  "guilds",
  {
    id: bigint("id", { mode: "bigint", unsigned: true }).primaryKey(),
    tenantId: char("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [unique("guilds_id_tenant_id_uq").on(table.id, table.tenantId)],
);
