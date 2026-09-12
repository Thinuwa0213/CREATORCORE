# ADR-0005 — Discord Runtime Architecture

**Status:** LOCKED (approved 2026-09-12, Gate 1)

## Context

Customers connect their own Discord bot application/token. CreatorCore must run potentially many distinct bot identities, isolate them from each other, support reconnects/graceful shutdown/token rotation, and have a credible path to scale without prematurely building distributed infrastructure for a customer count CreatorCore doesn't have yet.

## Decision

**discord.js (current v14.27.x)**, running as **one worker process managing multiple `Client` instances — one per connected customer bot application** — for Phase 1. Not one-process-per-customer.

- Isolation between customers is enforced **at the code level**: each `Client`'s command/event handlers always resolve their tenant/guild/bot-application context from that specific `Client`'s own configuration, never from shared state.
- **The `workerId`/claim concept is implemented now, not merely reserved** — corrected at Gate 1 second-round review, where the original "reserved now, not implemented now" framing was found to contradict ADR-0008's requirement to run ≥2 worker replicas from day one (a requirement that cannot be met safely without a live claim mechanism deciding which replica owns which `BotApplication` right now). The `WorkerAssignment` entity (ADR-0006) and its `apps/api`-side authorization (who may hold a claim, checked independently of worker self-assertion) are Phase 1, Gate 1 requirements — they gate the 2-replica high-availability baseline, not a future capacity migration. What remains genuinely deferred, and is the actual "later" migration this bullet originally meant, is scaling _beyond_ that HA baseline to many more worker processes purely for connection-count capacity — that's a claim-handoff _scheduling/rebalancing_ concern (which replica should hold which claim as the fleet grows), not a new authorization mechanism, since the mechanism itself already exists.
- **Reconnect/graceful shutdown**: standard discord.js lifecycle — `client.destroy()` on shutdown, listening for disconnect/invalidated/error events to reconnect or alert.
- **Token rotation**: destroy the old `Client` instance for that `BotApplication` and construct a new one with the newly decrypted token (via ADR-0007's lifecycle) — no bespoke reconnection protocol.
- **Graceful deploys**: a new worker instance establishes its gateway connections before the old one is torn down (rolling/blue-green), so deploys don't require dropping all live connections simultaneously.
- **Least-privilege Gateway Intents `[LOCKED — Gate 1 addition]`:** each `Client` is constructed with only the Gateway Intents and Discord permissions its tenant's currently-enabled `FeatureConfiguration` modules actually require — never a blanket "enable everything for convenience" intent set, and never a privileged intent (e.g., the message-content or presence intents) merely because it might be useful later. A future module registry must declare, per module, exactly which intents and permissions it needs, so this is enforced structurally rather than left to each module author's discretion — see `docs/DISCORD_RULES.md`.

## Alternatives Considered

- **One process per customer** — cleanest isolation, but massive OS-process-management overhead for a customer count CreatorCore is nowhere near yet; violates the "do not prematurely build infrastructure for thousands of bots" priority.
- **`@discordjs/core` + `@discordjs/rest` (low-level, no caching/sharding conveniences)** — more control, but more code to hand-write for functionality discord.js already provides well; premature optimization for Phase 1.
- **Worker groups with an orchestrator (Kubernetes-style) from day one** — explicitly rejected per the stated Phase 1 rule against building orchestration infrastructure before it's demonstrated to be needed.

## Consequences

A compromised or crashed worker process affects every `BotApplication` it currently hosts — a shared-fate blast radius across customers within one worker. This is a deliberate, documented Phase 1 tradeoff, not an oversight; it is what makes graceful reconnect/shutdown behavior (above) and running more than one worker replica from day one (ADR-0008) load-bearing requirements rather than nice-to-haves.

## Security Impact

A compromised worker can act as any bot it currently holds a live connection for until detected and those specific credentials are rotated (ADR-0007) — the worker decrypts its own credentials locally under a least-privilege capability scoped to the `BotApplication`s it is authorized to host (ADR-0007 amendment), limiting (not eliminating) this blast radius to that worker's current connections, not the whole fleet's. Minimizing Gateway Intents/permissions per the rule above further shrinks what a compromised worker's live connections can actually do even while they remain live. One worker hosting multiple customers' bots is a deliberate shared-fate tradeoff (see Consequences) — it is explicitly challenged in `docs/THREAT_MODEL.md`'s Gate 1 review, not assumed safe by default.

## Revisit Conditions

**Numeric trigger, not "later":** revisit the single-worker model before onboarding significantly more concurrent bot connections than a single worker process can comfortably hold in memory/event-loop capacity for its target hardware (establish and record the actual measured number during Gate 1 implementation — e.g., via load testing — rather than guessing one now), or sooner if any single worker crash is observed to have affected multiple unrelated customers in a way that caused a real incident.
