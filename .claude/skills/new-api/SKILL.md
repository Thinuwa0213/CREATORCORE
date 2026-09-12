---
name: new-api
description: Use when adding a new API endpoint/route to any CreatorCore service. Enforces validation, auth, tenant/guild scoping, safe error handling, tests, rate-limit consideration, and audit logging instead of generating a bare handler.
---

# New API endpoint

The API framework itself is an `[UNRESOLVED]` Phase 1 decision (see `docs/ARCHITECTURE.md`) — this skill is framework-agnostic and applies whatever gets chosen.

## Required for every new endpoint

1. **Input validation.** Every request body/query/param is validated against an explicit schema before any handler logic runs. Reject malformed payloads with a safe 4xx error, not a stack trace.
2. **Authentication.** State explicitly whether the endpoint requires an authenticated session. If it's intentionally public, say so in a comment and confirm with `security-reviewer` that public access is safe.
3. **Authorization.** Authentication is not authorization. After confirming _who_ the caller is, confirm _what they're allowed to do_ — check the caller's actual role/permission for the specific resource, server-side, on every request. Never rely on the client to have already restricted what it could ask for.
4. **Tenant/guild scoping.** Every database call or external lookup in the handler must be scoped by the authorized tenant ID (and guild ID where applicable) — `findByTenantAndId(tenantId, id)`, never `findById(id)`. This applies even to internal/admin endpoints unless the endpoint is explicitly platform-wide and documented as such.
5. **Safe errors.** Error responses returned to the client must never include stack traces, internal identifiers, secrets, or raw database error messages. Log the detailed error server-side; return a generic, safe message to the client.
6. **Rate-limit consideration.** Decide explicitly whether this endpoint needs rate limiting (auth endpoints, expensive queries, and unauthenticated endpoints almost always do) and state the decision, even if the answer is "not yet, because X."
7. **Audit logging consideration.** Decide explicitly whether this action should produce an audit log entry (privileged/administrative/destructive actions generally should — see `docs/SECURITY.md`). State the decision.
8. **Tests.** At minimum: one test for the success path with a properly authorized caller, one for an unauthenticated caller, one for an authenticated-but-unauthorized caller, one for a malformed payload, and — if the endpoint touches tenant/guild-scoped data — one explicit cross-tenant or cross-guild isolation test proving another tenant/guild cannot reach this data via this endpoint. Wire these into the workspace's `creatorcore.testGates` per `docs/TESTING.md`.

## Before finishing

Run lint/typecheck/tests for the affected package, then invoke `security-reviewer` against the new endpoint before considering it complete. Report exact results — do not claim an endpoint is secure without having traced points 2–5 in the actual code.
