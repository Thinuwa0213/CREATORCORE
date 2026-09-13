import { char, index, int, mysqlEnum, mysqlTable, timestamp } from "drizzle-orm/mysql-core";
import { botApplications } from "./bot-applications.js";
import { customBinary } from "./lib/binary-column.js";

/**
 * Bot credentials schema (docs/adr/0007-credential-encryption.md).
 *
 * AES-256-GCM envelope encryption at rest:
 * - ciphertext: encrypted bot token material (never plaintext)
 * - nonce: unique 12-byte IV for this encryption
 * - authTag: 16-byte authentication tag verifying ciphertext and AAD integrity
 * - keyVersion: KEK version used for encryption
 * - status: PENDING (rotation candidate) or ACTIVE (current working credential)
 * - activatedAt: timestamp when promoted to ACTIVE
 *
 * Plaintext bot tokens are never persisted in the database, logged, or exposed
 * to the browser dashboard.
 */
export const botCredentials = mysqlTable(
  "bot_credentials",
  {
    id: char("id", { length: 36 }).primaryKey(),
    botApplicationId: char("bot_application_id", { length: 36 })
      .notNull()
      .references(() => botApplications.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["PENDING", "ACTIVE", "SUPERSEDED"]).notNull(),
    keyVersion: int("key_version").notNull().default(1),
    ciphertext: customBinary("ciphertext", 4096).notNull(),
    nonce: customBinary("nonce", 24).notNull(),
    authTag: customBinary("auth_tag", 16).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
    activatedAt: timestamp("activated_at"),
    supersededAt: timestamp("superseded_at"),
  },
  (table) => [
    index("bot_credentials_app_status_idx").on(table.botApplicationId, table.status),
  ],
);

