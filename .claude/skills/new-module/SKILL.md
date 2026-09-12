---
name: new-module
description: Use when creating a new shared package under packages/* for CreatorCore. Enforces module-boundary, tenant-isolation, and testing conventions instead of generating unstructured boilerplate.
---

# New shared module (`packages/*`)

A "module" here means a shared package other apps/packages depend on — not a one-off feature. Before creating one, confirm it's actually shared: if only one app will ever use this code, it likely belongs in that app, not in `packages/*` (see `docs/ARCHITECTURE.md` on unnecessary abstractions).

## Steps

1. **Check for an existing home first.** Grep `packages/*` for similar functionality. A bug fixed once in a shared module beats the same fix applied in N client bots — don't create a second module that does almost the same thing as an existing one.
2. **Confirm the boundary.** Read `docs/ARCHITECTURE.md`'s module-boundary rules. Shared/core packages must not contain client-specific branding, config, or one-off customer logic — those stay in the consuming app or a config layer, per the client source-code strategy.
3. **Scaffold minimally**:
   - `packages/<name>/package.json` — name as `@creatorcore/<name>`, extend the root `tsconfig.base.json` from a local `tsconfig.json`, and declare a `creatorcore.testGates` block honestly (only set `unit`/`integration` to `true` once you're actually adding matching tests — see `docs/TESTING.md`).
   - `packages/<name>/src/index.ts` as the sole public entry point — don't let consumers deep-import internal files.
   - No `dist/` committed; build output is generated, not checked in.
4. **Strict TypeScript.** Inherit `tsconfig.base.json` as-is; don't loosen strictness for this package. If a dependency truly requires it, document why in the package's README, not silently in config.
5. **If this module touches tenant- or guild-scoped data**, every exported function that accepts a resource ID must also require the authorizing tenant/guild ID as a parameter — never `getById(id)`, always `getByTenantAndId(tenantId, id)` or equivalent. This is a hard rule from `docs/DATABASE_RULES.md`, not a style preference.
6. **Tests live beside the code** (`src/**/*.test.ts` for unit, `tests/integration/**` for integration), matching whatever the package's `creatorcore.testGates` declares — declaring a gate `true` with no tests is a release-blocking gate failure by design (`scripts/check-test-gate.mjs`).
7. **No secrets, no hardcoded credentials, no environment-specific values** in shared module code — those are injected by the consuming app, per `docs/DEVELOPMENT.md`'s environment-separation rules.

## Before finishing

Run `pnpm lint`, `pnpm typecheck`, and the package's own test script. Report actual results — do not claim the module is "done" if any of these haven't been run.
