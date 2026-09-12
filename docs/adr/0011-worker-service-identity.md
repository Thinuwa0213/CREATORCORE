# ADR-0011 — Worker Service Identity & Internal Authentication

**Status:** LOCKED — DIRECTION (approved 2026-09-12, Gate 1). The conceptual direction and requirements below are binding; the exact signing/key implementation (e.g., which token format, which signing key store) is explicitly left open for implementation design, not decided here.
**Security-sensitivity:** high — this credential gates access to the credential-decryption path in ADR-0007 and to every configuration/authorization read the worker performs.

## Context

ADR-0002 and ADR-0009 both assumed an "internal service credential" for `apps/worker` ↔ `apps/api` communication without specifying its lifecycle. A single, permanent, global internal API password would mean one leaked value compromises every worker indefinitely, with no way to revoke one worker without re-keying the whole fleet. This ADR resolves that open item before Gate 1, as required by both of those ADRs' Security Impact sections.

## Decision

**Every worker process has an independent service identity.** No global internal API password.

Two-step credential exchange:

1. **Bootstrap:** each worker is provisioned with its own worker-specific, high-entropy, rotatable long-lived credential (its "bootstrap secret"), distinct from every other worker's. This is provisioned at deploy time (e.g., via the platform's secret store), never hardcoded, never logged, never reachable from browser code.
2. **Exchange:** the worker authenticates to `apps/api` with its bootstrap secret and worker ID, and receives a **short-lived, scoped internal access credential** — target lifetime **15 minutes** — which it uses for actual API calls (polling for configuration, requesting credential-decryption material under ADR-0007, reporting status) until it expires, at which point it repeats the exchange.

**Gate 1 addition — the reverse direction.** ADR-0009's push path requires `apps/api` to call an authenticated callback _exposed by the worker_ — the direction above only covers the worker authenticating to `apps/api`, not the reverse. Security review correctly flagged that without an explicit inbound-authentication rule, the worker's push-callback listener (ADR-0008's narrow internal-only inbound port) could not actually verify a `CredentialRotated`/`TenantDisabled` call came from `apps/api` rather than a spoofing actor on the internal network — a real gap, since a spoofed `TenantDisabled` could disrupt a legitimate tenant's bot even though it carries no secret.

The rule: at exchange time, alongside the worker's own short-lived access credential, `apps/api` issues and records (server-side, tied to that worker's current exchange session) a **callback authentication token** scoped to that one worker. Every push call `apps/api` makes to that worker's callback presents this token; the worker checks it against the value it received at its own last exchange before acting on the payload, and rejects (and audits as a failed-auth event) anything missing, expired, or not matching — identical treatment to the outbound direction, just carried by a token minted for the opposite purpose rather than a second, unrelated mechanism. The token shares the access credential's 15-minute target lifetime and is re-issued at the same re-exchange the worker already performs, so there is no separate rotation schedule to track.

**Requirements, all locked:**

- **Independent worker IDs** — each worker is individually identifiable, not interchangeable with "the worker fleet."
- **Individual revocation** — revoking one worker's access (bootstrap secret or active short-lived credential) never requires rotating any other worker's credentials.
- **Rotatable long-lived/bootstrap credential** — the bootstrap secret itself can be rotated without downtime (old + new valid during a cutover window, old one retired once the worker confirms the new one).
- **Scoped internal permissions** — the short-lived credential authorizes only what that specific worker legitimately needs: its own status reporting, configuration reads, and credential-decryption requests (ADR-0007) for `BotApplication`s where a current **WorkerAssignment claim** (ADR-0006, added at Gate 1) names this worker — never a blanket "any worker can do anything" grant, and never authorized by a caller-supplied `botApplicationId` alone.
- **Issuer validation** — `apps/api` only accepts short-lived credentials it itself issued.
- **Audience validation** — a credential issued for internal worker↔API use is rejected if presented anywhere else (it is not a general-purpose bearer token).
- **Expiry validation** — enforced on every request; no silent extension.
- **TLS transport** — required for both the bootstrap exchange and every subsequent authenticated call; no plaintext HTTP internally.
- **Failed-auth auditing** — a failed bootstrap exchange or a rejected short-lived credential is recorded (worker ID, reason, timestamp) as an AuditEvent/structured log (ADR-0010), without logging the credential values themselves.
- **No credential logging** — neither the bootstrap secret nor the short-lived credential ever appears in logs, error messages, or crash reports.
- **No browser access** — worker credentials are never provisioned to, exposed to, or reachable from `apps/web` or any browser-facing code path.

## Alternatives Considered

- **One shared global internal API password** — rejected: a single leak compromises every worker simultaneously, and revoking it requires re-keying the entire fleet, which is exactly the operational failure mode this ADR exists to avoid.
- **mTLS (mutual TLS) per worker now** — a strong long-term option and an explicit future direction (see Revisit Conditions), not adopted as the initial mechanism because it requires a certificate-issuance/rotation pipeline CreatorCore doesn't have yet at Phase 1 scale; adopting it prematurely would be infrastructure ahead of demonstrated need, which `docs/ARCHITECTURE.md`/ADR-0008 both caution against.
- **Long-lived per-worker API keys with no exchange step** — rejected: a leaked long-lived key is valid indefinitely until someone notices and rotates it; the short-lived exchange bounds the exposure window of the credential actually used for API calls to the 15-minute target lifetime, while still allowing the bootstrap secret to be rotated on its own, independent cadence.

## Consequences

Every worker now performs a re-authentication round-trip at least every 15 minutes, a small added operational cost (retry/backoff on exchange failure must be handled so a transient `apps/api` blip doesn't drop a worker's connections) — accepted because it bounds the value of a stolen short-lived credential to at most 15 minutes of use, a direct mitigation for the "worker impersonation" and "compromised worker" scenarios in `docs/THREAT_MODEL.md`.

## Security Impact

- **A worker's bootstrap secret leaks:** an attacker can mint short-lived credentials as that worker until the secret is rotated and revoked — bounded to that one worker's scoped permissions, not the fleet, because of independent worker IDs and individual revocation.
- **A worker's short-lived credential leaks:** bounded exposure window (≤15 minutes by design), and still scoped to that worker's own permissions.
- **`apps/api` is compromised:** an attacker there can already authorize anything regardless of this ADR (it is the issuer) — this ADR does not protect against that scenario; ADR-0007's Security Impact already names `apps/api` compromise as the remaining correctly-scoped risk after envelope encryption.
- **Worker impersonation attempt (no valid bootstrap secret):** rejected at the bootstrap-exchange step; recorded as a failed-auth audit event.

## Revisit Conditions

Revisit the bootstrap-secret-plus-short-lived-token mechanism in favor of workload identity or mTLS once either (a) a certificate-issuance pipeline exists for other reasons (e.g., a managed hosting platform provides it natively) or (b) the worker fleet grows large enough that per-worker bootstrap-secret provisioning becomes a real operational burden. This ADR's authorization semantics (independent identity, scoped permissions, individual revocation) are designed to carry over unchanged to either future mechanism — migrating is a transport/issuance change, not a redesign of what a worker is allowed to do.
