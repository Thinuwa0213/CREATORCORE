# CreatorCore — Discord Integration Rules

**Status:** Phase 0 engineering contract. No Discord bot runtime exists yet — these rules constrain whatever runtime/library Phase 1 selects (`[UNRESOLVED]` in `docs/ARCHITECTURE.md`).

## Never `[LOCKED]`

- **Never automate a normal Discord user account.** CreatorCore operates through bot applications only — no self-botting, no user-token automation, regardless of how convenient it would be for a feature.
- **Never expose a bot token to browser/client code**, in any form — not in an API response, not in a config object serialized to the client, not in a source map.
- **Never return a stored bot token through a normal API response.** If a UI needs to confirm a bot is connected, return a boolean/status/last-rotated-timestamp — never the token itself, even partially, even to an authenticated admin, without a specific, reviewed, break-glass reason.
- **Never log a bot token**, in application logs, error messages, or crash reports.
- **Never commit a production secret to git**, including in example/test fixtures.
- **Never trust a guild ID merely because the browser supplied it.** A request claiming "act on guild X" must be checked server-side against the caller's actual, current authorization for guild X — not merely accepted because the UI only shows guilds the user should see.
- **Never assume a Discord login means the user is authorized to manage every guild they belong to.** Discord OAuth proves identity; it says nothing about what the user is allowed to configure in CreatorCore for a given guild. Authorization is a separate, server-side check against real Discord permissions (or CreatorCore's own tenant/guild membership records) on every privileged action.

## Bot credential handling `[SECURITY-SENSITIVE — NEEDS REVIEW]`, implementation `[UNRESOLVED]`

Bot credentials must eventually support:

- **Encryption at rest.**
- **Key rotation.**
- An encryption key that is **not stored alongside the encrypted token in the same database** (see `docs/SECURITY.md`).

None of this is implemented in Phase 0. The constraint is locked; the implementation (KMS, envelope encryption, etc.) is a Phase 1 decision.

## Permission verification `[SECURITY-SENSITIVE — NEEDS REVIEW]`

Before any guild-scoped privileged action (changing settings, triggering a moderation action, posting an announcement, etc.), the system must verify, server-side and against current state:

1. The caller has an active, valid session.
2. The caller is authorized within CreatorCore for the specific tenant/guild in question (`docs/DATABASE_RULES.md`'s tenant/guild-scoped query rule applies here too).
3. Where relevant, the bot itself actually has the required Discord permission in that guild — a feature must fail safely and legibly if the bot's Discord permissions were revoked, not silently no-op or crash with an internal error exposed to the user.

## Customer-provided bot applications

CreatorCore's product direction includes customers connecting their own Discord bot applications. Whatever onboarding flow Phase 1 designs must still satisfy every rule above — a customer-provided token is not exempt from encryption-at-rest, non-exposure, or permission-verification requirements.

## What Phase 0 does not include

No Discord client library is installed. No bot process exists. No OAuth flow is implemented. This document exists so that when that work starts, it starts inside these constraints rather than retrofitting them.
