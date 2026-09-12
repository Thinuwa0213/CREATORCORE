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

Each of these must have an actual test asserting the _rejection_, not just a code review claiming the check exists. `test-reviewer` checks for this on relevant changes.

## Playwright agent-assisted testing support `[PROPOSED]`

Official Playwright tooling for test planning, generation, healing, and visual regression may be adopted once the dashboard exists and there's real UI to point it at. No such tooling is installed in Phase 0 — installing it now would have nothing to operate on. Evaluate official, actively maintained options at that time rather than adopting speculative third-party agent packages now.

## What Phase 0 has actually established

The Vitest and Playwright dependencies, the root `playwright.config.ts`, the honest per-workspace gate scripts, and this document. No test files, no fixtures, no seed data, no CI execution of a real test suite (there's nothing to execute yet — see the Foundation Gate 0 report for exact `pnpm test*` output).
