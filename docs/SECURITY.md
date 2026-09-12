# CreatorCore — Security

**Status:** Phase 0 engineering contract. See `docs/ARCHITECTURE.md` for the `[LOCKED]`/`[PROPOSED]`/`[UNRESOLVED]`/`[SECURITY-SENSITIVE — NEEDS REVIEW]` tag meanings — the same tags are used here.

No authentication system, dashboard, bot runtime, or database schema exists yet. This document defines the rules that future implementation must follow, and the honest boundaries of what current tooling can and cannot detect.

## No false guarantee `[LOCKED — principle]`

CreatorCore will never be described as "100% secure" or "hacker-proof." The goal is continuous risk reduction:

- reduce attack surface
- enforce least privilege
- prevent known vulnerability classes
- detect regressions
- protect secrets
- isolate tenants
- monitor failures
- patch vulnerabilities
- maintain secure release practices

Any claim that a feature is "secure," "tested," or "production-ready" must be backed by an actual check that was actually run in the current session — see `CLAUDE.md`.

## Tenant & guild isolation `[SECURITY-SENSITIVE — NEEDS REVIEW]`

This is the platform's primary security boundary, because a single defect here leaks one customer's Discord community data to another. Rules:

- Every privileged read/write is authorized server-side against the caller's verified tenant/guild membership — never trusted from a client-supplied ID.
- The query-shape rule in `docs/DATABASE_RULES.md` (`findByTenantAndId`, never bare `findById`) is mandatory for any tenant- or guild-scoped resource.
- Tests must explicitly attempt cross-tenant and cross-guild access and assert it is rejected — see `docs/TESTING.md`'s security-regression list. A feature without such a test is not considered isolation-verified.

## Discord-specific rules

See `docs/DISCORD_RULES.md` for the full rule set (token handling, never trusting client-supplied guild IDs, permission verification). Summarized here because it's security-critical:

- Bot tokens are never returned by any API response, logged, or exposed to browser code.
- A Discord login proves _identity_, not authorization to manage any particular guild — server-side permission checks against Discord's actual state are required before any guild-scoped action.
- Normal Discord user accounts are never automated (no self-botting).

## Secrets `[SECURITY-SENSITIVE — NEEDS REVIEW]`

- No production secret is ever committed to git. `.env.example` documents variable _names_ only.
- Bot credentials and other sensitive tenant secrets must eventually support encryption at rest with key rotation. **The encryption key must not be stored alongside the encrypted data in the same database** — key management strategy is `[UNRESOLVED]` for Phase 1 but this constraint is `[LOCKED]`.
- Secrets never appear in application logs, error responses, or client-side bundles — this must be an explicit, tested property (`docs/TESTING.md`), not an assumption.

## Database credentials `[LOCKED — principle]`

Database credentials are server-side secrets only and must never be exposed to browser code, regardless of which ORM/client Phase 1 selects. Local/test/staging/production must never share credentials or data (`docs/DEVELOPMENT.md`).

## Defense-in-depth layers and their honest limits

Security tooling is detection, not proof. Each layer below catches specific classes of problems and misses others — treat them as complementary, not redundant:

| Layer                                            | Catches                                                                                                                                  | Does NOT catch                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static analysis (CodeQL)                         | Known vulnerable code patterns (injection, unsafe deserialization, some taint-flow issues) in the languages/patterns it models           | Business-logic authorization bugs, tenant-isolation bugs, anything requiring domain knowledge of "who should be allowed to do this"                    |
| Dependency vulnerability scanning / Dependabot   | Known CVEs in third-party packages, outdated versions                                                                                    | Vulnerabilities in your own code, zero-days, misuse of a library that is itself secure                                                                 |
| Secret scanning                                  | Credential-shaped strings accidentally committed                                                                                         | Secrets exposed at runtime via logs/API responses, secrets that don't match a known pattern                                                            |
| Lockfile integrity                               | Unexpected/tampered dependency resolution                                                                                                | Malicious code in a legitimately-published new version of a real dependency                                                                            |
| Manual code review (the four `.claude/agents/*`) | Authorization logic, tenant/guild isolation, framework-specific misuse, design-level issues — anything requiring understanding of intent | Anything the reviewer doesn't think to check; review quality depends on actually reading the code, not skimming                                        |
| Security regression tests                        | Specific documented attack scenarios, once written (see `docs/TESTING.md`)                                                               | Attack scenarios nobody thought to write a test for                                                                                                    |
| Future staging DAST (e.g. OWASP ZAP)             | Runtime-observable issues (missing headers, some injection classes) against a running staging deployment                                 | Anything requiring authenticated multi-tenant state it doesn't know how to set up; not implemented yet — `[UNRESOLVED]`, deferred until staging exists |
| Production monitoring                            | Anomalous behavior after the fact                                                                                                        | Nothing before it happens — this is detection, not prevention                                                                                          |

**None of these replace manual security review**, and none of them, individually or together, justify claiming the product is secure.

## What Phase 0 has actually established vs. deferred

Established: this document, `docs/DATABASE_RULES.md`, `docs/DISCORD_RULES.md`, the `security-reviewer` subagent, the `security-audit` skill, CodeQL + Dependabot configuration (configured, unverified until pushed to GitHub — see the Foundation Gate 0 report).

Deferred to Phase 1+: actual authentication implementation, actual tenant-isolation implementation and its tests, actual secret encryption implementation, actual rate limiting, staging DAST, production monitoring/alerting.
