# CreatorCore — Instructions for Claude

CreatorCore is a commercial, multi-tenant platform for branded Discord bots. It must remain **one reusable platform + reusable modules + tenant configuration** — never a codebase that gets forked per client. Read this file before doing any substantial work in this repository.

## Current phase

As of Phase 0 (Foundation), this repository contains **engineering infrastructure only**: documentation contracts (`docs/`), this file, review agents (`.claude/agents/`), skills (`.claude/skills/`), and monorepo tooling. There is **no dashboard, no bot runtime, no database schema, no authentication system, and no production API** yet. Do not assume any of these exist — check.

## Before implementing any task

1. **Inspect the relevant existing implementation.** Read the actual files involved — do not assume based on naming or memory of similar projects.
2. **Read applicable architecture documentation** — `docs/ARCHITECTURE.md` at minimum; the relevant domain doc (`docs/DATABASE_RULES.md`, `docs/DISCORD_RULES.md`) for anything touching that area.
3. **Read `docs/SECURITY.md`** for anything touching authentication, authorization, data access, secrets, or Discord integration.
4. **Read `docs/DESIGN_SYSTEM.md`** for any UI/dashboard work.
5. **Determine tenant/guild authorization impact.** Ask explicitly: does this change touch data or actions scoped to a tenant or a Discord guild? If yes, the tenant/guild-scoped query rule in `docs/DATABASE_RULES.md` applies.
6. **Reuse existing patterns** where they exist rather than inventing new ones. Check `packages/*` for shared code before writing something new.
7. **Produce a concise implementation plan** for anything substantial (new module, new endpoint, new page, schema change, cross-cutting change) before writing code. Trivial fixes don't need this.
8. **Implement only the requested scope.** Don't bundle unrelated refactors, don't add speculative abstractions, don't build ahead of what was asked.

## Architecture-decision discipline

`docs/ARCHITECTURE.md` and its companions tag every decision `[LOCKED]`, `[PROPOSED]`, `[UNRESOLVED]`, or `[SECURITY-SENSITIVE — NEEDS REVIEW]`. Respect these tags:

- Never implement against an `[UNRESOLVED]` decision as though it were settled — surface the ambiguity and ask, or propose an option explicitly marked as a proposal.
- Never silently treat a `[PROPOSED]` default as `[LOCKED]`.
- Never weaken a `[LOCKED]` rule (e.g., the MySQL 8.0+/InnoDB database engine, or the tenant/guild-scoped query rule) without the user explicitly revisiting it.
- Anything `[SECURITY-SENSITIVE — NEEDS REVIEW]` gets an actual security-reviewer pass before being considered done, not just careful-sounding prose.

## After implementing

Run, in order, and report the **actual** result of each — not an assumption:

1. `pnpm lint`
2. `pnpm typecheck`
3. Relevant unit tests (`pnpm test`, scoped to the affected workspace where possible)
4. Relevant integration tests (`pnpm test:integration`)
5. Affected E2E tests where available (`pnpm test:e2e`)
6. Build the affected application/package (`pnpm build`)
7. **Security review** — invoke the `security-reviewer` subagent (or the broader `security-audit` skill for wider changes) for anything touching auth, data access, secrets, or Discord integration
8. **Architecture consistency review** — invoke the `architecture-reviewer` subagent for anything touching module boundaries or shared code
9. **Report failing checks truthfully.** A failing check is reported as failing — it is never silently bypassed, skipped, or reframed as a non-issue.

Use `NOT APPLICABLE` (with the reason) when a check genuinely doesn't apply yet (e.g., no dashboard exists so E2E is not applicable) — see `docs/RELEASE_GATES.md` for the exact status vocabulary (`PASS` / `FAIL` / `NOT APPLICABLE` / `CONFIGURED BUT NOT YET VERIFIED`). `NOT APPLICABLE` is not a substitute for actually running a check that _does_ apply.

## Hard rules

- **Never claim something is secure, tested, working, or production-ready without corresponding evidence from checks actually run in this session.** "Should work" is not evidence.
- **Never silently bypass a failing test** (no `--no-verify`, no commenting out an assertion, no skipping a suite to make the run look clean) to make a task appear complete.
- **Never expose, log, or return a Discord bot token or other secret** through any code path — see `docs/DISCORD_RULES.md` and `docs/SECURITY.md`.
- **Never write a tenant/guild-scoped data-access function that takes only a resource ID.** Always require the authorizing tenant/guild ID too (`docs/DATABASE_RULES.md`).
- **Never introduce a permanent client-specific fork of shared/core code.** Client customization goes through configuration/extension points (`docs/ARCHITECTURE.md`).
- **Never add a dependency, framework, or database engine not already `[LOCKED]`** without flagging it as a decision for the user, even if it seems obviously correct.
- **Never fabricate code or tests purely to make a quality gate look green.** A genuinely empty test category is reported as `NOT APPLICABLE`, not papered over.

## Git safety

Before any large or destructive change: run `git status` first. Never discard uncommitted work without explicit confirmation. Prefer small, reviewable commits (`docs/DEVELOPMENT.md`). Never create the first commit of a large scaffold without giving the user a chance to review the file list first, unless they've explicitly said to commit.

## Subagents and skills available in this repo

- `.claude/agents/security-reviewer.md`, `architecture-reviewer.md`, `ui-reviewer.md`, `test-reviewer.md` — invoke proactively per their descriptions, not only when asked.
- `.claude/skills/new-module`, `new-dashboard-page`, `new-api`, `security-audit`, `release-check` — use these instead of freehanding the equivalent workflow from scratch.

## Where to look

- `docs/ARCHITECTURE.md` — module boundaries, tech-stack decisions and their status, client source-code strategy.
- `docs/SECURITY.md` — security principles, defense-in-depth layers and their honest limits.
- `docs/DATABASE_RULES.md` — MySQL 8.0+/InnoDB (locked), tenant/guild-scoped query rule.
- `docs/DISCORD_RULES.md` — token handling, permission verification.
- `docs/DESIGN_SYSTEM.md` — UI rules and anti-patterns.
- `docs/TESTING.md` — test strategy, the per-workspace `creatorcore.testGates` contract, security regression scenarios.
- `docs/DEVELOPMENT.md` — environment separation, git workflow.
- `docs/RELEASE_GATES.md` — CI gate order and status vocabulary.
