import { char, int, mysqlEnum, mysqlTable, timestamp, varbinary } from "drizzle-orm/mysql-core";
import { botApplications } from "./bot-applications.js";

/**
 * INERT SCAFFOLDING ONLY (docs/adr/0007). This table exists so Phase 3
 * implementation starts inside the future encryption-boundary constraint
 * rather than retrofitting it later (see packages/db/README.md's
 * "WorkerAssignment credential-access boundary" section, which already
 * reserves `getCredentialForAssignedWorker(workerId, botApplicationId)` as
 * the eventual, not-yet-built, access function).
 *
 * NO repository or service function reads or writes this table anywhere in
 * Phase 3. No encryption flow, no rotation lifecycle, and no credential
 * issuance/decryption endpoint are implemented here -- all of that is
 * ADR-0007 implementation work, explicitly out of Phase 3 scope.
 *
 * `ciphertext`/`nonce` are opaque encrypted bytes -- there is no plaintext
 * token column, and there never will be one, per docs/SECURITY.md's locked
 * rule. `keyVersion` reserves the concept for future KEK-rotation
 * bookkeeping (ADR-0007) without implementing rotation now.
 */
export const botCredentials = mysqlTable("bot_credentials", {
  id: char("id", { length: 36 }).primaryKey(),
  botApplicationId: char("bot_application_id", { length: 36 })
    .notNull()
    .references(() => botApplications.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["PENDING", "ACTIVE", "SUPERSEDED"]).notNull(),
  keyVersion: int("key_version").notNull().default(1),
  ciphertext: varbinary("ciphertext", { length: 4096 }).notNull(),
  nonce: varbinary("nonce", { length: 24 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  supersededAt: timestamp("superseded_at"),
});
