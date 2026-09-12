# CreatorCore — Architecture

**Status of this document:** Phase 0 engineering contract. Sections are explicitly tagged:

- `[LOCKED]` — decided, do not revisit without a deliberate discussion and a doc update.
- `[PROPOSED]` — a reasonable default, not yet evaluated against real requirements. Treat as a starting point for Phase 1 discussion, not as approved architecture.
- `[UNRESOLVED]` — genuinely undecided. Do not implement against an assumed answer.
- `[SECURITY-SENSITIVE — NEEDS REVIEW]` — requires explicit security review before implementation, regardless of how settled it looks.

No dashboard, bot runtime, database schema, or authentication system exists in this repository yet. Everything below describes intent and constraints for Phase 1+, not current implementation.

---

## 1. Product shape

CreatorCore is **one reusable platform + reusable modules + tenant/client configuration** — not a template that gets copied per client. A bug fixed in a shared module must be fixable centrally. Client-specific customization must not require a permanent fork of core code. `[LOCKED — product principle, not a specific technology]`

## 2. Domain concepts (naming only — no schema yet)

These are the entities the system will reason about. Naming them now avoids inconsistent vocabulary later; it does not imply a database schema, which is `[UNRESOLVED]`.

- **Tenant** — a customer/client of CreatorCore (an organization, streamer, or community operator).
- **Guild** — a Discord server connected to a tenant. A tenant may connect multiple guilds.
- **Bot application** — a customer-provided or CreatorCore-provisioned Discord application/bot the platform operates on a tenant's behalf.
- **Module** — an independently enable/disable-able feature (Stream Notifications, Welcome/Auto Roles, Auto Moderation, Giveaways, XP/Levels, Button/Reaction Roles, Announcements, Custom Branding, etc.), scoped per guild.

`[PROPOSED]` — exact relationship cardinality (e.g., can one guild belong to more than one tenant) is not yet decided.

## 3. Module boundary principle `[LOCKED — principle; not tied to a specific framework]`

- **Shared/core code** implements a feature once, generically, driven by configuration.
- **Tenant/client-specific behavior** (branding, enabled modules, custom copy, tenant-specific limits) lives in configuration data, not in forked copies of core logic.
- A module must not import another module's internals directly — only through its declared public interface.
- Shared packages must never contain hardcoded tenant IDs, guild IDs, customer names, or environment-specific values.

## 4. Tenant & guild isolation `[SECURITY-SENSITIVE — NEEDS REVIEW]`, principle `[LOCKED]`

Tenant isolation and guild isolation are security boundaries, not just data-modeling concerns. Every privileged read or write must be authorized server-side against the caller's actual tenant/guild membership — never inferred from a client-supplied ID alone. See `docs/DATABASE_RULES.md` and `docs/SECURITY.md` for the concrete query-shape rule and required regression tests.

## 5. Technology stack

### Locked

- **Database engine: MySQL 8.0+ with InnoDB, utf8mb4.** `[LOCKED]` — see `docs/DATABASE_RULES.md` for the full rule set. This is the only product-stack decision fixed at Phase 0.
- **Monorepo tooling: pnpm workspaces + Turborepo, TypeScript strict mode, ESLint + Prettier, Vitest, Playwright, GitHub Actions.** `[LOCKED — tooling/infrastructure layer only]`. This is the engineering-foundation layer scaffolded in Phase 0; it does not imply or constrain the product application stack below.
- **Workspace layout convention:** deployable applications live under `apps/*`; shared libraries live under `packages/*`. `[LOCKED — convention, not framework choice]`

### Unresolved — Phase 1 decisions, not to be assumed

- **ORM / database client** — `[UNRESOLVED]`. No ORM is installed. Candidates to evaluate in Phase 1 include Drizzle, Prisma, or a query-builder/raw-SQL approach; none is approved.
- **API framework** — `[UNRESOLVED]`. Candidates might include Hono, Express, Fastify, or a framework-integrated API layer; none is approved.
- **Dashboard framework** — `[UNRESOLVED]`. Candidates might include Next.js or another React-based framework; none is approved.
- **Authentication system** — `[UNRESOLVED]`, `[SECURITY-SENSITIVE — NEEDS REVIEW]`. Discord OAuth will be involved somewhere in the flow (dashboard users log in with Discord per the product direction), but session strategy, token storage, and library choice (e.g., a library like Better Auth vs. a hand-rolled OAuth flow) are undecided.
- **Discord bot runtime** — `[UNRESOLVED]`. Library (e.g., discord.js or an alternative), process model (single worker vs. sharded/horizontally scaled workers), and how customer-provided bot applications are hosted are all undecided. See `docs/DISCORD_RULES.md` for constraints that apply regardless of the eventual choice.
- **Billing/subscriptions** — `[UNRESOLVED]`. Not implemented in any form yet.
- **Hosting / deployment architecture** — `[UNRESOLVED]`.
- **Horizontal scaling strategy for bot workers** — `[UNRESOLVED]`.

## 6. Client source-code strategy `[PROPOSED]`

Some customers may eventually request source-code handover. To keep that possible without permanently forking the platform:

- Core/shared packages (`packages/*`) must remain free of any single client's configuration, branding, or bespoke logic.
- Client-specific behavior should be expressible as configuration + isolated extension points, not as edits to shared packages.
- Possible future distribution models (not implemented, not decided): (a) shipping a read-only export of a tenant's configuration + the shared core as a reference, (b) a licensed white-label deployment of the full platform, (c) no source handover at all, only a managed service. Which model(s) CreatorCore actually offers is a business decision, `[UNRESOLVED]`, that will shape how strictly this separation must be enforced technically.

## 7. Environments `[LOCKED — principle]`, specifics `[UNRESOLVED]`

Local, test, staging, and production must be clearly separated (see `docs/DEVELOPMENT.md`). Production credentials and production data must never be required for normal development or used in automated tests. Exact staging/production hosting is `[UNRESOLVED]`.

## 8. What Phase 0 explicitly does not include

No dashboard, no Discord bot code, no database schema or migrations, no authentication implementation, no production API routes, no billing integration, no ORM, no Discord client library. Phase 0 is documentation, tooling, and review-agent/skill infrastructure only.
