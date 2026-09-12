# ADR-0004 — ORM / MySQL Data Layer

**Status:** LOCKED (approved 2026-09-12, Gate 1)

## Context

MySQL 8.0+/InnoDB/utf8mb4 is already `[LOCKED]` (`docs/DATABASE_RULES.md`). The remaining decision is the TypeScript data-access layer, which must make the `findByTenantAndId` pattern easy to write and the unsafe `findById` pattern hard to write by accident.

## Decision

**Drizzle ORM (current v0.45.x) + `mysql2` driver + `drizzle-kit` for migrations.**

Data access is wrapped in a `packages/db` repository layer (naming only, not implemented yet): every table with a `tenantId`/`guildId` column is accessed only through exported functions that require the scoping ID(s) as required parameters — the raw Drizzle table/query object for tenant-scoped tables is never exported directly to caller code outside `packages/db`.

## Alternatives Considered

- **Prisma** — mature, excellent DX and migration tooling historically, but its engine architecture is mid-transition (the Rust query engine is being phased out in favor of a TypeScript/WASM engine, with `prisma`/`@prisma/client` major versions actively diverging as of this writing — v8 CLI release candidates alongside a v7 client). This is more platform churn risk right now than the project needs to take on. Prisma's schema-first migrations are also more opinionated/harder to hand-tune for specific InnoDB behavior than Drizzle's SQL-first approach.
- **`mysql2` with a hand-rolled repository/query layer (no query builder)** — maximum control, but no compile-time type safety on queries and no migration tooling; more code to write and review for every query, which works against maintainability and AI-assisted-development consistency.
- **Kysely** — a strong, genuinely competitive type-safe SQL query builder; very close runner-up. Drizzle is preferred narrowly for its first-party Better Auth adapter (ADR-0003) and slightly larger current ecosystem/migration tooling (`drizzle-kit`); Kysely remains a reasonable fallback if Drizzle's relational query API proves inadequate.

## Consequences

Drizzle's relational query API is less mature than Prisma's for deeply nested reads — occasional hand-written joins will be needed. This is treated as an acceptable tradeoff: CreatorCore's core requirement is _precise, auditable query shape_ for tenant-scoped data, not convenience for arbitrary nested fetches, so Drizzle's explicitness is a feature, not a gap, for the parts of the schema that matter most for isolation.

## Security Impact

The repository-layer convention (require tenant/guild ID as a parameter, never export the raw scoped table) is the primary structural defense against IDOR alongside `security-reviewer`'s review gate and the mandatory cross-tenant regression tests already required by `docs/TESTING.md`. Drizzle's parameterized query builder prevents string-concatenation SQL injection by construction as long as raw SQL escape hatches are not used without justification — `security-reviewer` should flag any use of Drizzle's raw-SQL escape hatch for review.

## Revisit Conditions

Revisit if Drizzle's relational-query gaps become a recurring maintenance burden, or if Prisma's engine transition stabilizes and its migration/DX advantages become decisive later. Not revisited merely because Prisma is more popular.
