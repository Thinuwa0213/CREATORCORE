# ADR-0003 — Authentication & Sessions

**Status:** LOCKED WITH POLICY (approved 2026-09-12, Gate 1 — see the explicit cache-TTL policy below, required as a condition of approval)

## Context

Dashboard users authenticate via Discord OAuth2. A successful login proves identity only — it must never be treated as authorization to manage any particular guild (`docs/DISCORD_RULES.md`). Session handling is security-critical: cookie flags, CSRF, token storage, rotation, and revocation all matter.

## Decision

**Better Auth (current v1.7.x)**, running inside `apps/api` (ADR-0002) — not inside `apps/web` — using its Discord OAuth2 social provider and its first-party Drizzle adapter (ADR-0004) against MySQL.

Concrete session/cookie rules:

- **Server-side sessions** (DB-backed via the Drizzle adapter), opaque session token in the cookie — not a JWT carrying authorization claims. Revocation is immediate (delete the session row), with no stale-token window.
- Cookie flags: **HttpOnly**, **Secure in production**, **SameSite=Lax** (Strict would break the OAuth redirect-back flow).
- **CSRF**: SameSite=Lax plus explicit origin/referer checks on state-changing requests in `apps/api`.
- **PKCE + state validation** on the OAuth flow (Better Auth handles this by default for the Discord provider).
- Discord access/refresh tokens are stored **encrypted, server-side only** (same encryption approach as bot credentials, ADR-0007) — never sent to or stored in browser storage. The browser only ever holds the CreatorCore session cookie.
- **Session rotation** on privilege-relevant events (tenant membership change, role change).
- **Logout** deletes the server-side session row immediately (not just the cookie).
- **Guild-management capability is never inferred from the OAuth scope grant.** Every privileged, guild-scoped action re-checks CreatorCore's own TenantMembership record (ADR-0006), under the explicit policy below — not "periodically/on-demand."

### Discord authorization cache policy `[LOCKED — Gate 1 condition of approval]`

- **Read-only / non-destructive authorization decisions** (e.g., which guilds to list, whether to show a settings page) may be cached for **at most 5 minutes**.
- **Destructive, credential-related, ownership-related, or otherwise security-sensitive actions** (credential changes, module enable/disable, member/role changes, tenant disablement, bot connect/disconnect) **MUST synchronously re-verify** the caller's current TenantMembership/authorization state at the moment of the action — never read from the cache.
- **Cached UI state must never itself grant a privileged operation.** The cache may decide what to _show_; it never substitutes for the synchronous check an action actually performs server-side.

## Alternatives Considered

- **Auth.js / NextAuth** — very popular, but its design centers session/OAuth handling inside the Next.js app itself. That conflicts with ADR-0002's boundary (backend owns authorization) — would require awkwardly exporting NextAuth's internal session decisions to a separate service.
- **Hand-rolled OAuth flow using a lightweight client library (e.g., `arctic`) + custom session store** — more control, but reimplements a well-trodden, security-critical problem (PKCE, state validation, token refresh, session rotation) that a maintained library already solves correctly. Rejected under the same "don't invent custom security primitives" principle applied to encryption (ADR-0007).
- **Fully custom JWT-based sessions** — rejected: JWT revocation requires either short TTLs with refresh complexity or a denylist (which reintroduces server-side state anyway, at which point a plain server-side session is simpler and strictly more revocable).

## Consequences

Auth logic lives in `apps/api`, meaning `apps/web` is a pure client of the same session/authorization surface every other caller uses — no parallel auth implementation to keep in sync.

## Security Impact

The original "periodically/on-demand" language was too vague to be a real control and was rejected at Gate 1 review. The locked policy above (5-minute maximum cache TTL for read-only views; synchronous re-verification for anything destructive/credential/ownership/security-sensitive; cached state never itself grants a privileged operation) is now the binding rule, not a placeholder. Discord's own OAuth token itself is encrypted at rest identically to bot credentials (ADR-0007), since a leaked Discord user token is nearly as sensitive as a leaked bot token. A hijacked session remains a residual risk for up to 5 minutes on read-only views even after this policy — see `docs/THREAT_MODEL.md`'s "stale Discord authorization" row.

## Revisit Conditions

Revisit if Better Auth's release cadence/maintenance stalls, if its Discord provider proves insufficient for a required flow, or if the 5-minute cache TTL proves too costly at scale — any change to that number requires an explicit, documented decision here, never a silent drift.
