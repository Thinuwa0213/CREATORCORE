# CreatorCore — Database Rules

**Status:** Phase 0 engineering contract. Tags follow `docs/ARCHITECTURE.md`.

## Engine `[LOCKED]`

- **MySQL 8.0 or later.**
- **InnoDB** as the storage engine for all future tables (supports transactions and foreign keys — required for tenant/guild-scoped referential integrity).
- **`utf8mb4`** as the default character set/collation, unless a specific column has a justified, documented exception.
- Proper **transactions** for any multi-statement write that must be atomic (e.g., anything touching more than one table as a single logical operation).
- **Foreign keys** used where they express a real integrity constraint (e.g., a guild row referencing its owning tenant) rather than left to be enforced only in application code.

This engine choice is fixed. Do not propose or silently substitute PostgreSQL, SQLite, or any other engine in code, tests, or documentation.

## Explicitly NOT decided yet `[UNRESOLVED]`

Do not assume answers to these; they are Phase 1 decisions:

- ORM / database client library (e.g., an ORM, a query builder, or raw `mysql2`-style access) — none is installed in Phase 0.
- Schema design (tables, columns, indexes).
- Migration strategy and tooling.
- Connection pooling strategy and pool sizing.
- Hosting/provider for MySQL in each environment.
- Backup/restore implementation.
- Read replicas or other scaling strategy.

## The tenant/guild-scoped query rule `[SECURITY-SENSITIVE — NEEDS REVIEW]`, principle `[LOCKED]`

This is the single most important rule in this document. When Phase 1 implements data access:

```
❌ findById(resourceId)
✅ findByTenantAndId(authorizedTenantId, resourceId)
```

Any function that loads, updates, or deletes a resource that belongs to a tenant or guild **must** take the authorized tenant/guild ID as a required parameter, and the underlying query **must** filter on it — not merely check it after the fact in application code. This makes the unsafe shape structurally harder to write by accident, and it's what `security-reviewer` and `architecture-reviewer` check for on every relevant change.

This applies even to admin/internal tooling unless a code path is explicitly, deliberately platform-wide (e.g., a genuine super-admin operation) — and such paths must be reviewed as security-sensitive precisely because they're the exception.

## Testing against MySQL, not a substitute `[LOCKED — principle]`

Once integration tests exist, they must run against a real MySQL instance (e.g., a MySQL container in CI), not SQLite or an in-memory substitute — MySQL-specific behavior (collation, isolation levels, foreign key enforcement, `utf8mb4` handling) is exactly what these tests need to catch. See `docs/TESTING.md`.

## Credentials `[LOCKED — principle]`

Database credentials are server-side secrets only, injected via environment variables (see `.env.example` for names), never exposed to browser/client code, and never shared between local/test/staging/production environments (`docs/DEVELOPMENT.md`). No production database credentials are used in local development or automated tests.

## No production data outside production `[LOCKED — principle]`

Test and staging environments use synthetic/seeded data. Production data (including real Discord user or guild data) is never copied into local, test, or CI environments.
