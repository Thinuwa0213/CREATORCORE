import { z } from "zod";
import { loadConfig } from "./env.js";

/**
 * Database configuration. Per docs/adr/0002-backend-api-architecture.md,
 * only `apps/api` (via `@creatorcore/db`) may ever load this — `apps/web`
 * and `apps/worker` must never hold database credentials.
 */
export const databaseConfigSchema = z.object({
  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1, "DB_NAME is required"),
  DB_USER: z.string().min(1, "DB_USER is required"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export function loadDatabaseConfig(
  source: Record<string, string | undefined> = process.env,
): DatabaseConfig {
  return loadConfig("database", databaseConfigSchema, source);
}
