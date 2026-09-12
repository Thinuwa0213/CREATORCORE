import { defineConfig } from "drizzle-kit";
import { loadDatabaseConfig } from "@creatorcore/config/database";

/**
 * drizzle-kit is wired for real, but src/schema.ts defines zero tables
 * (docs/adr/0006 locks the conceptual model only, not a physical schema —
 * see README.md). Running `db:generate` against an empty schema produces no
 * migrations, which is the honest Phase 2 state, not a placeholder.
 *
 * Credentials come from the same @creatorcore/config schema apps/api uses —
 * not a second, independently-maintained copy of the DB_* variable names
 * (a duplication found during Gate 2 architecture review). `db:generate`
 * only diffs the schema and never connects, so it works with no env vars
 * set at all via the fallback below; `db:migrate`/`db:push` do connect and
 * need real DB_* values.
 */
function resolveDbCredentials() {
  try {
    return loadDatabaseConfig();
  } catch {
    return {
      DB_HOST: "127.0.0.1",
      DB_PORT: 3306,
      DB_NAME: "creatorcore",
      DB_USER: "creatorcore",
      DB_PASSWORD: "",
    };
  }
}

const dbConfig = resolveDbCredentials();

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: dbConfig.DB_HOST,
    port: dbConfig.DB_PORT,
    database: dbConfig.DB_NAME,
    user: dbConfig.DB_USER,
    password: dbConfig.DB_PASSWORD,
  },
});
