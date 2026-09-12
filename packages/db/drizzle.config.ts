import { defineConfig } from "drizzle-kit";
import { loadDatabaseConfig } from "@creatorcore/config/database";

/**
 * drizzle-kit is wired for real, but src/schema.ts defines zero tables
 * (docs/adr/0006 locks the conceptual model only, not a physical schema —
 * see README.md). Running `db:generate` against an empty schema produces no
 * migrations, which is the honest Phase 2 state, not a placeholder.
 *
 * The URL comes from the same @creatorcore/config schema apps/api uses —
 * not a second, independently-maintained copy of the contract (a
 * duplication found during Gate 2 architecture review). `db:generate` only
 * diffs the schema and never connects, so it works with no env vars set at
 * all via the fallback below; `db:migrate`/`db:push` do connect and need a
 * real `DATABASE_URL`.
 */
function resolveDatabaseUrl(): string {
  try {
    return loadDatabaseConfig().DATABASE_URL;
  } catch {
    return "mysql://creatorcore:@127.0.0.1:3306/creatorcore";
  }
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
