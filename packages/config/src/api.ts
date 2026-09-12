import { z } from "zod";
import { loadConfig } from "./env.js";
import { databaseConfigSchema } from "./database.js";

/**
 * apps/api is the only workspace that composes the database schema into its
 * own config, per docs/adr/0002 — it is the sole authorized holder of
 * database credentials.
 */
export const apiConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: z.coerce.number().int().positive().default(8787),
  })
  .extend(databaseConfigSchema.shape);

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return loadConfig("apps/api", apiConfigSchema, source);
}
