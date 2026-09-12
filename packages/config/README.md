# @creatorcore/config

Typed, runtime-scoped environment configuration. Each workspace loads only the schema it needs — `apps/web` cannot accidentally gain database credentials because `webConfigSchema` has no `DB_*` fields, not because of a runtime check.

## Why zod

Not explicitly locked in `docs/adr/`, but already the validation approach this stack anticipates: ADR-0002 names `@hono/zod-validator`/`@hono/zod-openapi` for `apps/api`, and ADR-0003 calls out that Better Auth is "Zod-first." Using a different validation library here would be the "inconsistent patterns" problem `architecture-reviewer` checks for — one project, one validation approach. Treated as a local implementation dependency per the Phase 2 brief, justified here rather than silently added.

## Rules

- `loadDatabaseConfig`/`databaseConfigSchema` are reachable only via the `@creatorcore/config/database` subpath — never re-exported from the package's main entry point. This is a real, structural restriction (Node's `exports` field resolution, not convention): `import { loadDatabaseConfig } from "@creatorcore/config"` does not work, by design. Found and fixed during Gate 2 architecture review — the original version re-exported it from the main barrel, which meant `apps/web`/`apps/worker` could have reached DB credentials through a dependency they already legitimately hold, without adding anything a reviewer would flag. Only `apps/api`'s own composed config (`loadApiConfig`, which `.extend()`s the database schema) and the integration tests in `packages/db`/`apps/api` import the `/database` subpath directly — never `apps/web`, never `apps/worker` (`docs/adr/0002-backend-api-architecture.md`).
- `webConfigSchema` contains only values safe to expose to the browser. A future server-only value for `apps/web` needs its own, separate schema — never added to this one by reflex.
- Validation failures throw `ConfigValidationError`, whose message contains only field names and zod's own issue text — never the raw value that was supplied. This is tested, not just asserted (see `src/api.test.ts`).
- Missing/malformed required configuration fails fast (throws) at startup. There is no degraded-mode fallback for a required field.
