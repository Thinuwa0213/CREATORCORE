import { z } from "zod";
import { loadConfig } from "./env.js";

/**
 * Web configuration. `apps/web` must never receive server secrets
 * (docs/adr/0001, docs/SECURITY.md) — every field here is safe to expose to
 * the browser via Next.js's `NEXT_PUBLIC_*` convention. If a future Phase
 * needs a server-only value for `apps/web` (e.g. a value used only in a
 * Server Action before forwarding to apps/api), it must use a plain
 * (non-`NEXT_PUBLIC_`) field in a *separate* schema — never added here by
 * reflex, since everything in this schema is treated as browser-visible.
 */
export const webConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("CreatorCore"),
});

export type WebConfig = z.infer<typeof webConfigSchema>;

export function loadWebConfig(source: Record<string, string | undefined> = process.env): WebConfig {
  return loadConfig("apps/web", webConfigSchema, source);
}
