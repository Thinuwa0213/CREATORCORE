import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { DatabaseConfig } from "@creatorcore/config";
import * as schema from "./schema.js";

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
 */
export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
  const pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    connectionLimit: config.DB_CONNECTION_LIMIT,
    charset: "utf8mb4",
  });

  const db = drizzle(pool, { schema, casing: "snake_case", mode: "default" });

  return {
    pool,
    db,
    close: () => pool.end(),
  };
}
