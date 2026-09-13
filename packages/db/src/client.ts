import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { DatabaseConfig } from "@creatorcore/config";
import * as schema from "./schema/index.js";

export interface DatabaseClient {
  /** Raw mysql2 pool — do not export this further; use `db` or add a scoped repository function. */
  pool: mysql.Pool;
  /** Drizzle query interface over the pool. */
  db: MySql2Database<typeof schema>;
  /** Closes all pooled connections. Call on graceful shutdown. */
  close(): Promise<void>;
}

/**
 * Creates the one controlled MySQL connection pool + Drizzle instance for
 * apps/api. Nothing outside this package should call `mysql2` directly
 * (docs/adr/0004-orm-data-layer.md) — consumers get `db` (or, once real
 * tables exist, a `findByTenantAndId`-shaped repository function), never a
 * bare "query anything" escape hatch.
 *
 * `config.DATABASE_URL` is passed straight through to mysql2's own
 * connection-string parser rather than re-parsed here (mysql2 extracts
 * host/port/user/password/database from the URI itself and already defaults
 * to a utf8mb4 charset — docs/DATABASE_RULES.md's locked engine charset —
 * when none is specified), so this package does not maintain a second,
 * competing parse of the same URL.
 *
 * `supportBigNumbers: true` is required, not optional, for Discord
 * snowflake exact precision (Phase 3 schema: guilds.id, users.id,
 * bot_applications.discord_application_id, etc. — all `bigint unsigned`).
 * Without it, mysql2 silently returns any BIGINT value exceeding
 * Number.MAX_SAFE_INTEGER as an imprecise JS `number` before Drizzle ever
 * sees it — Drizzle's own `bigint({mode:'bigint'})` mapper only converts
 * whatever driver value it is handed, so it cannot recover precision
 * mysql2 already lost. With this flag, mysql2 returns any value that
 * doesn't fit in a safe JS number as a string instead, which Drizzle's
 * bigint mapper correctly parses into a native `bigint`. Deliberately NOT
 * pairing this with `bigNumberStrings: true` — that would also stringify
 * ordinary small integers (e.g. bot_credentials.keyVersion), which several
 * schema columns intentionally use `bigint({mode:'number'})`/`int()` for.
 */
export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
  const pool = mysql.createPool({ uri: config.DATABASE_URL, supportBigNumbers: true });

  const db = drizzle(pool, { schema, casing: "snake_case", mode: "default" });

  return {
    pool,
    db,
    close: () => pool.end(),
  };
}
