import { z } from "zod";
import { loadConfig } from "./env.js";

/**
 * Worker configuration. Per docs/adr/0002, apps/worker never holds database
 * credentials and never touches MySQL directly — this schema intentionally
 * has no DB_* fields. WORKER_ID is a plain correlation identifier for
 * structured logs (docs/adr/0010), not the ADR-0011 worker identity/auth
 * credential — that bootstrap-secret/short-lived-token exchange is
 * deliberately not implemented yet (see apps/worker/README.md).
 */
export const workerConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WORKER_ID: z.string().min(1).optional(),
  API_BASE_URL: z.string().url().default("http://localhost:8787"),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadWorkerConfig(
  source: Record<string, string | undefined> = process.env,
): WorkerConfig {
  return loadConfig("apps/worker", workerConfigSchema, source);
}
