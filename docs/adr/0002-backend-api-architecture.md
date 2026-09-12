# ADR-0002 — Backend/API Architecture

**Status:** LOCKED (approved 2026-09-12, Gate 1)

## Context

The product's own three-tier model (Control Plane, Platform Backend, Bot Runtime) needs a concrete boundary. The dashboard is request/response; the bot runtime is long-running and stateful; both need to read/write the same tenant/guild-scoped data under the same authorization rules. Duplicating authorization logic in two places is exactly the kind of inconsistency `docs/ARCHITECTURE.md` warns against.

## Decision

**Option C — Hybrid.** Three concrete units:

- **`apps/web`** (Next.js, ADR-0001) — renders the dashboard, holds the user's session cookie, calls the backend server-side for every privileged operation. No direct database access.
- **`apps/api`** (Hono) — the actual Platform Backend. Owns MySQL access (ADR-0004), owns all authorization logic (tenant/guild scoping, ADR-0006), owns credential encryption/decryption (ADR-0007), exposes both user-facing endpoints (called by `apps/web`) and internal service endpoints (called by `apps/worker`), and emits audit events (ADR-0010).
- **`apps/worker`** (Bot Runtime, ADR-0005) — long-running Discord gateway connections. Never talks to `apps/web`. Talks only to `apps/api` for configuration and status/audit reporting, authenticating with its own per-worker service identity and short-lived scoped internal credential (ADR-0011) — never a user session, never one shared global internal password.

Recommended library for `apps/api`: **Hono** (current v4.13.x) — a lightweight, standards-based (Fetch API) framework with a strong TypeScript/Zod validation ecosystem (`@hono/zod-validator`, `@hono/zod-openapi`), which maps directly onto the `new-api` skill's required input-validation-first pattern.

## Alternatives Considered

- **Option A (dashboard framework does everything)** — simplest to start, but the worker would need to call into a web app's route handlers for config, an awkward coupling; dashboard traffic and bot-runtime/API traffic have different scaling profiles, and mixing them under one deploy unit works against ADR-0008's reliability goal (a dashboard restart shouldn't affect anything worker-related — trivially true if they're not the same process, not true if they are).
- **Option B (fully separate API for everything, including page data)** — correct in spirit but adds a network hop for every purely presentational dashboard concern with no security benefit; Option C keeps that boundary only where it matters (privileged/tenant-scoped operations).
- **Express** for `apps/api` — mature, huge ecosystem, but weaker built-in typing/schema-validation ergonomics; more prone to inconsistent validation patterns across AI-generated endpoints.
- **Fastify** — a genuinely strong alternative; excellent performance and JSON-schema validation. Hono is preferred for its smaller footprint, Fetch-API-native design (portable if `apps/api` or parts of it ever need to run outside plain Node), and slightly better ergonomics for the Zod-first validation this project already leans on (ADR-0003's auth library uses Zod). Fastify remains an acceptable fallback if Hono proves inadequate.

## Boundary Definition

```
Dashboard (apps/web)     -> calls apps/api over HTTPS with the user's session
Backend  (apps/api)      -> only component with MySQL access; enforces all authorization
Database (MySQL)         -> reachable only from apps/api (and narrowly-scoped migration tooling)
Bot Runtime (apps/worker)-> calls apps/api with an internal service credential; never touches MySQL directly; no public inbound port
```

## Consequences

Two TypeScript codebases/deploy units for the control plane instead of one — genuine added operational complexity, accepted because it prevents authorization logic from existing in two places and keeps the worker fleet decoupled from the web framework's lifecycle. This is the single largest complexity-vs-benefit tradeoff in the whole Phase 1 proposal; flagged explicitly for user sign-off rather than assumed.

## Security Impact

Centralizing all tenant/guild authorization in one service (`apps/api`) means there is exactly one place to get the `findByTenantAndId` pattern (`docs/DATABASE_RULES.md`) right, and exactly one place `security-reviewer` needs to scrutinize for authorization bypasses — instead of two. The worker's internal service credential is itself a privileged secret; its full lifecycle (bootstrap secret, short-lived scoped token exchange, revocation, auditing) is specified in ADR-0011, resolved at Gate 1.

## Revisit Conditions

Revisit if operating three deploy units proves to be excessive operational burden at CreatorCore's actual customer scale (in which case Option A becomes defensible again for a size-constrained team), or if a genuine third API consumer (a future public/mobile API) emerges, which would strengthen rather than weaken this decision.
