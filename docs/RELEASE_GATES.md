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

## Current gate status (Phase 0)

| Gate                                 | Status at Phase 0                                 | Why                                                                |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| Lint                                 | Runs for real against actual tooling config files | See Foundation Gate 0 report for exact output                      |
| Typecheck                            | Runs for real against actual `.ts` tooling files  | See Foundation Gate 0 report for exact output                      |
| Unit tests                           | NOT APPLICABLE                                    | No `packages/*`/`apps/*` workspace exists yet                      |
| Integration tests                    | NOT APPLICABLE                                    | No workspace declares this gate; no DB/service boundary exists yet |
| E2E tests                            | NOT APPLICABLE                                    | No dashboard/browser-facing app exists yet                         |
| Security checks (CodeQL, Dependabot) | CONFIGURED BUT NOT YET VERIFIED                   | Repository has no remote / has not been pushed to GitHub           |
| Build                                | NOT APPLICABLE                                    | No buildable workspace exists yet                                  |

## The transition condition — when NOT APPLICABLE must become a real gate `[LOCKED — mechanism]`

`NOT APPLICABLE` is a Phase 0 fact, not a permanent exemption. The mechanism that enforces the transition:

- **Unit/Integration/E2E**: the moment any workspace under `packages/*` or `apps/*` adds a `creatorcore.testGates` entry setting a gate to `true`, `scripts/check-test-gate.mjs` requires a real, passing test for it — a declared gate with no implementation is a hard `FAIL`, not a skip. See `docs/TESTING.md` for the full contract.
- **Build**: the moment any workspace adds a `build` script to its `package.json`, `scripts/check-build-gate.mjs` runs it for real and fails the gate on a non-zero exit code.
- **Security checks**: become `PASS`/`FAIL` (rather than `CONFIGURED BUT NOT YET VERIFIED`) once the repository is pushed to GitHub and the workflows in `.github/workflows/` actually execute.

Reviewers (human or the `release-check` skill) should treat a workspace that _should_ obviously need a given test category (e.g., a dashboard app with no `e2e: true` declaration) as an architecture-review finding even before the mechanical gate would catch it — the mechanism catches declared-but-unimplemented gates; it does not yet catch "this workspace should have declared a gate but didn't." Closing that remaining gap (e.g., requiring dashboard-shaped apps to declare `e2e`) is a Phase 1 follow-up, not implemented now since no such app exists to define the rule against.

## What blocks merge today

Nothing yet — there is no product code and no PR flow in use. This document defines what _will_ block merge once Phase 1 work begins and CI actually runs against real changes.
