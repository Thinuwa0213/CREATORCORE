/**
 * Physical MySQL schema v1 (Phase 3). docs/adr/0006-multi-tenant-model.md
 * locks the conceptual entity model; this barrel is the first physical
 * implementation of it. GuildConfiguration/FeatureConfiguration (also named
 * in ADR-0006) are deliberately still absent -- no product/module
 * configuration exists yet, out of Phase 3 scope.
 */
export * from "./users.js";
export * from "./tenants.js";
export * from "./tenant-memberships.js";
export * from "./guilds.js";
export * from "./bot-applications.js";
export * from "./guild-bot-assignments.js";
export * from "./workers.js";
export * from "./worker-eligibility.js";
export * from "./worker-assignments.js";
export * from "./audit-events.js";
export * from "./bot-credentials.js";
export * from "./auth.js";
export * from "./discord-oauth-credentials.js";
export * from "./bot-runtime-status.js";
export * from "./subscriptions.js";
export * from "./media-assets.js";
