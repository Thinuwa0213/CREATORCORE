# CreatorCore — Discord Integration Rules

**Status:** Phase 0 rules remain in force; Gate 1 (2026-09-12) locked the runtime/library these rules constrain — discord.js, one worker process hosting multiple bot `Client`s for Phase 1 (`docs/adr/0005-discord-runtime.md`, `LOCKED`). No Discord bot runtime exists in code yet.

## Never `[LOCKED]`

- **Never automate a normal Discord user account.** CreatorCore operates through bot applications only — no self-botting, no user-token automation, regardless of how convenient it would be for a feature.
- **Never expose a bot token to browser/client code**, in any form — not in an API response, not in a config object serialized to the client, not in a source map.
- **Never return a stored bot token through a normal API response.** If a UI needs to confirm a bot is connected, return a boolean/status/last-rotated-timestamp — never the token itself, even partially, even to an authenticated admin, without a specific, reviewed, break-glass reason.
- **Never log a bot token**, in application logs, error messages, or crash reports.
- **Never commit a production secret to git**, including in example/test fixtures.
- **Never trust a guild ID merely because the browser supplied it.** A request claiming "act on guild X" must be checked server-side against the caller's actual, current authorization for guild X — not merely accepted because the UI only shows guilds the user should see.
- **Never assume a Discord login means the user is authorized to manage every guild they belong to.** Discord OAuth proves identity; it says nothing about what the user is allowed to configure in CreatorCore for a given guild. Authorization is a separate, server-side check against real Discord permissions (or CreatorCore's own tenant/guild membership records) on every privileged action.

## Least-privilege Gateway Intents & permissions `[LOCKED, Gate 1 — `docs/adr/0005-discord-runtime.md`]`

- CreatorCore requests only the Gateway Intents and Discord permissions that a tenant's currently-enabled modules (`FeatureConfiguration`) actually require. **Never enable a privileged intent "for convenience"** (e.g., the message-content or presence intents) when no enabled module genuinely needs it.
- A future **module registry** must declare, per module, exactly which Gateway Intents and Discord permissions it requires. This makes the requirement explicit and checkable rather than hidden inside a module's implementation — a module that silently starts needing a new intent is an architecture-review finding, not a detail to discover in production.
- This applies per-bot-application: if a `BotApplication` hosts guilds with different enabled modules, its intent/permission set reflects the union actually needed by what's enabled for it — not the maximum CreatorCore could ever request.

## Bot credential handling `[SECURITY-SENSITIVE — NEEDS REVIEW]`, design `[LOCKED, Gate 1]`, implementation not yet written

Bot credentials use envelope encryption at rest (AES-256-GCM), with key rotation and a KEK that is **not stored alongside the encrypted token in the same database** (`docs/adr/0007-credential-encryption.md`, `LOCKED WITH AMENDMENT`; `docs/SECURITY.md`).

**Decryption boundary (corrected at Gate 1):** plaintext decryption is not confined to `apps/api`. The bot worker that actually connects to Discord performs the decryption itself, under a least-privilege capability scoped to the `BotApplication`s it is currently authorized to host — plaintext exists only in that worker's memory, only as long as the live connection needs it. The normal API request/response path never transports or exposes the plaintext token.

**Rotation:** new credential validated live against Discord's API → stored encrypted as PENDING → worker notified via a non-secret signal only (never the credential itself, see `docs/adr/0009-internal-communication.md`) → worker connects successfully → atomic promotion to ACTIVE → superseded ciphertext deleted (no historical token vault; non-secret audit metadata only). A failed validation or failed worker activation leaves the existing ACTIVE credential in place and reports the failure safely — the old credential is never exposed as a "rollback secret."

None of this is implemented in code yet — the design above is locked; building it is a later gate.

## Permission verification `[SECURITY-SENSITIVE — NEEDS REVIEW]`

Before any guild-scoped privileged action (changing settings, triggering a moderation action, posting an announcement, etc.), the system must verify, server-side and against current state:

1. The caller has an active, valid session.
2. The caller is authorized within CreatorCore for the specific tenant/guild in question (`docs/DATABASE_RULES.md`'s tenant/guild-scoped query rule applies here too). Per `docs/adr/0003-authentication-sessions.md`, read-only views may rely on this for at most 5 minutes; destructive/credential/ownership/security-sensitive actions re-verify synchronously, every time.
3. Where relevant, the bot itself actually has the required Discord permission in that guild — a feature must fail safely and legibly if the bot's Discord permissions were revoked, not silently no-op or crash with an internal error exposed to the user.

## Customer-provided bot applications

CreatorCore's product direction includes customers connecting their own Discord bot applications. Whatever onboarding flow Phase 1 designs must still satisfy every rule above — a customer-provided token is not exempt from encryption-at-rest, non-exposure, or permission-verification requirements.

## What does not exist yet

No Discord client library is installed. No bot process exists. No OAuth flow is implemented, no module registry exists. Gate 1 (2026-09-12) locked the design these rules describe (`docs/adr/`); this document exists so that when implementation starts, it starts inside these constraints rather than retrofitting them.
