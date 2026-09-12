# CreatorCore — Architecture

**Status of this document:** Phase 0 engineering contract. Sections are explicitly tagged:

- `[LOCKED]` — decided, do not revisit without a deliberate discussion and a doc update.
- `[PROPOSED]` — a reasonable default, not yet evaluated against real requirements. Treat as a starting point for Phase 1 discussion, not as approved architecture.
- `[UNRESOLVED]` — genuinely undecided. Do not implement against an assumed answer.
- `[SECURITY-SENSITIVE — NEEDS REVIEW]` — requires explicit security review before implementation, regardless of how settled it looks.

No dashboard, bot runtime, database schema, or authentication system exists in this repository yet. Everything below describes intent and constraints for Phase 1+, not current implementation.

---

## 1. Product shape

CreatorCore is **one reusable platform + reusable modules + tenant/client configuration** — not a template that gets copied per client. A bug fixed in a shared module must be fixable centrally. Client-specific customization must not require a permanent fork of core code. `[LOCKED — product principle, not a specific technology]`

## 2. Domain concepts (naming only — no schema yet)

These are the entities the system will reason about. Naming them now avoids inconsistent vocabulary later; it does not imply a database schema, which is `[UNRESOLVED]`.

- **Tenant** — a customer/client of CreatorCore (an organization, streamer, or community operator).
- **Guild** — a Discord server connected to a tenant. A tenant may connect multiple guilds.
- **Bot application** — a customer-provided or CreatorCore-provisioned Discord application/bot the platform operates on a tenant's behalf.
- **Module** — an independently enable/disable-able feature (Stream Notifications, Welcome/Auto Roles, Auto Moderation, Giveaways, XP/Levels, Button/Reaction Roles, Announcements, Custom Branding, etc.), scoped per guild.

Relationship cardinality is now `[LOCKED CONCEPTUALLY]` via [ADR-0006](adr/0006-multi-tenant-model.md): a guild belongs to exactly one tenant (no shared multi-tenant guild ownership in Phase 1); a tenant may manage multiple guilds and multiple bot applications; one bot application may serve multiple guilds via a GuildBotAssignment join. The physical schema implementing this is still `[UNRESOLVED]`.

## 3. Module boundary principle `[LOCKED — principle; not tied to a specific framework]`

- **Shared/core code** implements a feature once, generically, driven by configuration.
- **Tenant/client-specific behavior** (branding, enabled modules, custom copy, tenant-specific limits) lives in configuration data, not in forked copies of core logic.
- A module must not import another module's internals directly — only through its declared public interface.
- Shared packages must never contain hardcoded tenant IDs, guild IDs, customer names, or environment-specific values.

## 4. Tenant & guild isolation `[SECURITY-SENSITIVE — NEEDS REVIEW]`, principle `[LOCKED]`

Tenant isolation and guild isolation are security boundaries, not just data-modeling concerns. Every privileged read or write must be authorized server-side against the caller's actual tenant/guild membership — never inferred from a client-supplied ID alone. See `docs/DATABASE_RULES.md` and `docs/SECURITY.md` for the concrete query-shape rule and required regression tests.

## 5. Technology stack

### Locked

- **Database engine: MySQL 8.0+ with InnoDB, utf8mb4.** `[LOCKED]` — see `docs/DATABASE_RULES.md` for the full rule set. This is the only product-stack decision fixed at Phase 0.
- **Monorepo tooling: pnpm workspaces + Turborepo, TypeScript strict mode, ESLint + Prettier, Vitest, Playwright, GitHub Actions.** `[LOCKED — tooling/infrastructure layer only]`. This is the engineering-foundation layer scaffolded in Phase 0; it does not imply or constrain the product application stack below.
- **Workspace layout convention:** deployable applications live under `apps/*`; shared libraries live under `packages/*`. `[LOCKED — convention, not framework choice]`

### Locked — Phase 1 architecture (Gate 1, approved 2026-09-12)

The items below are approved and binding, each recorded as an ADR under `docs/adr/` — see `docs/adr/README.md` for exact status wording (several carry a required amendment, recorded in the ADR itself). **None of these are installed or implemented yet** — Gate 1 approves the architecture; it does not authorize writing product code, installing product dependencies, or creating a database schema/migration. Those remain separate, later gates.

