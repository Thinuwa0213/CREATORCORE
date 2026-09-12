# ADR-0008 — Deployment / Runtime Model

**Status:** LOCKED (approved 2026-09-12, Gate 1)

## Context

Three application units now exist conceptually (ADR-0002). Deployment must keep a dashboard failure from affecting live bot connections, must not introduce infrastructure (queues, orchestration) ahead of demonstrated need, and must respect the already-locked environment-separation rules (`docs/DEVELOPMENT.md`).

## Decision

Four deployable units for Phase 1:

- **`creatorcore-web`** (Next.js, ADR-0001) — stateless request/response, standard rolling deploys.
- **`creatorcore-api`** (Hono, ADR-0002) — stateless request/response, standard rolling deploys, sole holder of the credential-encryption KEK (ADR-0007).
- **`creatorcore-worker`** (discord.js, ADR-0005) — long-running; deploys via rolling/blue-green so a new instance establishes gateway connections before the old one is torn down. **No public/internet-facing inbound port.** It does accept one narrow, internal-network-only inbound listener for ADR-0009's urgent push callback (`CredentialRotated`/`TenantDisabled` signals) — reachable only from `creatorcore-api`'s network, authenticated per ADR-0011's inbound direction, never exposed through the public load balancer/reverse proxy. Gate 1 review flagged the original "no inbound port, only outbound" wording as contradicting ADR-0009's requirement that the worker expose a callback — this is the correction: "no public inbound port" was always the intent, not "no inbound listener of any kind."
- **MySQL 8.0+** — managed service or a single well-backed-up instance; specific provider `[UNRESOLVED]`, does not block this architecture.

**No queue, cache, or object storage in Phase 1** — not justified yet (see ADR-0009). Each unit runs under ordinary process supervision (a container platform's restart policy, systemd, or a PaaS's built-in supervision); specific choice `[UNRESOLVED]`. **No Kubernetes** at this scale.

**`creatorcore-worker` runs more than one replica from day one `[LOCKED — Gate 1 addition]`:** ADR-0005 and `docs/THREAT_MODEL.md` both cite this requirement as living here; the original text only described blue-green deploy mechanics and omitted it — corrected now. A `BotApplication`'s live Discord connection is held by exactly one worker replica at a time, tracked via the WorkerAssignment claim (ADR-0006, added at Gate 1). Running more than one replica means a crashed replica's `BotApplication`s can be re-claimed and reconnected by a surviving replica rather than staying down until that one process restarts — this is what makes ADR-0005's single-worker-process-holds-N-clients model survivable rather than a single point of failure for every customer simultaneously. The exact claim-handoff mechanism (lease/heartbeat/timeout) is an implementation detail, not decided here; the requirement that it exist is locked.

HTTPS terminates at a reverse proxy/load balancer in front of `creatorcore-web` and `creatorcore-api` only — `creatorcore-worker` needs no public inbound port at all, which shrinks its attack surface by construction, not by configuration discipline.

**Environments:** local (docker-compose MySQL + all three apps against a local `.env`), test (CI spins up a real MySQL 8.0 service container, per `docs/DATABASE_RULES.md` — never SQLite), staging (separately deployed copies of all units + separate MySQL + a dedicated "test" Discord bot application, never a production token), production. No credential or data sharing across these (`docs/DEVELOPMENT.md`, already `[LOCKED]`).

**Backups:** automated MySQL backups (frequency/retention `[UNRESOLVED]`, provider-dependent), and backups themselves must be encrypted at rest and access-controlled — a leaked backup is treated as equivalent to a leaked live database.

## Alternatives Considered

- **Single combined deploy unit for web+api** — rejected per ADR-0002's boundary reasoning (would reintroduce the coupling that decision exists to avoid).
- **Kubernetes/full orchestration from day one** — explicitly rejected; not justified at current or near-term scale, and directly contradicts the stated "do not create unnecessary distributed systems" priority.
- **Serverless functions for `apps/api`** — considered; rejected for Phase 1 because `creatorcore-worker`'s long-running nature already requires a persistent-process deployment target, so a second, different deployment model for `apps/api` adds operational variety without a clear benefit. Worth reconsidering only if a specific hosting cost/scaling reason emerges later.

## Consequences

Reliability priority ("a dashboard failure should not unnecessarily terminate running Discord bots") is satisfied **by construction of the process boundary**, not by deploy-mechanics discipline alone: `creatorcore-web`/`creatorcore-api` restarts never touch `creatorcore-worker`'s live gateway connections because they are, and always were, separate processes.

## Security Impact

`creatorcore-worker` having no public inbound port removes an entire class of external attack surface from the component that holds live (if short-lived, per ADR-0007) plaintext bot tokens in memory. The KEK (ADR-0007) must be provisioned only to `creatorcore-api`'s runtime environment — a deployment-configuration requirement, not just a code-level one; this must be explicitly verified during Gate 1 implementation, not assumed from the architecture diagram alone.

## Revisit Conditions

Revisit "no queue/cache" if `creatorcore-worker` fleet size or config-change volume outgrows the polling/callback model in ADR-0009. Revisit "no Kubernetes" only when process-supervision/scaling needs genuinely outgrow what a simple restart-policy-based platform provides — not preemptively.
