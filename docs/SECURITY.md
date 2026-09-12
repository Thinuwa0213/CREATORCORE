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
- The two-hop path `Guild → GuildBotAssignment → BotApplication → BotCredential` (`docs/adr/0006-multi-tenant-model.md`) must be authorized at every hop, not just the direct `Tenant → BotApplication` path — the required IDOR regression test for this is locked in `docs/TESTING.md`.

## Discord authorization freshness `[LOCKED, Gate 1 — `docs/adr/0003-authentication-sessions.md`]`

- Read-only/non-destructive authorization decisions (e.g., which guilds to list) may be cached for **at most 5 minutes**.
- Destructive, credential-related, ownership-related, or otherwise security-sensitive actions **always** re-verify authorization synchronously, at the moment of the action — never from a cache.
- Cached UI state must never itself grant a privileged operation — a stale "you can manage this guild" view is a display artifact, not an authorization decision.

## Discord-specific rules

See `docs/DISCORD_RULES.md` for the full rule set (token handling, never trusting client-supplied guild IDs, permission verification). Summarized here because it's security-critical:

- Bot tokens are never returned by any API response, logged, or exposed to browser code.
- A Discord login proves _identity_, not authorization to manage any particular guild — server-side permission checks against Discord's actual state are required before any guild-scoped action.
- Normal Discord user accounts are never automated (no self-botting).

## Secrets `[SECURITY-SENSITIVE — NEEDS REVIEW]`

- No production secret is ever committed to git. `.env.example` documents variable _names_ only.
- Bot credentials and other sensitive tenant secrets use envelope encryption at rest with key rotation (`docs/adr/0007-credential-encryption.md`, `LOCKED WITH AMENDMENT`). **The encryption key (KEK) must not be stored alongside the encrypted data in the same database** — `[LOCKED]`. Decryption happens in the authorized bot worker, scoped to the `BotApplication`s it hosts, not in `apps/api` alone — the normal API request path never transports or exposes plaintext (ADR-0007's Gate 1 amendment).
- **Superseded credential retention `[LOCKED, Gate 1]`:** CreatorCore does not keep a historical vault of rotated-out bot tokens. The superseded encrypted credential is deleted immediately after a successful rotation cutover; only non-secret audit metadata (who rotated it, when, outcome) is retained. See ADR-0007's rotation lifecycle for the full 9-step sequence and its failure handling.
- **Worker ↔ API internal credentials `[LOCKED — DIRECTION, Gate 1]`:** each worker has its own identity and rotatable bootstrap secret, exchanged for a short-lived internal access credential with a 15-minute target lifetime — never one shared global internal password. Individually revocable per worker. See `docs/adr/0011-worker-service-identity.md`.
- Secrets never appear in application logs, error responses, or client-side bundles — this must be an explicit, tested property (`docs/TESTING.md`), not an assumption.
- **The shared logger's redaction (`packages/logger`) is key-based, not content-based** — it matches field _names_ against a sensitive-key list; it does not scan free-text string values (including an `Error`'s `message`/`stack`) for secret-shaped content. **Never construct an `Error` or log message that interpolates a secret value into its text** — pass the secret as a separate, named field instead, which redaction does catch. This is documented and tested as an intentional scope boundary (`packages/logger/src/redact.ts`), found and narrowed during Gate 2 security review — not an unexamined gap.

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

Additionally established at Gate 1 (2026-09-12): the locked Phase 1 architecture decisions themselves (`docs/adr/`), the corrected credential-decryption boundary, the explicit 5-minute authorization-cache policy, the credential rotation/retention lifecycle, and the worker service-identity direction (ADR-0011).

Deferred to implementation (post-Gate-1): actual authentication implementation, actual tenant-isolation implementation and its tests, actual secret encryption implementation, actual worker identity/internal-auth implementation, actual rate limiting, staging DAST, production monitoring/alerting.

## Gate 1 update: architecture decisions locked, nothing implemented yet

`docs/THREAT_MODEL.md` records the Gate 1 threat analysis (stolen tokens, cross-tenant IDOR, compromised worker, compromised API, worker impersonation, rotation races, internal notification spoofing, etc.) against the now-`LOCKED` architecture in `docs/adr/`. As of 2026-09-12, ADRs 0001–0011 are approved and binding — see `docs/adr/README.md` for exact status per ADR, including the three that carried a required amendment (0003, 0007, 0009). **Locking the architecture is not implementing it.** No authentication system, dashboard, bot runtime, database schema, credential encryption, or worker identity exchange exists in code yet — the threat model documents intended mitigations against a now-approved design, not verified controls. ADR-0007 (credential encryption) and ADR-0003 (authentication & sessions) remain the two `[SECURITY-SENSITIVE — NEEDS REVIEW]` decisions in this batch and require the closest scrutiny again when implementation actually begins — a locked ADR is not a substitute for the `security-reviewer` pass `CLAUDE.md` requires on the resulting code.