- **ORM / database client** — [ADR-0004](adr/0004-orm-data-layer.md): Drizzle ORM + `mysql2` + `drizzle-kit`. `LOCKED`.
- **API framework** — [ADR-0002](adr/0002-backend-api-architecture.md): Hono, as a separate `apps/api` service (hybrid backend architecture). `apps/api` owns authoritative control-plane business rules, authorization, configuration APIs, credential-management orchestration, and audit operations — this logic must never be duplicated independently inside `apps/web`. `LOCKED`.
- **Dashboard framework** — [ADR-0001](adr/0001-dashboard-framework.md): Next.js (App Router), used as a UI/BFF layer only — `apps/web` is not the system of record for privileged platform state. `LOCKED`.
- **Authentication system** — [ADR-0003](adr/0003-authentication-sessions.md), `[SECURITY-SENSITIVE — NEEDS REVIEW]`: Better Auth, running inside `apps/api`, Discord OAuth2 provider, server-side revocable sessions. `LOCKED WITH POLICY`: read-only/non-destructive authorization decisions may be cached for at most 5 minutes; destructive/credential/ownership/security-sensitive actions always re-verify synchronously; cached UI state never grants a privileged operation.
- **Discord bot runtime** — [ADR-0005](adr/0005-discord-runtime.md): discord.js, one worker process holding multiple `Client` instances (one per customer bot application) for Phase 1, running ≥2 replicas from day one (ADR-0008) for availability. The `WorkerAssignment` claim mechanism (ADR-0006) that decides which replica currently owns which `BotApplication` is a live Gate 1 requirement, not deferred — what remains a genuinely future migration is scaling *beyond* that HA baseline to many more worker processes purely for capacity, without changing the feature-module model. Least-privilege Gateway Intents are required — modules must not request privileged Discord data access merely for convenience, and a future module registry must make each module's required permissions/intents explicit. `LOCKED`. See `docs/DISCORD_RULES.md` for constraints that apply regardless.
- **Multi-tenant conceptual model** — [ADR-0006](adr/0006-multi-tenant-model.md): User/Tenant/TenantMembership/Guild/BotApplication/GuildBotAssignment/BotCredential/GuildConfiguration/FeatureConfiguration/AuditEvent/**WorkerAssignment** (the last added during Gate 1 review to close a cross-reference gap — see `docs/adr/README.md`'s Gate 1 approval note). `LOCKED CONCEPTUALLY` — the physical MySQL schema is explicitly **not** approved by this decision and remains a separate, later decision.
- **Bot credential encryption & key management** — [ADR-0007](adr/0007-credential-encryption.md), `[SECURITY-SENSITIVE — NEEDS REVIEW]`: envelope encryption (AES-256-GCM via `@noble/ciphers`), KEK held outside the database. `LOCKED WITH AMENDMENT`: plaintext decryption is **not** confined to `apps/api` — it happens in the authorized bot worker, scoped to the `BotApplication`s it hosts; the normal API request path never transports or exposes plaintext. Rotation lifecycle is locked (PENDING → validated → worker-activated → atomically promoted to ACTIVE; superseded ciphertext deleted, not archived).
- **Deployment/runtime model** — [ADR-0008](adr/0008-deployment-runtime-model.md): four deployable units (`creatorcore-web`, `creatorcore-api`, `creatorcore-worker`, MySQL), no queue/cache/orchestration yet. `LOCKED`.
- **Internal communication** — [ADR-0009](adr/0009-internal-communication.md): direct internal HTTP (poll + narrow push callback), no broker. `LOCKED WITH AMENDMENT`: a push notification for urgent events (credential rotation, disablement) is a non-secret signal only (e.g. "credential version changed") — it never carries the credential itself; the worker retrieves actual material through ADR-0007's controlled path.
- **Worker service identity & internal auth** — [ADR-0011](adr/0011-worker-service-identity.md): independent per-worker identity, rotatable bootstrap secret exchanged for a short-lived (15-minute target) scoped internal access credential — never one shared global internal password. `LOCKED — DIRECTION`; exact signing/token implementation deferred to implementation design.
- **Observability & audit** — [ADR-0010](adr/0010-observability-audit.md): structured logs with mandatory redaction, a distinct append-only AuditEvent model. `LOCKED`.
- **Billing/subscriptions** — `[UNRESOLVED]`. Not analyzed in Phase 1, not implemented in any form yet.
- **Hosting/deployment provider, connection pooling, backup/restore implementation** — `[UNRESOLVED]`. ADR-0008 defines the deployment _shape_; the specific provider and mechanism are open.

See `docs/THREAT_MODEL.md` for the Gate 1 threat analysis and security/architecture review results against this now-locked architecture.

### Recommended workspace layout (Phase 1, not yet created)

Consistent with the `apps/*`/`packages/*` convention already `[LOCKED]` above:

```
apps/
  web/                  # ADR-0001 — Next.js dashboard
  api/                  # ADR-0002 — Hono backend (auth, authorization, data access, credential encryption)
  worker/               # ADR-0005 — discord.js bot runtime
packages/
  db/                   # ADR-0004/0006 — Drizzle schema + tenant/guild-scoped repository layer
  discord-modules/      # Reusable feature modules (XP, giveaways, moderation, etc.) consumed by apps/worker
  config/               # Shared env/config validation, consumed by all three apps
```

This is a naming/structure recommendation only — no code exists under any of these paths yet. Recorded now so Gate 1 implementation doesn't invent conflicting conventions ad hoc (an architecture-review finding from the Phase 1 proposal).

## 6. Client source-code strategy `[PROPOSED]`

Some customers may eventually request source-code handover. To keep that possible without permanently forking the platform:

- Core/shared packages (`packages/*`) must remain free of any single client's configuration, branding, or bespoke logic.
- Client-specific behavior should be expressible as configuration + isolated extension points, not as edits to shared packages.
- Possible future distribution models (not implemented, not decided): (a) shipping a read-only export of a tenant's configuration + the shared core as a reference, (b) a licensed white-label deployment of the full platform, (c) no source handover at all, only a managed service. Which model(s) CreatorCore actually offers is a business decision, `[UNRESOLVED]`, that will shape how strictly this separation must be enforced technically.

## 7. Environments `[LOCKED — principle]`, specifics `[UNRESOLVED]`

Local, test, staging, and production must be clearly separated (see `docs/DEVELOPMENT.md`). Production credentials and production data must never be required for normal development or used in automated tests. Exact staging/production hosting is `[UNRESOLVED]`.

## 8. What Phase 0 explicitly does not include

No dashboard, no Discord bot code, no database schema or migrations, no authentication implementation, no production API routes, no billing integration, no ORM, no Discord client library. Phase 0 is documentation, tooling, and review-agent/skill infrastructure only.

**Gate 1 (2026-09-12) locked the Phase 1 architecture decisions above** — it did not change this. No product code, product dependencies, or schema exist yet; Gate 1 approved what to build and under what constraints, not an implementation.
