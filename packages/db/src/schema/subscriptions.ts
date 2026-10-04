import { boolean, char, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { tenants } from "./tenants.js";

/**
 * Tenant subscriptions (SaaS Billing & Tiered Entitlements).
 * Strictly scoped per Tenant (one subscription per tenant).
 */
export const tenantSubscriptions = mysqlTable(
  "tenant_subscriptions",
  {
    id: char("id", { length: 36 }).primaryKey(),
    tenantId: char("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    plan: mysqlEnum("plan", ["FREE", "PRO", "ENTERPRISE"]).notNull().default("FREE"),
    status: mysqlEnum("status", ["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"]).notNull().default("ACTIVE"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("tenant_subscriptions_tenant_id_unique").on(table.tenantId),
  ],
);
