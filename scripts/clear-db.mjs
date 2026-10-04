#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

if (fs.existsSync(path.join(repoRoot, ".env"))) {
  process.loadEnvFile(path.join(repoRoot, ".env"));
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[clear-db] DATABASE_URL is not set in environment or .env");
  process.exit(1);
}

const require = createRequire(path.join(repoRoot, "packages/db/package.json"));
const mysql = require("mysql2/promise");

const pool = mysql.createPool({ uri: databaseUrl, supportBigNumbers: true });

// Tables to truncate in clean order (excluding __drizzle_migrations)
const TABLES_TO_TRUNCATE = [
  "audit_events",
  "bot_runtime_status",
  "worker_assignments",
  "worker_eligibility",
  "guild_bot_assignments",
  "bot_credentials",
  "bot_applications",
  "workers",
  "tenant_memberships",
  "guilds",
  "tenants",
  "discord_oauth_credentials",
  "auth_sessions",
  "auth_accounts",
  "auth_verifications",
  "auth_users",
  "users",
];

async function clearDatabase() {
  console.log("🧹 Clearing test data from CreatorCore database...");
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");
    for (const table of TABLES_TO_TRUNCATE) {
      try {
        await conn.query(`TRUNCATE TABLE \`${table}\`;`);
        console.log(`  ✓ Cleared table: ${table}`);
      } catch (err) {
        console.warn(`  ⚠ Could not truncate ${table} (may not exist): ${err.message}`);
      }
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("✨ All test data has been successfully cleared! Schema and migrations preserved.");
    console.log("💡 Tip: If running apps/worker locally, run `pnpm worker:provision` to re-seed the local worker.");
  } finally {
    conn.release();
    await pool.end();
  }
}

clearDatabase().catch((err) => {
  console.error("❌ Failed to clear database:", err);
  process.exit(1);
});
