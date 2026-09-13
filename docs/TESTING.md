# CreatorCore — Testing Strategy

**Status:** Phase 0 engineering contract. No product tests exist yet — this document defines the strategy, the infrastructure, and the honesty contract that `scripts/check-test-gate.mjs` and CI enforce.

## Test categories

### Unit tests

Business logic and isolated modules/functions. Runner: **Vitest** (installed as foundation tooling — `CONFIGURED AS FOUNDATION TOOLING`, no product unit tests exist yet).

### Integration tests

Database/service/API boundaries. Runner: **Vitest** against a real dependency (e.g., a real MySQL instance — never SQLite or an in-memory substitute, per `docs/DATABASE_RULES.md`).

### E2E tests

Full user flows through a real browser. Runner: **Playwright** (installed as foundation tooling, root `playwright.config.ts` present — `CONFIGURED AS FOUNDATION TOOLING`, not applicable until a dashboard exists). Once a dashboard exists, planned critical flows include:

- login
- server (guild) selection
- bot setup
- permissions
- module configuration
- settings
- logout / session expiration

## The per-workspace test-gate contract `[LOCKED — mechanism]`

Not every workspace needs every test category — a headless bot worker doesn't need Playwright E2E; a pure utility package may not need integration tests. So CreatorCore does **not** require "any app ⇒ all test types." Instead, each workspace declares what applies to it, explicitly, in its own `package.json`:

```json
{
  "name": "@creatorcore/example",
  "scripts": {
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test"
  },
  "creatorcore": {
    "testGates": {
      "unit": true,
      "integration": true,
      "e2e": false
    }
  }
}
```

`scripts/check-test-gate.mjs <unit|integration|e2e>` (invoked by the root `pnpm test` / `pnpm test:integration` / `pnpm test:e2e`) enforces this:

1. **No workspaces exist under `packages/*` or `apps/*` at all** → `NOT APPLICABLE — no workspaces exist yet.`
2. **Workspaces exist, but none declare `creatorcore.testGates.<gate> = true`** → `NOT APPLICABLE`, naming which workspaces were checked.
3. **A workspace declares the gate `true`:**
   - No matching script (`test` / `test:integration` / `test:e2e`) in that workspace → **`FAIL`** (a declared-but-unimplemented gate is a real failure, not a skip).
   - Script exists → it is actually run, and its real exit code determines `PASS`/`FAIL`.

This means the gate can never permanently, silently skip a category a workspace actually needs, and it never forces an inapplicable category onto a workspace that doesn't need it. When you add a new app/package, **declare its test gates honestly** — declaring `true` before tests exist will correctly fail CI, which is the intended behavior, not a bug.

The `build` gate (`scripts/check-build-gate.mjs`) follows the same honesty principle without a separate opt-in: any workspace with a `build` script in its `package.json` gets built for real; no workspaces with a `build` script → `NOT APPLICABLE`.

## Security regression tests `[SECURITY-SENSITIVE — NEEDS REVIEW]`

None of these exist yet — there is no system to test. This is the required scenario list for Phase 1+, to be implemented as integration tests against the real authorization/data layer as soon as one exists:

