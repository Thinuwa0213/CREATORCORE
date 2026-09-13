import { auditEvents } from "../schema/index.js";
import type { Db } from "../types.js";

export interface RecordAuditEventInput {
  actorType: "USER" | "WORKER" | "SYSTEM";
  actorUserId?: bigint;
  actorWorkerId?: string;
  tenantId?: string;
  guildId?: bigint;
  targetType: string;
  targetId: string;
  action: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  /**
   * Explicitly allow-listed safe fields only (docs/adr/0010, docs/SECURITY.md).
   * Never pass a raw request/error/response object here -- callers must
   * name each field they intend to record. No secret value (bot token,
   * password, Authorization header, cookie, DATABASE_URL, encryption key,
   * worker bootstrap secret, worker access token) may ever appear here.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * The ONLY write path into audit_events -- no update/delete function exists
 * anywhere in this package (docs/adr/0006/0010's append-only requirement).
 * Immutability is additionally enforced at the database level by triggers
 * (see drizzle/'s hand-written follow-up migration) -- this is defense in
 * depth, not the only guarantee.
 */
export async function recordAuditEvent(db: Db, event: RecordAuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    actorWorkerId: event.actorWorkerId,
    tenantId: event.tenantId,
    guildId: event.guildId,
    targetType: event.targetType,
    targetId: event.targetId,
    action: event.action,
    outcome: event.outcome,
    metadata: event.metadata ?? null,
  });
}
