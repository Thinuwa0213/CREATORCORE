import { bigint, char, mysqlEnum, mysqlTable, primaryKey, timestamp } from "drizzle-orm/mysql-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Join entity between User and Tenant (docs/adr/0006). Composite PK
 * (tenantId, userId) structurally enforces "at most one membership row per
 * user per tenant" — a user's role for a given tenant is unambiguous by
 * construction, not by an extra uniqueness check. `role` is a plain enum;
 * no fine-grained permission system yet (explicitly out of Phase 3 scope).
 */
export const tenantMemberships = mysqlTable(
  "tenant_memberships",
  {
    tenantId: char("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "bigint", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["owner", "admin", "member"]).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId] })],
);