- Tenant A cannot read Tenant B's data.
- Tenant A cannot modify Tenant B's data.
- Guild A cannot access Guild B's resources.
- Normal (non-admin) users cannot perform administrative actions.
- Forged/spoofed guild IDs supplied by the client cannot bypass server-side authorization.
- Expired sessions cannot modify settings.
- Malformed payloads are rejected (not partially processed, not crashing with an internal error exposed to the client).
- Invalid Discord credentials are rejected.
- Bot tokens never appear in normal API responses.
- Secrets never appear in application logs.
- Rate limits actually reject excess requests where they're supposed to apply.
- Disabled tenants cannot continue to perform privileged operations.
- **Two-hop credential resolution cannot cross a tenant boundary**: resolving a `BotCredential` via a `Guild` path (`Guild → GuildBotAssignment → BotApplication → BotCredential`, see `docs/adr/0006-multi-tenant-model.md`) must fail when that `Guild`'s owning `Tenant` does not match the caller's authorized tenant — this is distinct from, and in addition to, the direct `Tenant → BotApplication` isolation test above, since it is a separate code path that could independently omit the check. Surfaced during Phase 1 architecture review (`docs/THREAT_MODEL.md`). **Required, locked at Gate 1.**
- **Stale authorization cache cannot grant a privileged action**: a read-only view may reflect up-to-5-minutes-stale authorization state, but attempting a destructive/credential/ownership/security-sensitive action after the caller's underlying authorization has actually changed must be rejected by the synchronous re-verification — not served from the cache (`docs/adr/0003-authentication-sessions.md`).
- **Worker impersonation is rejected**: a request to `apps/api`'s internal endpoints using an invalid, expired, wrong-audience, or wrong-issuer worker credential must be rejected and recorded as a failed-auth audit event (`docs/adr/0011-worker-service-identity.md`).
- **Credential rotation race conditions**: two concurrent rotation attempts for the same `BotCredential`, or a worker activation that completes after the rotation request has already timed out/been superseded, must not result in two simultaneously-ACTIVE credentials, a lost ACTIVE credential, or promotion of a credential that failed Discord validation (`docs/adr/0007-credential-encryption.md`'s rotation lifecycle).
- **Internal push notifications cannot deliver or substitute for a credential**: a forged, replayed, or unauthenticated call to the worker's push-callback endpoint must be rejected; even a genuine `CredentialRotated` signal must never itself contain credential material, and the worker must independently verify `apps/api`'s callback authentication token before acting on the payload (`docs/adr/0009-internal-communication.md`'s Gate 1 amendment, `docs/adr/0011-worker-service-identity.md`'s reverse-direction rule).
- **A worker cannot obtain credential-decryption material for a `BotApplication` it does not currently hold a WorkerAssignment claim for**, even while presenting a valid worker identity/credential — worker identity alone must not be sufficient (`docs/adr/0006-multi-tenant-model.md`, `docs/adr/0007-credential-encryption.md`). Required, added at Gate 1 security review.
- **A worker cannot create or extend its own WorkerAssignment claim by merely requesting one.** A worker asserting "I am now hosting `BotApplication` X" must be rejected unless `apps/api` independently authorizes that claim through its own assignment logic — this is distinct from, and in addition to, the release-side test above: that test checks decryption is denied without a claim; this one checks a worker cannot manufacture the claim itself to defeat that check. Required, added during Gate 1 second-round security review (`docs/adr/0006-multi-tenant-model.md`).
- **AuditEvent immutability**: no tenant-level actor, including a tenant owner, can modify or delete an AuditEvent through any API path (`docs/adr/0006-multi-tenant-model.md`, `docs/adr/0010-observability-audit.md`). Flagged as a gap in this list during Gate 1 architecture review.
- **Concurrent rotation attempts are rejected, not racy**: a second rotation request for a `BotApplication` that already has a PENDING credential must be rejected outright, never queued or silently overwritten, until the first attempt resolves (`docs/adr/0007-credential-encryption.md`'s Gate 1 addition).

Each of these must have an actual test asserting the _rejection_, not just a code review claiming the check exists. `test-reviewer` checks for this on relevant changes.

## Playwright agent-assisted testing support `[PROPOSED]`

Official Playwright tooling for test planning, generation, healing, and visual regression may be adopted once the dashboard exists and there's real UI to point it at. No such tooling is installed in Phase 0 — installing it now would have nothing to operate on. Evaluate official, actively maintained options at that time rather than adopting speculative third-party agent packages now.

## What Phase 0 established

The Vitest and Playwright dependencies, the root `playwright.config.ts`, the honest per-workspace gate scripts, and this document.

## Phase 2 status (2026-09-12)

Real unit tests now exist and pass in `packages/config`, `packages/db`, `packages/logger`, `apps/api`, and `apps/worker` (`docs/RELEASE_GATES.md`'s Phase 2 status table has exact counts). A real MySQL 8.x integration test exists in `packages/db` and `apps/api` — it connects, runs `SELECT 1`, and asserts the response; **it skips visibly rather than faking a pass when no MySQL instance is reachable** (no local Docker in this environment — see `docs/DEVELOPMENT.md`). CI now runs this against a real MySQL 8 service container. `apps/web` declares no test gates yet — a static foundation shell has no meaningful unit logic and no user flow for E2E; both become required once real logic/flows exist, per the `creatorcore.testGates` contract above.

## Phase 3 status
 
 `packages/db` now has a real physical schema and repository layer (`docs/adr/0006`'s conceptual model implemented — see `packages/db/README.md`), and `apps/api` now exposes the `/internal/workers/exchange` and `/internal/worker-assignments/*` HTTP surface (`docs/adr/0011`, `docs/adr/0006`'s WorkerAssignment claim mechanism). Real MySQL security-regression integration tests now exist for every scenario in this document's list that Phase 3 actually implements (tenant isolation, guild isolation, the two-hop IDOR path, worker eligibility, worker revocation across claim/renew/reclaim/release, the WorkerAssignment claim/renew/release/reclaim lifecycle including real concurrent-claim races, and AuditEvent immutability), plus direct unit coverage of the worker access-token verifier and the bootstrap-secret hashing logic. Scenarios this document lists but Phase 3 does not implement (credential rotation, internal push-notification/callback auth, stale-authorization-cache behavior, rate limiting) remain `NOT APPLICABLE`, not silently skipped — `bot_credentials` is inert scaffolding and no code path in Phase 3 touches it. **Whether these suites actually execute against a real MySQL instance (as opposed to skipping visibly, which is a legitimate but distinct `CONFIGURED BUT NOT VERIFIED` state) depends on the environment `pnpm test:integration` runs in** — see `docs/RELEASE_GATES.md`'s gate-status table for the current, honestly-reported outcome. A description of these tests existing is not itself a claim that they have been verified to pass against a real database in any specific environment.

## Phase 4A status

`apps/worker` now declares `creatorcore.testGates.integration: true` and includes a real HTTP integration suite (`tests/integration/worker-runtime.test.ts`) traversing the full boundary: real `ControlPlaneClient` → real Node HTTP server listening on an ephemeral port → real repository layer → real MySQL test database. All 10 required scenarios are verified: bootstrap authentication, capability discovery (information minimization), assignment claim, renewal, `/current` inspection, revocation handling, concurrent claim race serialization, loser runtime tracking prevention, graceful release, and ambiguous network failure transitions to `UNCERTAIN` (suspending privileged activity).
