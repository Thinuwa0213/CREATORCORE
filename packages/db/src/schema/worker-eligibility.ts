import { char, mysqlTable, primaryKey, timestamp, varchar } from "drizzle-orm/mysql-core";
import { botApplications } from "./bot-applications.js";
import { workers } from "./workers.js";

/**
 * The control-plane authorization record between "a worker's verified
 * identity" and "the specific BotApplication it may claim/host."
 *
 * A valid worker access token proves identity only (who is asking). It is
 * NOT sufficient authorization to claim an arbitrary BotApplication --
 * docs/adr/0006 requires claim creation to be an apps/api-side decision,
 * never a bare worker assertion. This table is that decision, recorded:
 * apps/api's own control-plane logic (assignEligibleWorkers, in
 * repositories/worker-eligibility.ts) populates it -- a worker can never
 * write to this table itself, directly or indirectly, through any request.
 *
 * Populated with a static, deterministic, least-loaded selection of up to 2
 * currently-ACTIVE workers at BotApplication creation time (matching the
 * two-replica HA baseline, ADR-0008) -- not a dynamic scheduler. Composite
 * PK (botApplicationId, workerId): a given worker is either eligible for a
 * given BotApplication or not, with no additional per-row metadata needed
 * in Phase 3.
 */
export const workerEligibility = mysqlTable(
  "worker_eligibility",
  {
    botApplicationId: char("bot_application_id", { length: 36 })
      .notNull()
      .references(() => botApplications.id, { onDelete: "cascade" }),
    workerId: varchar("worker_id", { length: 64 })
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.botApplicationId, table.workerId] })],
);
