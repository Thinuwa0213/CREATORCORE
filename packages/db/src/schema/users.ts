import { bigint, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * A person who has logged in via Discord at least once (docs/adr/0006).
 * Identified globally by Discord user ID — no surrogate key, since the
 * Discord snowflake already is the natural, globally-unique identity. No
 * session/OAuth columns: ADR-0003 (Better Auth) is not implemented in
 * Phase 3.
 */
export const users = mysqlTable("users", {
  id: bigint("id", { mode: "bigint", unsigned: true }).primaryKey(),
  discordUsername: varchar("discord_username", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
