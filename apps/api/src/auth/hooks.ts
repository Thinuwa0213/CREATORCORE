import type { Logger } from "@creatorcore/logger";
import type { DatabaseClient } from "@creatorcore/db";
import {
  createUser,
  findAuthUserName,
  findUserById,
  upsertDiscordOauthCredential,
} from "@creatorcore/db";
import {
  encryptDiscordOauthCredential,
  type DiscordOauthTokenEncryptionKeys,
} from "../lib/credential-crypto.js";

const DISCORD_PROVIDER_ID = "discord";
const DISCORD_SNOWFLAKE_SHAPE = /^[0-9]{1,20}$/;

/**
 * The literal fields Better Auth's `account` model can carry, restricted to
 * what these hooks read/write. Matches `@better-auth/core`'s `Account`
 * shape (accountId/providerId/userId/accessToken/refreshToken/idToken/
 * accessTokenExpiresAt), transcribed rather than imported to keep this
 * file's contract explicit and independent of Better Auth's own type
 * export surface.
 */
interface AccountHookData {
  providerId?: string | undefined;
  accountId?: string | undefined;
  userId?: string | undefined;
  accessToken?: string | null | undefined;
  refreshToken?: string | null | undefined;
  idToken?: string | null | undefined;
  accessTokenExpiresAt?: Date | null | undefined;
}

export interface AccountDatabaseHooksDeps {
  db: DatabaseClient["db"];
  keys: DiscordOauthTokenEncryptionKeys;
  logger: Logger;
}

/** Every field a create.before/update.before hook may return to Better Auth, blanked. */
const BLANKED_TOKEN_FIELDS = { accessToken: null, refreshToken: null, idToken: null };

/**
 * Builds Better Auth's `databaseHooks.account` configuration (Phase 5,
 * Amendment 1/2). See the Phase 5 design doc's Step 0 finding for exactly
 * why `create` and `update` behave differently here — proven, not assumed,
 * against the actually-installed `better-auth@1.7.4` source:
 *
 * - `create.before` fires for every account-model INSERT Better Auth's own
 *   OAuth callback drives (both a brand-new sign-in and linking a new
 *   provider to an existing user). At this point the object always carries
 *   full identity (`accountId`, `providerId`, `userId` all present,
 *   confirmed at `@better-auth/core`'s own `Account` vs `Partial<Account>`
 *   type split between create/update hooks) — safe to encrypt-and-store the
 *   real Discord tokens into `discord_oauth_credentials`, keyed by the
 *   Discord snowflake (`accountId`).
 * - `update.before` fires for every account-model UPDATE, including
 *   Better Auth's native `/get-access-token` and `/refresh-token`
 *   endpoints' internal refresh writes and a repeat sign-in's token
 *   refresh — every one of those call sites passes only a partial delta
 *   that never includes `accountId` or `userId`. There is no reliable way
 *   to reconstruct the AAD identity component here, so this hook never
 *   attempts to encrypt or store anything: it unconditionally blanks the
 *   token fields. CreatorCore's own `DiscordGuildProvider` is the sole
 *   mechanism that refreshes the stored credential thereafter, writing
 *   directly to `discord_oauth_credentials` via its own repository calls
 *   (never through Better Auth's adapter, so this hook does not need to
 *   handle that write at all).
 *
 * Net effect: Better Auth's own `account` table never holds real Discord
 * token material, plaintext or ciphertext, on any code path — confirmed
 * unconditional, not contingent on correctly enumerating every caller.
 */
export function createAccountDatabaseHooks(deps: AccountDatabaseHooksDeps) {
  return {
    create: {
      before: async (account: AccountHookData) => {
        // A malformed (non-numeric) accountId is treated exactly like a
        // missing one -- BigInt() is never called on unvalidated input, so
        // this can never throw past the blanking return below (security
        // review: this was previously a bare `BigInt()` call outside any
        // try/catch, and Better Auth's own hook dispatcher has no
        // surrounding try/catch of its own around create.before).
        if (
          account.providerId !== DISCORD_PROVIDER_ID ||
          !account.accountId ||
          !DISCORD_SNOWFLAKE_SHAPE.test(account.accountId)
        ) {
          return { data: BLANKED_TOKEN_FIELDS };
        }

        const accountId = BigInt(account.accountId);

        try {
          // The CreatorCore users row must exist BEFORE the
          // discord_oauth_credentials insert below, which has a foreign
          // key on it -- this hook is the only place with full identity
          // (see this function's doc comment), so the sync happens here,
          // not in a create.after (which would run too late: Better
          // Auth's own createOAuthUser wraps user+account creation in one
          // transaction, and this hook's own writes do not participate in
          // it -- see the note at the bottom of this file).
          const existingUser = await findUserById(deps.db, accountId);
          if (!existingUser) {
            const displayName = account.userId
              ? await findAuthUserName(deps.db, account.userId)
              : undefined;
            await createUser(deps.db, accountId, displayName);
          }

          if (account.accessToken) {
            const plaintext = JSON.stringify({
              accessToken: account.accessToken,
              refreshToken: account.refreshToken ?? null,
            });
            const encrypted = encryptDiscordOauthCredential(plaintext, { accountId }, deps.keys);
            await upsertDiscordOauthCredential(deps.db, {
              accountId,
              ciphertext: encrypted.ciphertext,
              nonce: encrypted.nonce,
              authTag: encrypted.authTag,
              keyVersion: encrypted.keyVersion,
              expiresAt: account.accessTokenExpiresAt ?? null,
            });
          }
        } catch (error) {
          // Never let a crypto/DB failure here fall through to persisting
          // a plaintext token in Better Auth's own table -- the fields are
          // blanked either way (see the `return` below), and this is
          // logged as a genuine operational failure (never token
          // material, per docs/DISCORD_RULES.md).
          deps.logger.error("discord_oauth_credential.store_failed", {
            accountId: account.accountId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return { data: BLANKED_TOKEN_FIELDS };
      },
    },
    update: {
      before: async () => {
        return { data: BLANKED_TOKEN_FIELDS };
      },
    },
  };
}

/**
 * Note on transactional scope: Better Auth's own `createOAuthUser` wraps
 * user+account creation in one Drizzle transaction, but a `databaseHooks`
 * function receives only `(data, context)` — no transaction handle — so
 * this hook's own writes (the CreatorCore `users` row, the
 * `discord_oauth_credentials` row) necessarily run outside that
 * transaction, on `deps.db` directly. In the narrow window where this
 * hook's writes succeed but Better Auth's own outer transaction then fails
 * to commit, an orphaned `users`/`discord_oauth_credentials` row can
 * result — never a security issue (no auth session or tenant/guild data
 * derives from an orphaned row absent a real, committed `auth_accounts`
 * link), and not avoidable within the hook API's own contract.
 */
