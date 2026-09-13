import { z } from "zod";
import { loadConfig } from "./env.js";
import { databaseConfigSchema } from "./database.js";

/**
 * apps/api is the only workspace that composes the database schema into its
 * own config, per docs/adr/0002 — it is the sole authorized holder of
 * database credentials.
 *
 * WORKER_TOKEN_SIGNING_KEY (docs/adr/0011) is the HMAC key apps/api uses to
 * sign/verify short-lived worker access tokens — it never leaves apps/api;
 * the worker receives only the issued token, never this key. It gets the
 * exact same isolation as DATABASE_URL for free: apiConfigSchema is
 * reachable only via the /api subpath, never the bare package entry point
 * (see index.ts) — no separate re-export rule is needed per field.
 * WORKER_TOKEN_SIGNING_KEY_VERSION/_PREVIOUS support signing-key rotation
 * with a cutover window (see apps/api/src/lib/worker-token.ts): tokens are
 * always issued under the current key, tagged with the current version;
 * verification also accepts the previous key for tokens issued just before
 * a rotation, until they naturally expire.
 */
export const apiConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: z.coerce.number().int().positive().default(8787),
    WORKER_TOKEN_SIGNING_KEY: z.string().min(32, "WORKER_TOKEN_SIGNING_KEY must be at least 32 characters"),
    WORKER_TOKEN_SIGNING_KEY_VERSION: z.coerce.number().int().positive().default(1),
    WORKER_TOKEN_SIGNING_KEY_PREVIOUS: z.string().min(32).optional(),
  })
  .extend(databaseConfigSchema.shape);

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return loadConfig("apps/api", apiConfigSchema, source);
}
