-- AuditEvent immutability (docs/adr/0006, docs/adr/0010): audit_events is
-- append-only and must never be mutable by any actor, including a tenant
-- owner. Beyond simply not exposing an update/delete repository function
-- (packages/db/src/repositories/audit-events.ts), this is enforced at the
-- database level too, as defense in depth.
--
-- Written as single-statement trigger bodies (no BEGIN...END, no
-- DELIMITER): drizzle's migrator splits this file on its own statement
-- separator marker (below, between the two CREATE TRIGGER statements) and
-- sends each resulting chunk as one mysql2 query; it does not understand
-- DELIMITER, which is a `mysql` CLI-only parsing directive, not real SQL
-- a driver can execute.
CREATE TRIGGER `audit_events_no_update` BEFORE UPDATE ON `audit_events`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events rows are immutable and cannot be updated';
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete` BEFORE DELETE ON `audit_events`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events rows are immutable and cannot be deleted';
