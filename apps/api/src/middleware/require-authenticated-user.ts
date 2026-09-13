import type { MiddlewareHandler } from "hono";
import { findDiscordAccountIdByBetterAuthUserId, type DatabaseClient } from "@creatorcore/db";
import type { Auth } from "../auth/index.js";

export interface AuthenticatedUserEnv {
  Variables: {
    userId: bigint;
  };
}

export interface RequireAuthenticatedUserDeps {
  auth: Auth;
  db: DatabaseClient["db"];
}

/**
 * Resolves the caller's identity from Better Auth's own session cookie,
 * forwarded verbatim by apps/web (Phase 5 §1 — the web->API identity
 * boundary hard gate). `apps/web` never decodes this cookie or supplies a
 * `userId` of its own; the ONLY source of identity here is whatever
 * `auth.api.getSession` resolves from the forwarded `Cookie` header.
 *
 * Better Auth's own `session.userId` is its own internal identity, not
 * CreatorCore's — one additional lookup (`findDiscordAccountIdByBetterAuthUserId`)
 * bridges to the Discord snowflake, which already equals CreatorCore's
 * `users.id` (see packages/db/src/schema/users.ts). Every downstream
 * authorization check in apps/api/src/authz uses this resolved `userId`,
 * never anything read directly from the request.
 */
export function createRequireAuthenticatedUser(
  deps: RequireAuthenticatedUserDeps,
): MiddlewareHandler<AuthenticatedUserEnv> {
  return async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "AUTH_REQUIRED" }, 401);
    }

    const userId = await findDiscordAccountIdByBetterAuthUserId(deps.db, session.user.id);
    if (userId === undefined) {
      return c.json({ error: "AUTH_REQUIRED" }, 401);
    }

    c.set("userId", userId);
    return next();
  };
}
