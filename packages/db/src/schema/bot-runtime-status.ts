import { mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { botApplications } from "./bot-applications.js";
import { workers } from "./workers.js";

/**
 * Narrow, authenticated worker-reported runtime health (Phase 5 Amendment
 * 4). A `worker_assignments` heartbeat proves lease ownership/liveness, not
 * that the discord.js client reached Gateway `READY` — this table is the
 * one authoritative source for that distinction, so the dashboard never
 * infers `ONLINE` from assignment/heartbeat data alone.
 *
 * One row per BotApplication (PK), written only by the worker currently
 * holding its live `WorkerAssignment` (enforced at the write route, not
 * here — see apps/api/src/routes/internal/bot-runtime-status.ts). Never
 * holds token material or raw Discord error text: `errorCategory` is a
 * short internal code, not the raw error string (docs/DISCORD_RULES.md).
 */
export const botRuntimeStatus = mysqlTable("bot_runtime_status", {
  botApplicationId: varchar("bot_application_id", { length: 36 })
    .primaryKey()
    .references(() => botApplications.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id", { length: 64 })
    .notNull()
    .references(() => workers.id, { onDelete: "restrict" }),
  state: mysqlEnum("state", ["STARTING", "READY", "ERROR", "STOPPED"]).notNull(),
  connectedAt: timestamp("connected_at"),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  discordBotUserId: varchar("discord_bot_user_id", { length: 32 }),
  errorCategory: varchar("error_category", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
