import { bigint, char, index, json, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Append-only record of privileged/security-sensitive actions (docs/adr/0006,
 * docs/adr/0010). Distinct in purpose and mutability from operational logs
 * (packages/logger) -- never mutable by any actor, including a tenant owner.
 *
 * PK is a BIGINT UNSIGNED AUTO_INCREMENT, deliberately NOT a UUID: this is a
 * high-insert-volume, append-only table, and a random UUID primary key
 * would cause InnoDB clustered-index page splits/fragmentation on every
 * insert. A sequential PK also gives a natural, cheap insertion-order sort.
 *
 * `actorUserId`/`actorWorkerId`/`tenantId`/`guildId`/`targetId` are
 * DELIBERATELY NOT foreign keys. An audit record must keep its historical
 * ID values forever, even after the tenant/guild/user/worker/bot
 * application it names is later deleted -- FK-constraining these columns
 * would force either cascading the delete into audit history (explicitly
 * forbidden: "avoid accidental cascade deletion of security/audit
 * history") or nulling them out, which destroys the historical fact of
 * what was acted on. These are plain historical value columns, not live
 * references.
 *
 * Immutability is enforced at the database level, not only by omitting an
 * update/delete repository function: see the hand-written follow-up
 * migration (drizzle/0001_audit_events_immutability.sql) which adds
 * BEFORE UPDATE/BEFORE DELETE triggers that reject any mutation outright.
 */
export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    occurredAt: timestamp("occurred_at", { fsp: 6 }).notNull().defaultNow(),
    actorType: mysqlEnum("actor_type", ["USER", "WORKER", "SYSTEM"]).notNull(),
    actorUserId: bigint("actor_user_id", { mode: "bigint", unsigned: true }),
    actorWorkerId: varchar("actor_worker_id", { length: 64 }),
    tenantId: char("tenant_id", { length: 36 }),
    guildId: bigint("guild_id", { mode: "bigint", unsigned: true }),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 64 }).notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    outcome: mysqlEnum("outcome", ["SUCCESS", "FAILURE", "DENIED"]).notNull(),
    metadata: json("metadata"),
  },
  (table) => [
    index("audit_events_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    index("audit_events_target_idx").on(table.targetType, table.targetId),
    index("audit_events_action_occurred_idx").on(table.action, table.occurredAt),
  ],
);
