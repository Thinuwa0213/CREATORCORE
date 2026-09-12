---
name: release-check
description: Use before merging/releasing a substantial change, or when asked "is this ready to ship." Runs the full quality-gate order from docs/RELEASE_GATES.md and reports truthful PASS/FAIL/NOT APPLICABLE status for each — never a blanket "looks good."
---

# Release check

Runs the same gate order CI enforces (`docs/RELEASE_GATES.md`), locally, before you claim something is ready.

## Steps, in order — stop and report at the first hard failure unless asked to run everything regardless

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test` (unit) — per-workspace, honest `NOT APPLICABLE` where no workspace declares the gate (see `docs/TESTING.md`)
4. `pnpm test:integration` — same honesty contract
5. `pnpm test:e2e` — same honesty contract
6. `pnpm build`
7. Security review — invoke `security-reviewer` (or `security-audit` for a wider release) against the actual diff being released
8. Architecture review — invoke `architecture-reviewer` against the actual diff

## Reporting

For each of the 8 steps, report exactly one of: `PASS`, `FAIL` (with the real error output), or `NOT APPLICABLE` (with the reason — e.g. no workspace declares this gate yet). Never report a step as passing without having actually run it in this session. Never substitute "should be fine" for a real run.

If any step is `FAIL`, the release is not ready — say so plainly, and do not proceed to mark the overall change "done" or "ready to ship" until it's resolved. A change may still ship with expected `NOT APPLICABLE` results (e.g. no E2E tests because no dashboard exists yet) — that's a legitimate current state, not a blocker, as long as it matches what `docs/RELEASE_GATES.md` currently requires.
