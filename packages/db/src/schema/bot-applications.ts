import { bigint, char, mysqlTable, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
import { tenants } from "./tenants.js";

/**
 * A client-owned Discord bot application connected to exactly one Tenant
 * (docs/adr/0006). PK is an app-generated opaque UUID rather than the
 * Discord application snowflake — kept internal/opaque so other tables
 * reference it by a non-guessable, non-sequential ID, reducing the
 * cross-tenant enumeration/probing surface for this security-sensitive
 * entity. The Discord application ID is retained as a unique attribute.
 *
 * No plaintext bot token column exists here or anywhere in this table —
 * credential material lives only in bot-credentials.ts, and even that is
 * inert scaffolding in Phase 3 (see its own file comment).
 *
 * Composite UNIQUE(id, tenantId): see guilds.ts for why this exists.
 */
export const botApplications = mysqlTable(
  "bot_applications",
  {
    id: char("id", { length: 36 }).primaryKey(),
    tenantId: char("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    discordApplicationId: bigint("discord_application_id", { mode: "bigint", unsigned: true })
      .notNull()
      .unique(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [unique("bot_applications_id_tenant_id_uq").on(table.id, table.tenantId)],
);
