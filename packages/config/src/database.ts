import { z } from "zod";
import { loadConfig } from "./env.js";

const SUPPORTED_PROTOCOLS = new Set(["mysql:"]);

/**
 * Structural validation only — parses with the platform `URL` class and
 * checks protocol/host/database-path shape. Never echoes `value` (or any
 * substring of it) in an issue message: `value` may contain the password,
 * and per docs/SECURITY.md's "Database credentials [LOCKED — principle]"
 * that must never appear in a thrown error. Reporting the scheme alone
 * (e.g. "postgres:") is safe — it is never credential-bearing.
 */
function validateMysqlUrl(value: string, ctx: z.RefinementCtx) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "DATABASE_URL must be a valid URL" });
    return;
  }

  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    ctx.addIssue({
      code: "custom",
      message: `DATABASE_URL protocol must be mysql:, received ${parsed.protocol}`,
    });
  }

  if (!parsed.hostname) {
    ctx.addIssue({ code: "custom", message: "DATABASE_URL must include a host" });
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    ctx.addIssue({ code: "custom", message: "DATABASE_URL must include a database name" });
  }
}

/**
 * Per docs/adr/0002-backend-api-architecture.md, only `apps/api` (via
 * `@creatorcore/db`) may ever load this — `apps/web` and `apps/worker` must
 * never hold database credentials. A single `DATABASE_URL` is the whole
 * contract (`mysql://user:password@host:port/database`); mysql2/drizzle-kit
 * consume it directly (both support a connection-string form), so this
 * package does not maintain a second, competing parse of its parts.
 */
export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").superRefine(validateMysqlUrl),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export function loadDatabaseConfig(
  source: Record<string, string | undefined> = process.env,
): DatabaseConfig {
  return loadConfig("database", databaseConfigSchema, source);
}
