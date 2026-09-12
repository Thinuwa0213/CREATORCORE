# ADR-0009 — Internal Communication (Control Plane ↔ Workers)

**Status:** LOCKED WITH AMENDMENT (approved 2026-09-12, Gate 1 — the push-payload restriction below is a required condition of approval)

## Context

`creatorcore-worker` needs to learn about configuration/lifecycle changes (module enabled/disabled, token rotated, tenant disabled) initiated through `creatorcore-api`. Message volume is low (configuration events, not per-Discord-message traffic).

## Decision

**Direct internal HTTP, no broker, in two directions:**

- **Pull (routine):** `creatorcore-worker` polls `creatorcore-api` on a short interval (e.g., every 30–60 seconds — exact value an implementation detail, not architecture) for configuration relevant to the `BotApplication`s it currently hosts, using its internal service credential (ADR-0002).
- **Push (urgent/security-sensitive only):** for events that must propagate faster than the poll interval allows — specifically credential rotation and tenant/bot disablement — `creatorcore-api` calls an authenticated internal callback exposed by the worker. This is deliberately limited to security-sensitive events, not used as a general event bus.

No queue or broker (Kafka/RabbitMQ/etc.) is introduced. The internal contract is a small, well-defined set of named events (`ConfigChanged`, `CredentialRotated`, `TenantDisabled`) so that if a broker is introduced later, the _shape_ of these events doesn't need to change — only their transport.

### Gate 1 amendment — push payload content `[LOCKED — required correction]`

**A push notification MUST NOT contain the plaintext bot credential, or any other secret.** Treat every push payload as a bare signal — e.g. `CredentialRotated { botApplicationId, newKeyVersion }` — never as a transport for the credential material itself. On receiving the signal, the authorized worker retrieves the actual credential through the controlled, authenticated path defined in ADR-0007's amended decryption boundary (worker authenticates with its ADR-0011 identity, is authorized for that specific `BotApplication`, and performs decryption itself) — it never trusts the push payload as a source of secret material, and it never trusts an unauthenticated or unauthorized caller's push as true without independently verifying via that same authenticated path. This closes the "internal notification spoofing" scenario in `docs/THREAT_MODEL.md`: even a forged or replayed push callback cannot itself deliver a credential, because the callback carries no credential to forge.

## Alternatives Considered

- **Direct database observation/polling by the worker (bypassing `apps/api`)** — rejected: it would give the worker direct MySQL access, breaking ADR-0002's boundary that only `apps/api` touches the database, and would duplicate authorization/decryption logic in a second place.
- **A message queue/broker from day one** — rejected as premature: current event volume (per-tenant configuration changes) does not justify the operational cost of running and securing a broker; explicitly against the stated priority to avoid unnecessary distributed infrastructure.

## Consequences

Non-urgent configuration changes have a bounded propagation delay (the poll interval) rather than being instantaneous — an accepted tradeoff given these are admin-configuration changes, not real-time user-facing events. Urgent security events (credential rotation, disablement) do not wait for the poll interval.

## Security Impact

The worker's internal service credential used for both directions is itself a privileged secret and must follow the same non-exposure/rotation discipline as customer bot credentials (ADR-0007). Its full lifecycle — per-worker identity, rotatable bootstrap secret, short-lived (15-minute target) scoped internal access credential, individual revocation, issuer/audience/expiry validation — is specified in ADR-0011, resolved at Gate 1. Both the poll path and the push callback must authenticate with this credential; an internal endpoint that trusts a caller merely because it arrived on the internal network, without validating this credential, is an authorization gap a reviewer should flag.

## Revisit Conditions

Introduce a lightweight broker only if measured poll load on `creatorcore-api` or push-callback fan-out to a growing worker fleet becomes a demonstrated bottleneck — not preemptively. The named-event contract above is designed specifically so that this later change does not require redesigning how either side reasons about these events.
