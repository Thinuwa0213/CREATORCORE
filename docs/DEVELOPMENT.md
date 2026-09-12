# CreatorCore — Development

**Status:** Phase 0 engineering contract.

## Environment separation `[LOCKED — principle]`

Four distinct environments, kept strictly separate:

- **Local** — a developer's own machine. Uses local or personal-sandbox credentials only.
- **Test** — automated test execution (CI or local test runs). Uses disposable, synthetic data and test-only credentials (e.g., a throwaway MySQL instance/container).
- **Staging** — a pre-production environment for manual verification and (later) DAST scanning. Uses staging credentials and synthetic/seeded data — never real customer data.
- **Production** — the live system. Production credentials and production data are never required for, or used in, local development or automated tests.

No environment shares credentials with another. `.env.example` documents variable _names_ only; actual values are never committed.

## Setup (Phase 2 state)

```bash
pnpm install
pnpm lint             # real — single root ESLint config covers every workspace
pnpm typecheck        # real — root tooling, then turbo fans out per workspace
pnpm test             # real unit tests in packages/config, packages/db, packages/logger, apps/api, apps/worker
pnpm test:integration # real MySQL 8.x test in packages/db + apps/api — skips honestly if no DB is reachable (see below)
pnpm test:e2e         # NOT APPLICABLE — no dashboard user flow exists yet
pnpm build            # real — builds all six workspaces, including `next build` for apps/web
pnpm audit            # dependency vulnerability check (--audit-level=high; report anything lower honestly too)
```

### Running the apps locally

```bash
# apps/web — dashboard UI/BFF shell
pnpm --filter @creatorcore/web dev        # http://localhost:3000

# apps/api — platform backend (health/ready only in Phase 2)
pnpm --filter @creatorcore/api build && pnpm --filter @creatorcore/api start   # http://localhost:8787/health, /ready

# apps/worker — Discord worker process foundation (no Gateway connection yet)
pnpm --filter @creatorcore/worker build && pnpm --filter @creatorcore/worker start
```

`apps/api` needs `DATABASE_URL` set (see `.env.example`) to start — it fails fast with a safe error if it's missing or malformed, per `packages/config`'s rules. `apps/web` and `apps/worker` need no database configuration at all; they structurally cannot hold DB credentials since their package.json dependencies never include `@creatorcore/db`.

### MySQL for local integration testing

`pnpm test:integration` requires a real MySQL 8.0+ instance reachable via `DATABASE_URL` — no SQLite substitution (`docs/DATABASE_RULES.md`). If none is reachable, the integration tests **skip visibly** (reported as `CONFIGURED BUT NOT VERIFIED`, never a faked pass) rather than failing silently or lying about coverage. A local MySQL 8 container (e.g. `docker run -e MYSQL_ROOT_PASSWORD=... -e MYSQL_DATABASE=creatorcore -p 3306:3306 mysql:8`) is one way to get a real instance; CI runs one automatically via a GitHub Actions service container.

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
