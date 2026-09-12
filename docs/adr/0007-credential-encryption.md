# ADR-0007 — Bot Credential Encryption & Key Management

**Status:** LOCKED WITH AMENDMENT (approved 2026-09-12, Gate 1 — the decryption-boundary correction below is a required condition of approval, not optional follow-up)
**Security-sensitivity:** highest in this proposal — treat any deviation from this ADR as requiring explicit re-review.

## Context

Customers provide Discord bot tokens. `docs/SECURITY.md` and `docs/DISCORD_RULES.md` already lock the constraints (never plaintext, never returned via normal API, never logged, key not stored alongside ciphertext). This ADR designs the mechanism.

## Decision

**Envelope encryption**, using **AES-256-GCM via `@noble/ciphers`** (an audited, pure-JS, dependency-minimal cipher library — already a transitive dependency of the ADR-0003 auth library, reducing total dependency surface) for data-encryption-key (DEK) operations. The DEK is wrapped by a separate key-encryption-key (KEK) held **outside the application database**:

- Preferred: a managed cloud KMS, once a hosting provider is chosen (ADR-0008).
- Minimum acceptable for a self-hosted Phase 1 deployment: a KEK supplied via an environment variable/secret store provisioned **only to the `apps/api` process** — never to `apps/web`, never to `apps/worker`.

## Gate 1 amendment — decryption boundary `[LOCKED — required correction]`

The original proposal's wording implied plaintext bot-token decryption was confined to `apps/api`. **That is incorrect and is explicitly rejected at Gate 1**: the bot worker is the process that actually connects to Discord, so it necessarily needs access to the plaintext credential at connection time — no architecture can make `apps/api` the only place plaintext ever exists while the worker still has to use it.

The corrected operational boundary:

```
Encrypted credential (ciphertext + nonce + keyVersion, at rest in MySQL, via apps/api)
  → authorized bot worker (ADR-0011 identity, scoped to the BotApplication it is actually hosting)
  → controlled decryption, performed in the worker process
  → plaintext exists only in that worker's memory, only as long as the live Discord connection needs it
  → Discord connection
```

Concretely:

- `apps/api` remains the only component that ever _writes_ ciphertext, owns authorization, owns key-version bookkeeping, validates new tokens against Discord's API, and emits the AuditEvent for every credential lifecycle transition. It does not, itself, need to produce the final plaintext bot token as a step it performs on the worker's behalf.
- A worker that needs to connect authenticates to `apps/api` with its own identity (ADR-0011) and requests the credential material for a `BotApplication` it is authorized to host. `apps/api` checks that authorization — the Tenant/Guild chain **and** the WorkerAssignment claim naming this specific worker for this specific `BotApplication` (ADR-0006, added at Gate 1 to close a gap security review found: worker identity alone establishes _who_ is asking, never _which_ `BotApplication`s it may touch) — before releasing anything.
- **The normal API request/response path never transports or exposes the plaintext bot token.** What the worker receives is the material needed to perform decryption itself (e.g., the ciphertext plus an unwrapped/short-lived-scoped DEK, or an equivalent least-privilege decryption capability) — the final AES-256-GCM decrypt into a plaintext token happens inside the worker process, immediately before constructing the discord.js `Client`, and the plaintext is never persisted, logged, or returned from that worker back to `apps/api`. **This internal decryption-material response (the unwrapped DEK and ciphertext) is functionally equivalent to the token for confidentiality purposes and is covered by the same no-logging discipline as the token itself** (`docs/SECURITY.md`, ADR-0011's "no credential logging") — it must never appear in request/response logging on this endpoint, named explicitly rather than left to a general "secrets" umbrella to cover by implication.
- **Least-privilege decryption capability:** a worker can only obtain decryption material for `BotApplication`s it is currently, actually authorized to host — never a blanket credential-store access grant. This bounds a compromised worker's blast radius to its own live connections (ADR-0005's Security Impact), not the whole credential store.
- **Key versioning:** BotCredential stores `keyVersion`; rotating the KEK re-wraps DEKs, not the token ciphertext itself — implementation deferred, schema concept reserved now.
- **Future KMS/HSM path:** this boundary is designed so a managed KMS/HSM can later perform the actual unwrap/decrypt operation under a scoped, audited grant issued to the worker, without changing this authorization shape.
- **Rotation/replacement/deletion**: each produces an AuditEvent (ADR-0006/0010).

## Credential rotation lifecycle `[LOCKED]`

CreatorCore does not maintain a historical vault of superseded bot tokens. Rotation proceeds as:

1. New credential received over authenticated HTTPS.
2. Authorization validated (caller is authorized for that Tenant/BotApplication).
3. The new Discord credential is validated live against Discord's API (failure stops here — see below).
4. Encrypted and stored as **PENDING** (the existing ACTIVE credential is untouched).
5. The appropriate worker is notified/reloaded — via the narrow push signal in ADR-0009 (a non-secret "credential version changed" event), never the credential itself.
6. The worker retrieves the PENDING credential material via the decryption boundary above and establishes a Discord connection with it.
7. On a successful connection, the PENDING credential is **atomically promoted to ACTIVE**.
8. The superseded encrypted credential is **deleted** — not archived, not kept as a rollback secret.
9. Only non-secret audit metadata (who rotated it, when, outcome) is retained in the AuditEvent.

