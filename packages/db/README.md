# @creatorcore/db

Controlled MySQL/Drizzle data-access boundary (`docs/adr/0004-orm-data-layer.md`). Only `apps/api` depends on this package — `apps/web` and `apps/worker` never hold database credentials (`docs/adr/0002-backend-api-architecture.md`).

## What exists as of Phase 3

- `createDatabaseClient(config)` — one controlled `mysql2` pool + Drizzle instance.
- `checkDatabaseConnectivity(pool)` — a safe `SELECT 1` probe for `/ready`, never throws.
- `drizzle-kit` wired via `drizzle.config.ts`, pointed at `src/schema/index.ts` — a directory of one file per table (not a single `schema.ts`, which existed only through Phase 2).
- The first real physical schema, implementing `docs/adr/0006-multi-tenant-model.md`'s conceptual model: `users`, `tenants`, `tenant_memberships`, `guilds`, `bot_applications`, `guild_bot_assignments`, `workers`, `worker_eligibility`, `worker_assignments`, `audit_events`, `bot_credentials` (`drizzle/0000_big_namorita.sql`). `GuildConfiguration`/`FeatureConfiguration` are deliberately still absent — no product/module configuration exists yet to justify them.
- A full repository layer (`src/repositories/`) — every tenant/guild-scoped table is reachable only through a `findByTenantAndId`-shaped function (see the convention below); the only bare-ID lookups are the documented platform-root exceptions (`findTenantById`, `findWorkerById`, `findUserById`).
- The WorkerAssignment claim/renew/release mechanism (`docs/adr/0006`'s Gate 1 amendment): `claimAssignment`/`renewAssignment`/`releaseAssignment`/`findAssignment` in `src/repositories/worker-assignments.ts`, gated by `worker_eligibility` — an `apps/api`-side authorization decision, never a bare worker assertion (see the credential-access boundary below, which the same principle extends to).
- AuditEvent append-only enforcement at two independent layers: no update/delete repository function exists in this package's public API, and the database itself rejects any `UPDATE`/`DELETE` against `audit_events` via `BEFORE UPDATE`/`BEFORE DELETE` triggers (`drizzle/0001_audit_events_immutability.sql`) — defense in depth, not reliance on "no code path happens to call it" alone.
- Real MySQL 8.x integration tests (`tests/integration/`) covering tenant isolation, guild isolation, the two-hop `Guild → GuildBotAssignment → BotApplication` IDOR path, worker eligibility, the WorkerAssignment claim/renew/release/reclaim lifecycle (including real concurrent-claim races against InnoDB locking), worker revocation, and AuditEvent immutability — never SQLite, never mocked. Each suite skips visibly (not a faked pass) when no database is reachable in the current environment.

## What does not exist yet

**`bot_credentials` is inert scaffolding only** (`docs/adr/0007-credential-encryption.md`). The table exists — `ciphertext`/`nonce`/`keyVersion` columns, no plaintext column, and there never will be one — but no repository function, package export, or HTTP route reads or writes it anywhere. No encryption flow, no rotation lifecycle, and no credential issuance/decryption endpoint are implemented yet; see the credential-access boundary section below, which remains forward-looking until that work begins. `GuildConfiguration`/`FeatureConfiguration` also remain unimplemented.

## Repository-boundary convention (binding, and now enforced across every table above)

`docs/DATABASE_RULES.md`'s rule applies to every tenant/guild-scoped table this package holds:

```
❌ findById(resourceId)
✅ findByTenantAndId(authorizedTenantId, resourceId)
```

Concretely:

- The raw Drizzle table object for a tenant/guild-scoped table is never exported from this package's public entry point (`src/index.ts`). Only repository functions are.
- Every exported repository function that loads, updates, or deletes a tenant/guild-scoped resource takes the authorizing tenant/guild ID as a **required** parameter, and the underlying query filters on it — not a post-hoc check in application code.
- No function outside this package calls `mysql2` or the raw Drizzle query builder directly against a tenant/guild-scoped table.

## WorkerAssignment credential-access boundary (binding once BotCredential decryption is implemented)

`docs/adr/0006-multi-tenant-model.md` and `docs/adr/0007-credential-encryption.md` lock a specific rule for credential access: a worker's own identity is never sufficient on its own to authorize decryption material. The check requires **authenticated worker + current WorkerAssignment claim + specific BotApplication scope** — all three, every time. Concretely, once this code exists, these shapes are forbidden:

```
❌ getAllBotCredentials()
❌ getCredential(botApplicationId)                // worker identity not checked at all
❌ getCredential(workerId, botApplicationId)       // identity checked, claim not checked
✅ getCredentialForAssignedWorker(workerId, botApplicationId)  // verifies a live WorkerAssignment claim naming this worker for this BotApplication before returning anything
```

And per `docs/adr/0006`'s second Gate 1 amendment: creating/renewing a WorkerAssignment claim is itself an `apps/api`-side authorization decision, never a bare worker assertion — `claimAssignment` already enforces this today (it checks `worker_eligibility`, itself populated only as a side effect of `createBotApplication`, never by worker-supplied input).

The `worker_assignments` table and its claim/renew/release repository functions exist today; the credential table (`bot_credentials`) and its decryption path do not. This section exists so that implementation, when it begins, starts inside the constraint rather than retrofitting it, consistent with how `docs/DISCORD_RULES.md` and `docs/SECURITY.md` are written.
