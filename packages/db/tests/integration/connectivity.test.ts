import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { loadDatabaseConfig } from "@creatorcore/config/database";

/**
 * Real MySQL 8.x integration test — no SQLite substitution
 * (docs/DATABASE_RULES.md). If no MySQL instance is reachable in this
 * environment (no DB_* env vars, or genuinely unreachable), the suite skips
 * visibly rather than faking a pass. Report this distinction honestly in
 * any status report: "skipped, no DB reachable" is CONFIGURED BUT NOT
 * VERIFIED, never PASS.
 */
async function probeDatabase(): Promise<boolean> {
  try {
    const config = loadDatabaseConfig();
    const connection = await mysql.createConnection({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      connectTimeout: 2000,
    });
    await connection.end();
    return true;
  } catch {
    return false;
  }
}

const dbAvailable = await probeDatabase();

if (!dbAvailable) {
  console.warn(
    "[packages/db] MySQL integration test SKIPPED — no reachable database " +
      "(set DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD to a real MySQL 8.x " +
      "instance to run this for real). This is CONFIGURED BUT NOT VERIFIED, " +
      "not a pass.",
  );
}

describe.skipIf(!dbAvailable)("MySQL connectivity (real database)", () => {
  it("connects, runs SELECT 1, verifies the response, and closes cleanly", async () => {
    const config = loadDatabaseConfig();
    const connection = await mysql.createConnection({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
    });

    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT 1 AS result");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.result).toBe(1);
    } finally {
      await connection.end();
    }
  });
});
