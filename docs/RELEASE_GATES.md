# CreatorCore — Release Gates

**Status:** Phase 0 engineering contract.

## Required gate order `[LOCKED — order and principle; exact CI wiring evolves as apps/packages appear]`

```
Lint → Typecheck → Unit Tests → Integration Tests → E2E Tests → Security Checks → Build
```

A failure at any required gate blocks merge/release. See `.github/workflows/ci.yml` for the current wiring.

## Status vocabulary `[LOCKED]`

Every gate reports exactly one of:

- **PASS** — the check ran for real and succeeded.
- **FAIL** — the check ran for real and failed. Blocks release.
- **NOT APPLICABLE** — nothing exists yet for this check to validate (e.g., no workspace declares this test gate, no buildable package exists). This is a legitimate, honestly-reported state — not a hidden failure and not a disguised pass on functionality that doesn't exist.
- **CONFIGURED BUT NOT YET VERIFIED** — infrastructure/tooling is set up but hasn't actually executed in a real environment yet (e.g., CodeQL/Dependabot before this repo has a GitHub remote to run against).

No gate is ever reported as `PASS` when it did not actually run, and no gate is ever silently omitted from a report.

## Current gate status (Phase 2)

| Gate                                 | Status at Phase 2                                                       | Why                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                                 | PASS                                                                    | Single root ESLint config now covers repo tooling + all 6 workspaces (`apps/*`, `packages/*`)                                                                                                                             |
| Typecheck                            | PASS                                                                    | Root tooling + all 6 workspaces, each with strict TS against its own tsconfig                                                                                                                                             |
| Unit tests                           | PASS                                                                    | Real tests in `packages/config`, `packages/db`, `packages/logger`, `apps/api`, `apps/worker`                                                                                                                              |
| Integration tests                    | PASS (gate) / **CONFIGURED BUT NOT VERIFIED** (the actual DB assertion) | `packages/db` + `apps/api` declare this gate and run for real; the MySQL assertion itself skips honestly when no DB is reachable locally — see `docs/DEVELOPMENT.md`. CI runs it against a real MySQL 8 service container |
| E2E tests                            | NOT APPLICABLE                                                          | `apps/web` is a static foundation shell with no user flow yet — no workspace declares this gate                                                                                                                           |
| Security checks (CodeQL, Dependabot) | CONFIGURED BUT NOT YET VERIFIED                                         | Repository has no remote / has not been pushed to GitHub                                                                                                                                                                  |
| Dependency audit (`pnpm audit`)      | PASS at `--audit-level=high`                                            | One MODERATE transitive finding (drizzle-kit's deprecated esbuild-kit chain) — reported, not blocking                                                                                                                     |
| Build                                | PASS                                                                    | All 6 workspaces build for real, including `next build` for `apps/web`                                                                                                                                                    |

**Read the Integration tests row carefully — this is the exact "gate exit code vs. honest status" distinction this document exists to prevent blurring.** The gate _script_ reports PASS because the test process exited 0; the underlying MySQL connectivity assertion itself did not run (no reachable database in this environment) and is honestly `CONFIGURED BUT NOT VERIFIED`, not a verified pass. Never collapse these two into one "PASS" when reporting status — see the Gate 2 Implementation Foundation report for the exact wording used.

## Current gate status (Phase 4A)

| Gate                                  | Status at Phase 4A | Why                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint                                    | PASS                | Re-verified against the Phase 4A diff (0 errors, 0 warnings)                                                                                                                                                                                                 |
| Typecheck                               | PASS                | All 6 workspaces typecheck cleanly                                                                                                                                                                                                                           |
| Unit tests                              | PASS                | 107 tests across 5 workspaces (up from 92 at Phase 3) — includes unit coverage for ControlPlaneClient token/secret lifecycle, 401 re-auth, backoff, and AssignmentCoordinator OWNED/UNCERTAIN/LOST state machine and shutdown release                     |
| Integration tests                       | **PASS (executed, not skipped)** | Ran against the dedicated CreatorCore test MySQL instance via externally-injected `DATABASE_URL` — 80 tests genuinely executed (47 in `packages/db`, 24 in `apps/api`, 9 in `apps/worker`), traversing real HTTP server boundary in `apps/worker` and verifying capability discovery, claim race serialization, lease renewal, revocation, and UNCERTAIN transport transitions |
| Migration set (clean-schema apply)      | PASS (executed)     | Unchanged from Phase 3 — both migrations applied cleanly to a fresh schema and verified                                                                                                                                                                      |
| E2E tests                               | NOT APPLICABLE      | Unchanged — `apps/web` still has no user flow                                                                                                                                                                                                              |
| Security checks (CodeQL, Dependabot)    | CONFIGURED BUT NOT YET VERIFIED | Unchanged — repository still has no GitHub remote                                                                                                                                                                                                          |
| Dependency audit (`pnpm audit`)         | PASS at `--audit-level=high` | Unchanged: one MODERATE transitive finding (`drizzle-kit`'s deprecated esbuild-kit chain, dev-only) — reported, not blocking                                                                                                                              |
| Build                                    | PASS                | All 6 workspaces build for real                                                                                                                                                                                                                            |

## Current gate status (Phase 4B/4C)

| Gate                                  | Status at Phase 4B/4C | Why                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint                                    | PASS                  | All workspaces and root tooling pass ESLint cleanly with 0 errors and 0 warnings                                                                                                                                                                            |
| Typecheck                               | PASS                  | All 6 workspaces typecheck cleanly under strict TypeScript                                                                                                                                                                                                   |
| Unit tests                              | PASS                  | Unit tests across `@creatorcore/config`, `@creatorcore/logger`, `@creatorcore/api`, and `@creatorcore/worker` covering AES-256-GCM + AAD cryptography, base64url 32-byte key validation, Discord token validator, and BotRuntimeManager state machine    |
| Integration tests                       | **PASS (executed, not skipped)** | Ran against the dedicated CreatorCore test MySQL instance: genuine execution in `packages/db`, `apps/api`, and `apps/worker`. Verifies envelope encryption, exact credential ID binding, atomic rotation cutover, and real HTTP Discord Gateway runtime  |
| Migration set (clean-schema apply)      | PASS (executed)       | Migration `0002_green_invisible_woman.sql` applied cleanly to MySQL schema                                                                                                                                                                                   |
| E2E tests                               | NOT APPLICABLE        | `apps/web` has no user flow yet                                                                                                                                                                                                                              |
| Security checks (CodeQL, Dependabot)    | CONFIGURED BUT NOT YET VERIFIED | Repository still has no GitHub remote                                                                                                                                                                                                                        |
| Dependency audit (`pnpm audit`)         | PASS at `--audit-level=high` | One MODERATE transitive dev-only finding (`drizzle-kit`'s deprecated esbuild-kit chain) — reported, not blocking                                                                                                                                            |
| Build                                    | PASS                  | All 6 workspaces build for real                                                                                                                                                                                                                              |

## Current gate status (Phase 5 Close-Out)

| Gate                                  | Status at Phase 5 Close-Out | Why                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint                                    | PASS                        | All 6 workspaces and root tooling pass ESLint cleanly with 0 errors and 0 warnings                                                                                                                                                                           |
| Typecheck                               | PASS                        | All 6 workspaces typecheck cleanly under strict TypeScript                                                                                                                                                                                                   |
| Unit tests                              | PASS                        | 237 tests across 5 workspaces (`@creatorcore/config`, `@creatorcore/db`, `@creatorcore/logger`, `@creatorcore/api`, `@creatorcore/worker`) covering Better Auth allowlist, CSRF origin checking, Discord OAuth crypto domain separation, runtime status logic, and worker runtime health reporting |
| Integration tests                       | **PASS (executed, not skipped)** | Ran against the dedicated CreatorCore test MySQL instance: 133 genuine executed tests (60 in `packages/db`, 63 in `apps/api`, 10 in `apps/worker`). Verifies full onboarding chain: guild connect -> atomic BotApplication creation -> worker claim -> READY report -> honest ONLINE status, Discord OAuth token encryption hooks, guild authorization boundaries, and test harness boundary gate |
| Migration set (clean-schema apply)      | PASS (executed)             | Migrations `0003_eager_diamondback.sql` and `0004_first_mordo.sql` applied cleanly to MySQL schema                                                                                                                                                           |
| E2E tests                               | **PASS (executed, not skipped)** | `apps/web` declares `creatorcore.testGates.e2e = true`; Playwright suite executes against live `apps/api` and `apps/web` processes with real MySQL backend and deterministic test Discord adapter (3 tests covering sign-in surface, deterministic Better Auth session bootstrap, manageable guild listing, guild connect, bot credential onboarding with immediate token clearing and DOM/storage hygiene, and truthful `NOT_CONFIGURED` -> `UNASSIGNED` status transition) |
| Security checks (CodeQL, Dependabot)    | CONFIGURED BUT NOT YET VERIFIED | Repository still has no GitHub remote                                                                                                                                                                                                                        |
| Dependency audit (`pnpm audit`)         | PASS at `--audit-level=high` | Unchanged: one MODERATE transitive dev-only finding (`drizzle-kit`'s deprecated esbuild-kit chain) — reported, not blocking                                                                                                                                |
| Build                                    | PASS                        | All 6 workspaces build for real, including Next.js production build for `apps/web`                                                                                                                                                                          |



## The transition condition — when NOT APPLICABLE must become a real gate `[LOCKED — mechanism]`

`NOT APPLICABLE` is a Phase 0 fact, not a permanent exemption. The mechanism that enforces the transition:

- **Unit/Integration/E2E**: the moment any workspace under `packages/*` or `apps/*` adds a `creatorcore.testGates` entry setting a gate to `true`, `scripts/check-test-gate.mjs` requires a real, passing test for it — a declared gate with no implementation is a hard `FAIL`, not a skip. See `docs/TESTING.md` for the full contract.
- **Build**: the moment any workspace adds a `build` script to its `package.json`, `scripts/check-build-gate.mjs` runs it for real and fails the gate on a non-zero exit code.
- **Security checks**: become `PASS`/`FAIL` (rather than `CONFIGURED BUT NOT YET VERIFIED`) once the repository is pushed to GitHub and the workflows in `.github/workflows/` actually execute.

Reviewers (human or the `release-check` skill) should treat a workspace that _should_ obviously need a given test category (e.g., a dashboard app with no `e2e: true` declaration) as an architecture-review finding even before the mechanical gate would catch it — the mechanism catches declared-but-unimplemented gates; it does not yet catch "this workspace should have declared a gate but didn't." Closing that remaining gap (e.g., requiring dashboard-shaped apps to declare `e2e`) is a Phase 1 follow-up, not implemented now since no such app exists to define the rule against.

## What blocks merge today

Nothing yet — there is no product code and no PR flow in use. This document defines what _will_ block merge once Phase 1 work begins and CI actually runs against real changes.
