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

## The transition condition — when NOT APPLICABLE must become a real gate `[LOCKED — mechanism]`

`NOT APPLICABLE` is a Phase 0 fact, not a permanent exemption. The mechanism that enforces the transition:

- **Unit/Integration/E2E**: the moment any workspace under `packages/*` or `apps/*` adds a `creatorcore.testGates` entry setting a gate to `true`, `scripts/check-test-gate.mjs` requires a real, passing test for it — a declared gate with no implementation is a hard `FAIL`, not a skip. See `docs/TESTING.md` for the full contract.
- **Build**: the moment any workspace adds a `build` script to its `package.json`, `scripts/check-build-gate.mjs` runs it for real and fails the gate on a non-zero exit code.
- **Security checks**: become `PASS`/`FAIL` (rather than `CONFIGURED BUT NOT YET VERIFIED`) once the repository is pushed to GitHub and the workflows in `.github/workflows/` actually execute.

Reviewers (human or the `release-check` skill) should treat a workspace that _should_ obviously need a given test category (e.g., a dashboard app with no `e2e: true` declaration) as an architecture-review finding even before the mechanical gate would catch it — the mechanism catches declared-but-unimplemented gates; it does not yet catch "this workspace should have declared a gate but didn't." Closing that remaining gap (e.g., requiring dashboard-shaped apps to declare `e2e`) is a Phase 1 follow-up, not implemented now since no such app exists to define the rule against.

## What blocks merge today

Nothing yet — there is no product code and no PR flow in use. This document defines what _will_ block merge once Phase 1 work begins and CI actually runs against real changes.
