/**
 * No CreatorCore product schema exists yet. docs/adr/0006-multi-tenant-model.md
 * locks the *conceptual* entity model (User, Tenant, TenantMembership, Guild,
 * BotApplication, GuildBotAssignment, BotCredential, GuildConfiguration,
 * FeatureConfiguration, AuditEvent, WorkerAssignment) but explicitly does
 * NOT approve a physical MySQL schema — that is a separate, later decision
 * (tracked as Phase 3 work, see README.md).
 *
 * This file exists so drizzle-kit has a schema entry point to point at. It
 * intentionally defines zero tables. Do not add placeholder/example/test
 * tables here to make migration tooling "look" used — an empty schema with
 * zero generated migrations is the honest Phase 2 state.
 */
export {};
