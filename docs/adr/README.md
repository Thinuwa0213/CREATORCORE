# CreatorCore — Architecture Decision Records

Each file in this directory is one architecture decision, recorded in the format:

```
Status
Context
Decision
Alternatives Considered
Consequences
Security Impact
Revisit Conditions
```

## Status values

- **LOCKED** — approved by the user and binding. Do not silently reopen.
- **LOCKED WITH POLICY / LOCKED WITH AMENDMENT** — approved by the user, binding, with a specific correction or added policy the user required as a condition of approval (recorded in that ADR's own text, not just here).
- **LOCKED CONCEPTUALLY** — the conceptual model is approved and binding; a named, narrower part (e.g., the physical schema) is explicitly not yet approved and still needs its own decision.
- **RECOMMENDED — AWAITING APPROVAL** — analyzed and recommended by Claude, not yet approved. Do not implement against it as though it were settled.
- **SUPERSEDED** — replaced by a later ADR; kept for history, linked from its replacement.

A decision is marked `LOCKED` (in any of its forms) only after the user explicitly approves it — never merely because it was recommended (see `CLAUDE.md`).

## Index

| #                                        | Decision                                         | Status                          |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------- |
| [0001](0001-dashboard-framework.md)      | Dashboard framework                              | LOCKED                          |
| [0002](0002-backend-api-architecture.md) | Backend/API architecture                         | LOCKED                          |
| [0003](0003-authentication-sessions.md)  | Authentication & sessions                        | LOCKED WITH POLICY              |
| [0004](0004-orm-data-layer.md)           | ORM / MySQL data layer                           | LOCKED                          |
| [0005](0005-discord-runtime.md)          | Discord runtime architecture                     | LOCKED                          |
| [0006](0006-multi-tenant-model.md)       | Multi-tenant conceptual model                    | LOCKED CONCEPTUALLY (no schema) |
| [0007](0007-credential-encryption.md)    | Bot credential encryption & key management       | LOCKED WITH AMENDMENT           |
| [0008](0008-deployment-runtime-model.md) | Deployment / runtime model                       | LOCKED                          |
| [0009](0009-internal-communication.md)   | Internal communication (control plane ↔ workers) | LOCKED WITH AMENDMENT           |
| [0010](0010-observability-audit.md)      | Observability & audit                            | LOCKED                          |
| [0011](0011-worker-service-identity.md)  | Worker service identity & internal auth          | LOCKED — DIRECTION              |

The database engine (MySQL 8.0+ / InnoDB / utf8mb4, `docs/DATABASE_RULES.md`) was locked in Phase 0 and is not re-litigated here.

## Gate 1 approval (2026-09-12)

ADRs 0001–0010 were reviewed and approved by the user. Three carried a required amendment as a condition of approval, recorded in the ADR itself, not just here:

- **0003** — the vague "periodically/on-demand" re-verification language is replaced with an explicit policy: a 5-minute maximum cache TTL for read-only/non-destructive authorization views; destructive, credential-related, ownership-related, or security-sensitive actions re-verify synchronously, every time.
- **0007** — the decryption boundary is corrected. Plaintext bot-token decryption is **not** confined to `apps/api`; the bot worker that connects to Discord necessarily materializes the plaintext. The amendment restates the lifecycle so `apps/api` never transports or exposes plaintext over the normal request path, and plaintext exists only in the authorized worker's memory for as long as the live connection needs it.
- **0009** — the push/notification path for urgent events (credential rotation, disablement) is restricted to carry a non-secret signal only (e.g., "credential version changed"), never the credential itself. The worker retrieves actual credential material through the controlled path in the amended 0007.

**ADR-0011** is new at Gate 1, resolving the worker↔API service-credential open item flagged in 0002 and 0009: each worker gets an independent, individually revocable identity and a rotatable bootstrap secret, exchanged for a short-lived (15-minute target) scoped internal access credential.

**Second review round (same day):** the `security-reviewer` and `architecture-reviewer` passes against the above found a CRITICAL gap (ADR-0005/0007/0011 all assumed a worker→`BotApplication` "claim" mechanism that ADR-0006 never actually defined) and a HIGH gap (no owner for multi-replica claim handoff), plus several MEDIUM/LOW issues (a push-callback authentication direction left undefined, a rotation-lifecycle failure window, an authorization-boundary wording ambiguity in ADR-0001, a missing regression test). All were closed by amendments recorded directly in ADR-0005, 0006 (new `WorkerAssignment` entity, including who is authorized to _create_ a claim — not just who is checked before decryption release), 0007, 0008, and 0011, plus one correction to ADR-0001's wording. See `docs/THREAT_MODEL.md`'s "Gate 1 challenge scenarios" section for the full before/after.

None of these decisions authorize writing product code, installing product dependencies, or creating a database schema/migration — those remain separate, later gates. See `docs/THREAT_MODEL.md` for the Gate 1 security-review challenge results.
