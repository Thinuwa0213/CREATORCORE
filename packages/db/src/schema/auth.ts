import {
  boolean,
  index,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Better Auth's own identity/session tables (Phase 5, docs/adr/0003).
 *
 * Deliberately a separate identity space from CreatorCore's own `users`
 * table (Phase 3, keyed directly by the Discord snowflake): "auth identity
 * != tenant authorization" (task spec). These four tables' field shapes are
 * transcribed from the actually-installed `better-auth@1.7.4`'s own core
 * model definitions (`@better-auth/core/dist/db/schema/{user,session,
 * account,verification,shared}.mjs`) rather than accepted from a blindly
 * generated migration — reviewed column-by-column per ADR-0004.
 *
 * JS property keys on each table (e.g. `emailVerified`, `accountId`) must
 * match Better Auth's canonical field names exactly, since the Drizzle
 * adapter looks columns up by that key; the actual DB column name (the
 * string literal passed to each column builder) is free to follow this
 * codebase's own snake_case convention — Drizzle already treats these as
 * independent, exactly as every other table in this schema does.
 *
 * IDs are Better-Auth-generated opaque strings (default: 32-char
 * alphanumeric, `@better-auth/core/utils/id`), not CreatorCore UUIDs or
 * Discord snowflakes — sized generously (varchar(64)) for headroom.
 */

/**
 * `email` is unconditionally required by Better Auth's core `user` model
 * even though Phase 5 never requests Discord's `email` OAuth scope (task
 * spec: "do not request... email unless there is an actual requirement").
 * The Discord social-provider config's `mapProfileToUser` (apps/api/src/auth)
 * fills this with a synthetic, non-resolvable placeholder derived from the
 * Discord account id — never a real collected email address — solely to
 * satisfy this column's NOT NULL constraint.
 */
export const authUsers = mysqlTable("auth_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: varchar("name", { length: 255 }).notNull(),
  image: varchar("image", { length: 512 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_uq").on(table.token),
    index("auth_sessions_user_id_idx").on(table.userId),
  ],
);

/**
 * `accessToken`/`refreshToken`/`idToken` are unconditionally blanked to NULL
 * by the `account.create.before`/`account.update.before` database hooks
 * (apps/api/src/auth) before Better Auth's adapter ever writes a row — this
 * table never holds real Discord token material. The real, encrypted
 * credential lives in `discord_oauth_credentials`, keyed by
 * `accountId`/`users.id` (the Discord snowflake), owned by CreatorCore's own
 * repository layer, not Better Auth's.
 */
export const authAccounts = mysqlTable(
  "auth_accounts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    accessToken: varchar("access_token", { length: 2048 }),
    refreshToken: varchar("refresh_token", { length: 2048 }),
    idToken: varchar("id_token", { length: 2048 }),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: varchar("scope", { length: 512 }),
    password: varchar("password", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_uq").on(table.providerId, table.accountId),
    index("auth_accounts_user_id_idx").on(table.userId),
  ],
);

export const authVerifications = mysqlTable(
  "auth_verifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: varchar("value", { length: 1024 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);
