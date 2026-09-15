# CreatorCore — Development

**Status:** Phase 0 engineering contract.

## Environment separation `[LOCKED — principle]`

Four distinct environments, kept strictly separate:

- **Local** — a developer's own machine. Uses local or personal-sandbox credentials only.
- **Test** — automated test execution (CI or local test runs). Uses disposable, synthetic data and test-only credentials (e.g., a throwaway MySQL instance/container).
- **Staging** — a pre-production environment for manual verification and (later) DAST scanning. Uses staging credentials and synthetic/seeded data — never real customer data.
- **Production** — the live system. Production credentials and production data are never required for, or used in, local development or automated tests.

No environment shares credentials with another. `.env.example` documents variable _names_ only; actual values are never committed.

## Local environment setup

CreatorCore's local dev environment is a single root `.env` file (`docs/adr/0008-deployment-runtime-model.md`) — not per-app env files, not `.env.local`. `scripts/check-test-gate.mjs` and the `apps/api`/`packages/db` integration suites already load it this way via Node's native `process.loadEnvFile`.

1. Run the bootstrap command:

   ```bash
   pnpm env:setup
   ```

   This generates `.env` at the repo root (refusing to overwrite an existing one unless you pass `-Force`), auto-generating every value that can safely be generated on your machine — `WORKER_TOKEN_SIGNING_KEY`, `BOT_CREDENTIAL_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY` (all independent, cryptographically random), and a stable `WORKER_ID` — and leaving three values blank for you to fill in.

2. Open the generated `.env`.
3. Fill in `DATABASE_URL` — your own local MySQL 8.0+ instance (`docs/DATABASE_RULES.md`).
4. Fill in `DISCORD_CLIENT_ID` — from the Discord Developer Portal, your CreatorCore application's OAuth2 page.
5. Fill in `DISCORD_CLIENT_SECRET` — same page, "Reset Secret" if you don't already have one.
6. In that same Discord application's **OAuth2 → Redirects**, add:

   ```text
   http://localhost:3000/api/auth/callback/discord
   ```

   This is not a guess — it follows directly from the code: Better Auth's `baseURL` is set to `WEB_APP_ORIGIN` (`apps/api/src/auth/index.ts`), Better Auth's own default callback route is `{baseURL}/callback/{providerId}` under its default `/api/auth` base path (`better-auth`'s `oauth2/utils.mjs`), the Discord provider is registered under the key `"discord"`, and `apps/web`'s `app/api/auth/[...all]/route.ts` transparently proxies every `/api/auth/*` request through to `apps/api`, byte-for-byte, so the browser only ever talks to the web origin. With the generated `.env`'s default `WEB_APP_ORIGIN=http://localhost:3000`, the exact callback URL is the one above. If you change `WEB_APP_ORIGIN`, the callback URL changes with it.

7. Run CreatorCore (see "Running the apps locally" below).

### How the root `.env` actually gets loaded today

This is a real, current limitation — not something this bootstrap tooling changes, per its scope:

- `pnpm test` / `pnpm test:integration` and the integration suites in `apps/api`/`packages/db`/`apps/worker` load the root `.env` automatically (`process.loadEnvFile`).
- `apps/api` and `apps/worker`'s own `start` scripts (`node dist/index.js`) do **not** auto-load it. Load it explicitly with Node's built-in flag, e.g. from the repo root:

  ```bash
  node --env-file=.env apps/api/dist/index.js
  node --env-file=.env apps/worker/dist/index.js
  ```

- `apps/web`'s `next dev` loads Next.js's own `.env*` files from `apps/web/`, not the repo-root `.env`. Until a future phase addresses this, export **only** the handful of values `apps/web`'s own schemas declare (`packages/config/src/web.ts` + `web-server.ts`: `NODE_ENV`, `NEXT_PUBLIC_APP_NAME`, `API_INTERNAL_URL`) into your shell session first — never the whole file. `apps/web` must never receive server secrets or `DATABASE_URL` (`docs/adr/0001`/`0002`, `docs/SECURITY.md`), and blanket-exporting every line of the root `.env` into the same process that then runs `next dev` would hand every apps/api-only secret to `apps/web`'s much larger, browser-tooling-heavy dependency tree — exactly the boundary `webConfigSchema`'s own header comment exists to prevent. In PowerShell:

  ```powershell
  $env:NODE_ENV = "development"
  $env:NEXT_PUBLIC_APP_NAME = "CreatorCore"
  $env:API_INTERNAL_URL = "http://localhost:8787"
  pnpm --filter @creatorcore/web dev
  ```

### `WORKER_ID` and worker provisioning

The bootstrap script generates a stable `WORKER_ID` (a UUID, generated once — re-running the script without `-Force` never changes it). That ID alone does not let `apps/worker` complete its control-plane bootstrap exchange (`docs/adr/0011-worker-service-identity.md`): `apps/api` only accepts a worker ID that has a matching row in the database, created via `packages/db`'s `provisionWorker()`, which also mints the `WORKER_BOOTSTRAP_SECRET` the worker would need to present. No script or route wires that provisioning step up yet (see the comment on `provisionWorker` in `packages/db/src/repositories/workers.ts`). Until it exists, `apps/worker` starts and runs its heartbeat exactly as it does today with `WORKER_ID` unset — this is expected, not a bug in the bootstrap tooling.

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
