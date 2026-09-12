---
name: security-audit
description: Use when asked to perform a broader security audit of CreatorCore than a single-change review — e.g. before a release, after adding a new module class, or periodically. Runs the security-reviewer perspective across a wider surface and cross-checks docs/SECURITY.md's regression scenario list.
---

# Security audit

This is the wide-scope counterpart to the `security-reviewer` subagent (which reviews one change). Use it when the request is "audit X area" or "check we're still secure" rather than "review this diff."

## Steps

1. **Scope the audit.** Confirm with the requester (or infer from context) whether this covers: one app/package, one feature area (e.g. "everything touching guild permissions"), or the whole repo. Don't silently narrow or widen scope.
2. **Read `docs/SECURITY.md`, `docs/DATABASE_RULES.md`, and `docs/DISCORD_RULES.md`.** These define what "secure" means for CreatorCore at its current phase — audit against them, not against a generic checklist.
3. **Walk every explicit security-regression scenario in `docs/TESTING.md`** relevant to the scoped area (tenant isolation, guild isolation, forged IDs, expired sessions, malformed payloads, token/secret exposure, rate limits, disabled-tenant enforcement) and check whether an actual test proves each one — not just whether the code "looks" correct.
4. **Check secret handling end-to-end**: no tokens/credentials in logs, error responses, client bundles, or git history; encryption-at-rest for bot credentials uses a key that is not stored alongside the encrypted data (`docs/SECURITY.md`).
5. **Check dependency posture**: run `pnpm audit` (or the equivalent for the package manager in use) and note any high/critical findings — this is a detection layer, not a guarantee (`docs/SECURITY.md`).
6. **Distinguish severity clearly** and never round up: don't call something "critical" to sound thorough, and don't call something "low" to close the audit faster.

## Output

A findings list grouped by severity, each with the concrete exploit scenario and the file/line it lives in. If a category was checked and found clean, say so explicitly — a clean audit result is a real result, not a non-answer. Never conclude an audit with a blanket "CreatorCore is secure" — state what was checked, what passed, what didn't, and what remains unverified, per the no-false-guarantee rule in `docs/SECURITY.md` and `CLAUDE.md`.
