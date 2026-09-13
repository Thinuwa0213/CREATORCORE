import { bigint, int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { users } from "./users.js";
import { customBinary } from "./lib/binary-column.js";

/**
 * Encrypted Discord OAuth access/refresh tokens for a signed-in CreatorCore
 * user (Phase 5, Amendment 1/2). Deliberately a separate table from Better
 * Auth's own `account` table: Better Auth's `accessToken`/`refreshToken`
 * columns are unconditionally blanked by the `account.create.before` /
 * `account.update.before` database hooks (apps/api/src/auth) before Better
 * Auth ever persists a row, so Better Auth's table never holds real Discord
 * token material — this table is the sole holder of usable Discord
 * credentials, encrypted with a key domain independent of
 * BOT_CREDENTIAL_ENCRYPTION_KEY (docs/adr/0007's bot-credential envelope).
 *
 * `accountId` is the Discord user snowflake, which already equals `users.id`
 * (see users.ts) — used directly as the primary key rather than a surrogate,
 * matching that table's own identity convention.
 *
 * `ciphertext` holds one AES-256-GCM-encrypted JSON payload
 * (`{ accessToken, refreshToken }`), not two independently-encrypted
 * columns: encrypting accessToken and refreshToken separately under the
 * same nonce would be nonce reuse (a broken AES-GCM usage), and generating
 * two independent nonces for one logical credential adds columns for no
 * real benefit. One ciphertext/nonce/authTag triple, same shape as
 * bot_credentials, so key rotation is actually implementable (never a
 * packed string with no version field).
 *
 * Only ever written by `create.before` (full identity is proven present
 * there) and by CreatorCore's own `DiscordGuildProvider` refresh logic —
 * never by Better Auth's own update-triggered writes, which lack sufficient
 * identity to safely re-encrypt (see the Phase 5 design doc's Step 0
 * finding).
 */
export const discordOauthCredentials = mysqlTable("discord_oauth_credentials", {
  accountId: bigint("account_id", { mode: "bigint", unsigned: true })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  ciphertext: customBinary("ciphertext", 4096).notNull(),
  nonce: customBinary("nonce", 24).notNull(),
  authTag: customBinary("auth_tag", 16).notNull(),
  keyVersion: int("key_version").notNull().default(1),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