**If validation (step 3) or worker activation (step 6) fails:** the new credential is never activated, the existing ACTIVE credential is retained and keeps serving, and the failure is reported safely (no token material, no stack trace containing secrets) to the caller and as an AuditEvent. The previous credential is never exposed as a "rollback secret" — it simply continues being the active one because promotion never happened.

**Gate 1 addition — the window between step 6 and step 7.** Security review correctly flagged that the original lifecycle only described failure _before_ a successful worker connection, not a failure _between_ the worker successfully connecting (step 6) and the promotion actually committing (step 7) — e.g. `apps/api` crashing in that gap. Rule: promotion-to-ACTIVE is the only state change that makes a credential "current" anywhere else in the system (including the WorkerAssignment claim and any cached status shown in the dashboard); until it commits, the database still authoritatively says the old credential is ACTIVE. If that gap is interrupted, recovery is **idempotent re-entry at step 6**, not a special case: `apps/api` (or a restarted instance of it) re-checks the PENDING credential's own recorded state (already Discord-validated in step 3) and, if a live worker connection using it is confirmed, retries the atomic promotion; if no such connection is confirmed, the PENDING credential is treated as not yet activated and the normal rotation flow continues or is retried from step 5. Step 8 (deleting the superseded credential) never runs until step 7 has actually committed, so there is no window where both the old and new credential are simultaneously absent.

**Gate 1 addition — concurrent rotation attempts.** At most one PENDING credential may exist per `BotApplication` at a time; a second rotation request while one is already PENDING is rejected (not queued, not silently overwritten) until the first resolves (promotes or fails). This is the uniqueness guard security review flagged as missing — without it, two concurrent rotations could race to promote, and whichever committed last would silently discard the other's validated credential.

## Alternatives Considered

- **Custom cipher/keying scheme** — explicitly rejected; this is exactly the "don't invent custom cryptography" case `docs/SECURITY.md` already anticipates.
- **KEK stored in a separate table in the same MySQL instance** — rejected: not a materially separate trust boundary from the encrypted data it protects; a full database compromise (including backups) would defeat it. This is the specific case `docs/SECURITY.md`'s existing `[LOCKED]` rule was written to prevent.
- **Node's built-in `crypto` module directly** — a legitimate alternative to `@noble/ciphers`; not chosen only because `@noble/ciphers` is already present via ADR-0003 and is designed with a smaller, more auditable API surface for exactly this use case. Either is acceptable; consistency (pick one) matters more than which.

## Consequences

Trust is now split across two components instead of concentrated in one: `apps/api` is the only process authorized to _release_ decryption material and the only writer of ciphertext; each authorized worker is where plaintext actually _materializes_, scoped to the `BotApplication`s it currently hosts. This is a deliberate least-privilege tradeoff, not a weakening — concentrating everything in `apps/api` alone would make it a single point of compromise for every customer's credentials simultaneously, whereas a compromised worker is bounded to what that worker currently hosts (ADR-0005). Both components still require the tightest hardening/monitoring priority of anything in the system when Gate 1 implementation begins.

## Security Impact — What Happens If:

- **Database is leaked (DB-only breach):** attacker gets ciphertext + nonces + key-version metadata only. Without the KEK (outside the DB) and without a worker's decryption grant, tokens remain protected. Still requires a precautionary forced rotation of all credentials — encryption reduces blast radius, it does not make the incident a non-event.
- **Application server (`apps/api`) is compromised:** an attacker with code execution there can authorize decryption releases as if it were any worker, and can read/write ciphertext and authorization state for every tenant — this remains the highest-value target in the system precisely because it is the authorization chokepoint, even though it no longer needs to hold plaintext locally. Mitigated by least-privilege process design, monitoring, and the KEK being held outside `apps/api`'s own database, not eliminated. No false guarantee is made here.
- **A worker is compromised:** an attacker with code execution there can obtain plaintext for, and impersonate, every `BotApplication` that worker is currently hosting — bounded to that worker's current connections, not the whole platform, because of the least-privilege decryption-capability scoping above. This is the direct, intended consequence of moving decryption to the worker, traded against not concentrating all plaintext access in one process; see `docs/THREAT_MODEL.md` for the full analysis.
- **KEK alone is compromised (no DB access):** attacker still needs the ciphertext to do anything — two separate compromises are required by design. Still requires immediate KEK rotation and DEK re-wrap on discovery.
- **Customer rotates their Discord token:** follows the rotation lifecycle above. The superseded encrypted credential is **deleted** after successful cutover (data minimization) — this is now the locked default, not an open question. Only non-secret audit metadata is retained.

## Revisit Conditions

Revisit the "env-var KEK" minimum-acceptable option the moment a managed KMS becomes available in the chosen hosting environment (ADR-0008) — the env-var approach is an accepted Phase 1 floor, not a long-term target.
