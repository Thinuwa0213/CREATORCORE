import { char, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { botApplications } from "./bot-applications.js";
import { workers } from "./workers.js";

/**
 * Exclusive, leased runtime ownership of a BotApplication by a Worker
 * (docs/adr/0006). PK is `botApplicationId` directly -- this is a
 * CURRENT-CLAIM-STATE table, exactly one row per BotApplication that ever
 * gets claimed, not an append log. History of claim/release/reclaim events
 * lives in AuditEvent, not here. Keying by botApplicationId makes "at most
 * one owner per BotApplication" a trivial PK guarantee -- MySQL has no
 * partial/filtered unique index, so this is the structural alternative:
 * it is not merely difficult to have two owner rows for one BotApplication,
 * it is impossible, because there is only ever one row.
 *
 * `claimedAt`/`leaseExpiresAt`/`lastHeartbeatAt`/`releasedAt` are always
 * server/database timestamps (NOW() at the query, or computed server-side
 * before the query) -- never a worker-supplied clock value, per the
 * explicit "do not rely on untrusted worker clock values as authoritative
 * lease time" requirement. See repositories/worker-assignments.ts for the
 * claim/renew/release transaction logic and the eligibility check
 * (worker-eligibility.ts) that gates every claim/reclaim.
 */
export const workerAssignments = mysqlTable("worker_assignments", {
  botApplicationId: char("bot_application_id", { length: 36 })
    .primaryKey()
    .references(() => botApplications.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id", { length: 64 })
    .notNull()
    .references(() => workers.id, { onDelete: "restrict" }),
  status: mysqlEnum("status", ["ACTIVE", "RELEASED"]).notNull().default("ACTIVE"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  leaseExpiresAt: timestamp("lease_expires_at").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  releasedAt: timestamp("released_at"),
});
