import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import type { Auth as BetterAuthInstance } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Logger } from "@creatorcore/logger";
import type { DatabaseClient } from "@creatorcore/db";
import { authAccounts, authSessions, authUsers, authVerifications } from "@creatorcore/db";
import { buildDiscordSocialProvider } from "./discord-provider.js";
import { createAccountDatabaseHooks } from "./hooks.js";
import type { DiscordOauthTokenEncryptionKeys } from "../lib/credential-crypto.js";

export interface CreateAuthDeps {
  db: DatabaseClient["db"];
  logger: Logger;
  webAppOrigin: string;
  betterAuthSecret: string;
  discordClientId: string;
  discordClientSecret: string;
  discordOauthTokenKeys: DiscordOauthTokenEncryptionKeys;
}

/**
 * Every Better Auth native path this app does not use — the whole
 * email/password surface (out of scope: Discord OAuth only), and every
 * endpoint that reads or writes `account.accessToken`/`refreshToken` as
 * live plaintext (`/get-access-token`, `/refresh-token`, `/account-info`,
 * `/link-social`, `/unlink-account`, `/list-accounts`) — see the Phase 5
 * design doc's Step 0 finding on why those six specifically are
 * incompatible with this app's hook-based token handling. Better Auth's
 * own `disabledPaths` rejects these before their handlers run at all; the
 * `/api/auth` path-allowlist middleware in apps/api/src/middleware is a
 * second, independent layer over the same list (defense in depth, not
 * reliance on this array alone).
 */
export const DISABLED_BETTER_AUTH_PATHS = [
  "/get-access-token",
  "/refresh-token",
  "/account-info",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/sign-in/email",
  "/sign-up/email",
  "/change-password",
  "/reset-password",
  "/reset-password/:token",
  "/request-password-reset",
  "/verify-password",
  "/send-verification-email",
  "/verify-email",
  "/update-user",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
];

export function createAuth(deps: CreateAuthDeps): BetterAuthInstance<BetterAuthOptions> {
  const options: BetterAuthOptions = {
    baseURL: deps.webAppOrigin,
    trustedOrigins: [deps.webAppOrigin],
    secret: deps.betterAuthSecret,
    disabledPaths: DISABLED_BETTER_AUTH_PATHS,
    database: drizzleAdapter(deps.db, {
      provider: "mysql",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    socialProviders: {
      discord: buildDiscordSocialProvider({
        clientId: deps.discordClientId,
        clientSecret: deps.discordClientSecret,
      }),
    },
    account: {
      // Better Auth's own repeat-sign-in token refresh (updateAccountOnSignIn)
      // and account-linking are both surfaces this app never uses -- our own
      // DiscordGuildProvider is the sole refresh mechanism (see hooks.ts),
      // and there is exactly one provider to ever link.
      updateAccountOnSignIn: false,
      accountLinking: { enabled: false },
      storeAccountCookie: false,
    },
    databaseHooks: {
      account: createAccountDatabaseHooks({
        db: deps.db,
        keys: deps.discordOauthTokenKeys,
        logger: deps.logger,
      }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // rolling refresh once per day of activity
    },
  };

  // Widening the options to the base BetterAuthOptions type (rather than
  // letting TS infer this call's own literal options type) is required for
  // a portable declaration-emit build (tsc's isolated-declarations
  // constraint) -- otherwise the .d.ts build fails trying to name this
  // file's own internal hook-parameter types. This app only ever uses
  // auth.handler/auth.api.getSession/auth.$context.internalAdapter, none
  // of which depend on Options being narrowed beyond the base type.
  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
