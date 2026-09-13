import type { MiddlewareHandler } from "hono";

/**
 * The only Better Auth native paths this app ever needs reachable (Phase 5
 * §1, security-review H1). A strict allowlist rather than a blocklist: an
 * unrecognized or future Better Auth path fails closed (404) instead of
 * being newly, silently exposed by a dependency upgrade. This is a second,
 * independent layer over Better Auth's own `disabledPaths`
 * (apps/api/src/auth/index.ts) — not a replacement for it.
 *
 * Mounted under Hono's `/api/auth/*`; `subPath` here is with that prefix
 * already stripped.
 */
const ALLOWED_SUFFIXES = [
  "/sign-in/social",
  "/sign-out",
  "/get-session",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/ok",
  "/error",
];

const ALLOWED_PREFIXES = ["/callback/"];

export function isAllowedBetterAuthPath(subPath: string): boolean {
  if (ALLOWED_SUFFIXES.includes(subPath)) {
    return true;
  }
  return ALLOWED_PREFIXES.some((prefix) => subPath.startsWith(prefix));
}

export function createAuthPathAllowlistMiddleware(mountPath: string): MiddlewareHandler {
  return async (c, next) => {
    const fullPath = new URL(c.req.url).pathname;
    const subPath = fullPath.startsWith(mountPath) ? fullPath.slice(mountPath.length) : fullPath;

    if (!isAllowedBetterAuthPath(subPath)) {
      return c.json({ error: "not_found" }, 404);
    }

    return next();
  };
}
