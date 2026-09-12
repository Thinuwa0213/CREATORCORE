# CreatorCore — Development

**Status:** Phase 0 engineering contract.

## Environment separation `[LOCKED — principle]`

Four distinct environments, kept strictly separate:

- **Local** — a developer's own machine. Uses local or personal-sandbox credentials only.
- **Test** — automated test execution (CI or local test runs). Uses disposable, synthetic data and test-only credentials (e.g., a throwaway MySQL instance/container).
- **Staging** — a pre-production environment for manual verification and (later) DAST scanning. Uses staging credentials and synthetic/seeded data — never real customer data.
- **Production** — the live system. Production credentials and production data are never required for, or used in, local development or automated tests.

No environment shares credentials with another. `.env.example` documents variable _names_ only; actual values are never committed.

## Setup (Phase 0 state)

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test            # currently NOT APPLICABLE — no product code yet
pnpm test:integration
pnpm test:e2e
pnpm build
```

There is no application to run yet. Once Phase 1 adds `apps/*`, this section will be updated with real run instructions per app.

## Git workflow `[PROPOSED]`

- **`main`** is the trunk; treated as protected once a remote exists (branch-protection rules themselves are configured on the Git host, not in this repo, and are not yet set up — see the Foundation Gate 0 report).
- Feature work happens on short-lived branches: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`, `docs/<short-description>`.
- Prefer small, reviewable commits over large ones. A single Phase 0 foundation commit is an intentional one-time exception, made only with explicit approval (see `docs/RELEASE_GATES.md`).
- Never force-push a shared branch without explicit confirmation from whoever else might be working on it.
- Before any destructive git operation (`reset --hard`, `checkout --`, `clean -f`, branch deletion), check `git status` for uncommitted work first.

## Before starting substantial work `[LOCKED — process, see CLAUDE.md]`

1. Inspect the relevant existing implementation.
2. Read the applicable docs in `docs/`.
3. Read `docs/SECURITY.md` and any other security-relevant doc for the area being touched.
4. Read `docs/DESIGN_SYSTEM.md` for any UI work.
5. Determine tenant/guild authorization impact.
6. Reuse existing patterns rather than inventing new ones.
7. Produce a concise implementation plan for anything substantial.
8. Implement only the requested scope.

The full pre/post-task checklist lives in the root `CLAUDE.md` — this section summarizes it; `CLAUDE.md` is authoritative.

## Dependency policy `[LOCKED — principle]`

Every dependency added must have a clear, stated reason. Phase 0 intentionally installs only workspace/TypeScript/lint/format/test-infrastructure tooling — no application framework, database driver, Discord library, or auth library. See `docs/ARCHITECTURE.md` for what remains `[UNRESOLVED]`.
