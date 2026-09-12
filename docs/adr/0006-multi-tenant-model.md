# ADR-0006 — Multi-Tenant Conceptual Model

**Status:** LOCKED CONCEPTUALLY (approved 2026-09-12, Gate 1)

**This ADR defines conceptual entities and relationships only. No schema or migration is created by this decision, and this decision does NOT approve a physical MySQL schema — that remains a separate, later decision.**

## Context

Every other decision (data access, authorization, credential scoping) depends on a shared, precise vocabulary for how User, Tenant, Guild, and BotApplication relate. Ambiguity here is exactly what produces IDOR-shaped bugs later.

## Decision

**Entities:**

- **User** — a person who has logged in via Discord at least once. Identified globally by Discord user ID. Not tenant-scoped itself.
- **Tenant** — a customer account.
- **TenantMembership** — join entity between User and Tenant, carrying a role (owner/admin/member). **A user may belong to multiple tenants** via multiple TenantMembership rows. Every request's authorization is resolved through the specific TenantMembership matching the tenant in scope — never assumed from "the user is logged in."
- **Guild** — a Discord server connected under exactly one Tenant. **A tenant may manage multiple guilds** (one-to-many Tenant → Guild). A guild belongs to exactly one tenant — no shared multi-tenant guild ownership in Phase 1.
- **BotApplication** — a Discord application/bot credential set connected to exactly one Tenant. **A tenant may have multiple bot applications.**
- **GuildBotAssignment** — join entity between BotApplication and Guild. **One bot application may serve multiple guilds** (customers may reuse one bot across several of their own guilds).
- **BotCredential** — the encrypted token material for a BotApplication, modeled as its own entity so encryption/rotation/audit metadata lives separately from the BotApplication's descriptive fields (ADR-0007).
- **GuildConfiguration** — per-guild settings (channels, roles, branding overrides), scoped to one Guild (and transitively its Tenant).
- **FeatureConfiguration** — per-guild module enable/disable + module settings, scoped to one Guild (different guilds under one tenant may run different modules).
- **AuditEvent** — append-only record of privileged actions, scoped to a Tenant (and Guild where applicable). Never mutable or deletable by tenant-level actors, including tenant owners.
- **WorkerAssignment** — **added at Gate 1 review** to close a gap: ADR-0005, ADR-0007, and ADR-0011 all assume a "workerId/claim" relation mapping a specific worker process to the `BotApplication`(s) it currently hosts, and cite it as living here — it was missing from the original draft. Join entity between a worker's identity (ADR-0011) and `BotApplication`, recording which worker currently holds the live claim/lease for a given `BotApplication`'s Discord connection. Exactly one active claim per `BotApplication` at a time (claims are how the single-worker-for-Phase-1 model stays correct when a second replica exists for failover, per ADR-0008/ADR-0005). This is the record `apps/api` checks — in addition to the Tenant/Guild/BotApplication chain above — before releasing any credential-decryption material to a worker (ADR-0007's amended decryption boundary): a worker's own identity establishes _who_ is asking, never _which_ `BotApplication`s it may touch, without this claim record, same principle as `userId` below.

  **Claim creation is an `apps/api`-side authorization decision, never a bare worker assertion `[LOCKED — closes a second-round security-review finding]`.** A worker cannot create or extend its own WorkerAssignment for a `BotApplication` merely by requesting it. `apps/api` creates/renews a claim only by independently re-deriving that the requesting worker is an eligible holder through its own assignment/scheduling logic (e.g., the claim-handoff mechanism ADR-0008 requires for multi-replica failover) — the same authority that already governs every other tenant/guild/credential decision in this document, not a new, separate trust path. Re-checking the security property this closes: fixing only the _release_ check (worker identity + claim ⇒ decryption material) without also fixing _claim creation_ would just relocate the original `findById`-shaped gap by one hop — a worker could self-assign a claim for a `BotApplication` it has no legitimate relationship to, then pass the release check trivially. Both halves — who may hold a claim, and who may decrypt once holding one — are `apps/api`-authorized, never worker-authorized.

**Where ownership is checked:** in `apps/api` (ADR-0002), on every request, by resolving TenantMembership for (authenticated User, target Tenant) before evaluating anything about Guild/BotApplication/config under that tenant. This is the single choke point.

**Where Discord guild permission is checked:** separately, against Discord's live API/state — before allowing a user to connect a guild to a tenant, and re-verified per ADR-0003's synchronous-for-destructive-actions rule thereafter. CreatorCore's own TenantMembership is the source of truth for ongoing authorization _after_ that initial verification; it is not re-derived from Discord on every single request.

**Security boundary IDs:** `tenantId`, `guildId`, and `botApplicationId` must appear in the WHERE clause of every scoped query for the corresponding resource type (`docs/DATABASE_RULES.md`). `userId` establishes _who_, never _what they may touch_, by itself.

**Defense-in-depth against cross-tenant access:** (1) the ADR-0004 repository-layer convention, (2) `security-reviewer`'s mandatory check for this query shape, (3) required cross-tenant/cross-guild regression tests before any tenant-scoped feature ships (`docs/TESTING.md`), (4) audit logging of privileged access to any resource ID, (5) the WorkerAssignment claim record above, which a worker's credential-decryption request must also satisfy.

## Alternatives Considered

- **A guild belonging to multiple tenants** — rejected for Phase 1: it introduces ambiguous ownership for every downstream decision (which tenant's config wins? whose bot responds?) with no demonstrated customer need yet. Revisit only if a real multi-tenant-per-guild use case appears.
- **A single BotApplication scoped to exactly one Guild (no GuildBotAssignment join)** — simpler, but forces customers to provision a separate bot application per guild even when they'd prefer to reuse one bot across their own guilds; rejected as an unnecessary customer-facing limitation.

## Consequences

The BotApplication↔Guild (many-to-many via GuildBotAssignment) combined with BotApplication↔Tenant (many-to-one) means a **two-hop path** exists from Guild to a decrypted credential (Guild → GuildBotAssignment → BotApplication → BotCredential). Any code that resolves a credential starting from a Guild must verify that Guild's owning Tenant matches the caller's authorized Tenant — a two-hop IDOR is easy to miss if only the direct Tenant→BotApplication path is tested.

## Security Impact

The required IDOR regression test covering the full hop chain — **Guild → GuildBotAssignment → BotApplication → BotCredential**, with every hop authorized within the correct tenant/guild boundary — is recorded in `docs/TESTING.md`'s security regression scenario list, in addition to the already-listed direct tenant-isolation tests. This is a Gate 1 requirement, not a deferred follow-up.

**WorkerAssignment closes a specific gap found in Gate 1 security review:** without a server-held claim record, a worker's credential-decryption request (ADR-0007) would be authorizable by worker identity plus a caller-supplied `botApplicationId` alone — the same `findById`-shaped anti-pattern this document already forbids at the tenant boundary, just recurring at the worker boundary. `apps/api` must check the WorkerAssignment claim (this worker currently holds this `BotApplication`) in addition to the Tenant/Guild chain before releasing any decryption material. A regression test proving a worker cannot obtain decryption material for a `BotApplication` it does not currently hold a claim for is required in `docs/TESTING.md`, alongside the existing worker-impersonation and two-hop tests.

**AuditEvent immutability** must also have its own regression test (a tenant-level actor, including a tenant owner, cannot modify or delete an AuditEvent) — flagged during Gate 1 architecture review as a gap in `docs/TESTING.md`'s list relative to every other locked rule in this ADR.

## Revisit Conditions

Revisit the one-tenant-per-guild constraint if a real customer requirement for shared guild management across tenants emerges (e.g., an agency managing guilds on behalf of multiple end clients as separate tenants) — treat this as a deliberate future ADR, not a default extension.
