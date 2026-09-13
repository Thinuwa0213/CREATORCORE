import { z } from "zod";
import { loadConfig } from "./env.js";

/**
 * Server-only configuration for `apps/web` (Phase 5, docs/adr/0002/0003).
 *
 * `web.ts`'s own header comment anticipates exactly this file: every field
 * in `webConfigSchema` is treated as browser-visible, so a value that must
 * never reach client code — used only inside a Server Action/Route Handler
 * before forwarding a request to `apps/api` — belongs here instead, in a
 * schema with no `NEXT_PUBLIC_*` fields and no relationship to the client
 * bundle. Never import this module from a "use client" component.
 *
 * `API_INTERNAL_URL` is where `apps/web`'s server-side code sends the
 * forwarded session cookie / Origin header for every privileged operation
 * (docs/adr/0002's "calls the backend server-side" boundary) — it is
 * `apps/api`'s internal, non-public address, not the same as `WEB_APP_ORIGIN`
 * (apps/api's own config, which is the public web-facing origin used for
 * Better Auth's baseURL and the CSRF origin allowlist).
 */
export const webServerConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  API_INTERNAL_URL: z.url({ message: "API_INTERNAL_URL must be a valid absolute URL" }),
});

export type WebServerConfig = z.infer<typeof webServerConfigSchema>;

export function loadWebServerConfig(
  source: Record<string, string | undefined> = process.env,
): WebServerConfig {
  return loadConfig("apps/web (server-only)", webServerConfigSchema, source);
}
