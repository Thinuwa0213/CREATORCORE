# @creatorcore/db

Controlled MySQL/Drizzle data-access boundary (`docs/adr/0004-orm-data-layer.md`). Only `apps/api` depends on this package — `apps/web` and `apps/worker` never hold database credentials (`docs/adr/0002-backend-api-architecture.md`).

## What exists in Phase 2

- `createDatabaseClient(config)` — one controlled `mysql2` pool + Drizzle instance.
- `checkDatabaseConnectivity(pool)` — a safe `SELECT 1` probe for `/ready`, never throws.
- `drizzle-kit` wired via `drizzle.config.ts`, pointed at `src/schema.ts`.
- A real MySQL 8.x integration test (`tests/integration/connectivity.test.ts`) — connect, `SELECT 1`, assert, close. No SQLite substitution.

## What does not exist yet

**No product schema.** `src/schema.ts` defines zero tables. `docs/adr/0006-multi-tenant-model.md` locks the conceptual entity model — it explicitly does not approve a physical schema. Designing the first real migration (Tenant, Guild, BotApplication, etc.) is Phase 3+ work, done through `docs/adr/` the same way every other decision in this repo is: proposed, reviewed, approved, then implemented.

## Repository-boundary convention (binding once real tables exist)

`docs/DATABASE_RULES.md`'s rule applies to every tenant/guild-scoped table this package will ever hold:

```
❌ findById(resourceId)
✅ findByTenantAndId(authorizedTenantId, resourceId)
```

Concretely, once schema exists:

- The raw Drizzle table object for a tenant/guild-scoped table is never exported from this package's public entry point (`src/index.ts`). Only repository functions are.
- Every exported repository function that loads, updates, or deletes a tenant/guild-scoped resource takes the authorizing tenant/guild ID as a **required** parameter, and the underlying query filters on it — not a post-hoc check in application code.
- No function outside this package calls `mysql2` or the raw Drizzle query builder directly against a tenant/guild-scoped table.

## WorkerAssignment credential-access boundary (binding once BotCredential/WorkerAssignment tables exist)

`docs/adr/0006-multi-tenant-model.md` and `docs/adr/0007-credential-encryption.md` lock a specific rule for credential access: a worker's own identity is never sufficient on its own to authorize decryption material. The check requires **authenticated worker + current WorkerAssignment claim + specific BotApplication scope** — all three, every time. Concretely, once this code exists, these shapes are forbidden:

```
❌ getAllBotCredentials()
❌ getCredential(botApplicationId)                // worker identity not checked at all
❌ getCredential(workerId, botApplicationId)       // identity checked, claim not checked
✅ getCredentialForAssignedWorker(workerId, botApplicationId)  // verifies a live WorkerAssignment claim naming this worker for this BotApplication before returning anything
```

And per `docs/adr/0006`'s second Gate 1 amendment: creating/renewing a WorkerAssignment claim is itself an `apps/api`-side authorization decision, never a bare worker assertion — there is no `createAssignment(workerId, botApplicationId)` callable by worker-supplied input alone.

No code here does any of this yet — there's no credential table. This section exists so Phase 3 implementation starts inside the constraint rather than retrofitting it, consistent with how `docs/DISCORD_RULES.md` and `docs/SECURITY.md` are written.
