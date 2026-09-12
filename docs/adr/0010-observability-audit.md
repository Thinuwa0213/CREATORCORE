# ADR-0010 — Observability & Audit

**Status:** LOCKED (approved 2026-09-12, Gate 1)

## Context

Three application units, tenant/guild-scoped data, and security-sensitive operations all need to be observable without conflating "operational log" with "security audit record" — they have different mutability and retention needs.

## Decision

- **Structured logs** (JSON, e.g. via `pino`) from all three units. Mandatory fields: timestamp, level, service name, correlation/request ID, tenant ID (when known), guild ID (when known).
- **Mandatory secret redaction** enforced via a shared logging wrapper/serializer used by all three units — never left to per-call-site discipline. Redacted: bot tokens, session tokens, OAuth tokens, database credentials, the credential-encryption key.
- **Security audit events**: the `AuditEvent` entity (ADR-0006) — append-only, never editable/deletable by tenant-level actors including tenant owners. Distinct in _purpose and mutability_ from operational logs, even if initially stored in the same MySQL instance.
- **Discord moderation actions taken through the bot** are recorded as CreatorCore AuditEvents (who configured/triggered it) — CreatorCore does not need to duplicate Discord's own native audit log, only record that CreatorCore initiated the action and by whom.
- **Worker lifecycle events** (connect/disconnect/reconnect/crash) are captured structurally (not left to ephemeral stdout) and surfaced to a health-check/alerting path for crashes/repeated disconnects.
- **Health checks:** `creatorcore-web`/`creatorcore-api` expose a public, unauthenticated, no-sensitive-data liveness/readiness endpoint; `creatorcore-worker` exposes an internal-only endpoint reporting per-`BotApplication` connection status.
- **Correlation IDs** generated at the edge (a dashboard request or a Discord event) and threaded through every downstream log line and internal HTTP call.

## Alternatives Considered

- **Treating audit events as just another log line** — rejected: audit records need append-only guarantees and longer/deliberate retention independent of operational log rotation; conflating them risks a malicious tenant administrator being able to influence records that are supposed to be evidence against them.
- **Standing up a dedicated metrics/observability platform now** — rejected as premature infrastructure spend before there is operational history to justify a specific choice; deferred, not skipped.

## Consequences

Audit and operational logs may initially share physical storage (MySQL) but must be modeled as logically separate from day one (separate table, separate access rules) so that separating them physically later (e.g., audit events to a dedicated append-only store) is a migration, not a redesign.

## Security Impact

Redaction living in a shared wrapper (rather than per-call-site) is what makes "secrets never appear in logs" (`docs/SECURITY.md`) actually enforceable and reviewable in one place, matching how encryption is centralized in `apps/api` (ADR-0007) and authorization is centralized in the same service (ADR-0002/0006).

## Revisit Conditions

Revisit metrics/alerting infrastructure once there is real production traffic to justify a specific retention/cost tradeoff. Revisit audit-event storage location if compliance requirements (not yet identified) demand a separate, harder-to-tamper-with store.
