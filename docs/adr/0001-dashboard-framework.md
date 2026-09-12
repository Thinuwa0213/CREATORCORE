# ADR-0001 — Dashboard Framework

**Status:** LOCKED (approved 2026-09-12, Gate 1)

## Context

CreatorCore's Control Plane needs a web dashboard: Discord login, tenant/guild management, bot setup, module configuration, branding, and future billing UI. It must integrate cleanly with Discord OAuth, support server-rendered privileged data without leaking it unnecessarily to the browser, and remain predictable for AI-assisted development (a stated Phase 1 priority).

## Decision

**Next.js (App Router, current major — v16.x as of this writing) as the dashboard framework**, used as a UI/BFF layer rather than as the system of record for business logic (see ADR-0002 for the backend boundary).

## Alternatives Considered

- **Vite + React SPA + fully separate API** — simpler mental model, full separation of concerns from day one, but pushes all OAuth callback handling, server-side data fetching, and SEO/initial-load concerns onto hand-rolled infrastructure; no built-in server-rendering story for privileged data.
- **Remix / React Router v7 (framework mode)** — comparable server-rendering model to Next.js App Router, smaller ecosystem and less mature OAuth/library integration surface (e.g., fewer first-party adapters for the auth library selected in ADR-0003).
- **SvelteKit** — capable framework, but a different language ecosystem than the rest of this stack (TypeScript/React), which works against "Claude-assisted development must remain predictable" — mixing frameworks increases surface area for inconsistent AI-generated patterns.

## Advantages

- React Server Components let privileged dashboard data be fetched and rendered server-side without an extra client-side round trip or exposing internal API shapes to the browser.
- Mature, first-party integration path with the ADR-0003 auth library (Better Auth ships a Next.js adapter).
- Large ecosystem and hiring/AI-training-data surface — reduces the chance of Claude generating inconsistent, unfamiliar patterns.
- Built-in routing, layouts, and streaming/Suspense support map well onto the required loading/empty/error states in `docs/DESIGN_SYSTEM.md`.
- Deployable as a plain Node process (no forced vendor lock to a specific hosting platform), consistent with ADR-0008's deployment model.

## Disadvantages

- App Router's server/client component split and Server Actions have a real learning curve and can blur the dashboard/backend boundary if used carelessly (a Server Action can accidentally become an unreviewed, unauthorized endpoint).
- Coupling too much business logic into Next.js route handlers would violate the platform's own module-boundary principle (`docs/ARCHITECTURE.md`) — mitigated by ADR-0002's hybrid backend boundary, not by Next.js itself.

## Security Implications

**Clarified at Gate 1 review** (the original wording risked being read as license for `apps/web` to implement its own authorization, which ADR-0002/ADR-0003 explicitly forbid): every Server Action and route handler in `apps/web` must verify that a valid session exists, then **forward the actual tenant/guild authorization decision to `apps/api`** — it never independently evaluates "is this caller allowed to touch this tenant/guild/resource" itself. `apps/web` is a pure client of the authorization surface `apps/api` owns (ADR-0003's Consequences); CSRF protection from Next.js's built-in Server Action origin checks is a helpful default, not a substitute for the SameSite/session design in ADR-0003, and is unrelated to, and does not substitute for, `apps/api`'s own authorization checks. No secrets are ever provisioned to the dashboard's client bundle — only to its server runtime, and `apps/web`'s server runtime holds no credential-decryption material and no standing service credential of its own; it calls `apps/api` using only the signed-in user's own session (ADR-0002's Boundary Definition). The credential-encryption key from ADR-0007 is never provisioned to `apps/web` under any circumstance.

## Why It Fits CreatorCore

It is the framework choice that best matches the hybrid backend boundary in ADR-0002 (dashboard as UI/BFF, not system of record), the auth library in ADR-0003, and the team's stated React background — without over-committing business logic to a web framework that bot workers have no reason to depend on.

## Revisit Conditions

Revisit if: Next.js's Server Component/Action model proves to systematically produce authorization gaps in practice (tracked via `security-reviewer` findings), or if a genuine requirement emerges for a dashboard that isn't server-rendered at all (e.g., a fully offline-capable client).
