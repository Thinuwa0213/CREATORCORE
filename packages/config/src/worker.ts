import { z } from "zod";
import { loadConfig } from "./env.js";

/**
 * Worker configuration. Per docs/adr/0002, apps/worker never holds database
 * credentials (DATABASE_URL) and never touches MySQL directly — this schema
 * intentionally has no DB_* fields and never exposes WORKER_TOKEN_SIGNING_KEY.
 *
 * WORKER_BOOTSTRAP_SECRET (docs/adr/0011, Phase 4A) is the initial bootstrap
 * credential exchanged with apps/api for a short-lived access token.
 * Per Amendment 3:
 * - May originate from the process environment (e.g. injected via container
 *   environment, Kubernetes secret, or operator .env).
 * - CreatorCore itself never writes it to disk, never logs it, never serializes
 *   it, never places it in URLs or query strings, and never exposes it through
 *   diagnostics.
 * - Access tokens remain process-memory only.
 * - Compatible with future direct secret-manager injection.
 */
export const workerConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WORKER_ID: z.string().min(1).max(64).optional(),
  WORKER_BOOTSTRAP_SECRET: z.string().min(1).optional(),
  API_BASE_URL: z.string().url().default("http://localhost:8787"),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadWorkerConfig(
  source: Record<string, string | undefined> = process.env,
): WorkerConfig {
  return loadConfig("apps/worker", workerConfigSchema, source);
}
