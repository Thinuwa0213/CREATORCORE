import { char, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * A customer account (docs/adr/0006). `id` is generated application-side via
 * `crypto.randomUUID()` — MySQL forbids the non-deterministic `UUID()`
 * function in a column DEFAULT expression (unsafe for replication).
 *
 * `status` exists so a tenant can be disabled without deleting its data —
 * required by docs/TESTING.md's already-locked regression scenario
 * "disabled tenants cannot continue to perform privileged operations."
 *
 * The composite UNIQUE(id, id-equivalent) below is intentionally NOT added
 * here: nothing composite-FKs into tenants by (id, tenantId) the way
 * guild_bot_assignments does into guilds/bot_applications, since Tenant is
 * the root of the authorization chain, not a child of anything.
 */
export const tenants = mysqlTable("tenants", {
  id: char("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
