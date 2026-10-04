export { createDatabaseClient } from "./client.js";
export type { DatabaseClient } from "./client.js";
export { checkDatabaseConnectivity } from "./readiness.js";

// Repository functions only -- raw Drizzle table objects (packages/db/src/schema/)
// are never exported from this package's public entry point
// (docs/DATABASE_RULES.md, docs/adr/0004). Every tenant/guild/worker-scoped
// table is reachable only through the functions below, each requiring its
// authorizing scope ID(s) as a parameter.

export {
  findTenantById,
  createTenant,
  disableTenant,
  assertTenantActive,
  TenantNotActiveError,
  findTenantMembership,
  createTenantMembership,
} from "./repositories/tenants.js";
export type { Tenant, TenantMembership } from "./repositories/tenants.js";

export { findUserById, createUser } from "./repositories/users.js";
export type { User } from "./repositories/users.js";

export { findGuildByTenantAndId, listGuildsByTenant, createGuild } from "./repositories/guilds.js";
export type { Guild } from "./repositories/guilds.js";

export {
  connectGuildForUser,
  listConnectedGuildIdsForUser,
  listConnectedGuildsForUser,
} from "./repositories/guild-connections.js";
export type {
  ConnectGuildResult,
  ConnectedGuildDetails,
} from "./repositories/guild-connections.js";

// Shared driver-error introspection, not a schema/query access point --
// reused by apps/api's own service layer (bot-onboarding-service.ts) to
// interpret a transaction failure without reimplementing mysql2/Drizzle
// error-unwrapping a second time.
export { isDuplicateKeyError } from "./lib/duplicate-key-error.js";

export {
  recordRuntimeStatus,
  findRuntimeStatusForTenantBotApplication,
} from "./repositories/bot-runtime-status.js";
export type {
  RuntimeState,
  RecordRuntimeStatusInput,
  RuntimeStatusRow,
} from "./repositories/bot-runtime-status.js";

export {
  findBotApplicationByTenantAndId,
  createBotApplication,
  createBotApplicationPendingEligibility,
} from "./repositories/bot-applications.js";
export type { BotApplication } from "./repositories/bot-applications.js";

export {
  resolveBotApplicationForGuild,
  reassignBotForGuild,
  listGuildsForBotApplication,
} from "./repositories/guild-bot-assignments.js";
export type { ResolvedGuildBotAssignment } from "./repositories/guild-bot-assignments.js";

export {
  findWorkerById,
  provisionWorker,
  verifyWorkerBootstrapSecret,
  recordWorkerSeen,
  revokeWorker,
} from "./repositories/workers.js";
export type { Worker } from "./repositories/workers.js";

export {
  isWorkerEligible,
  listClaimableWorkForWorker,
  assignEligibleWorkers,
} from "./repositories/worker-eligibility.js";
export type { ClaimableWorkItem } from "./repositories/worker-eligibility.js";
// assignEligibleWorkers takes no worker-identity parameter at all -- it
// deterministically selects up to 2 least-loaded ACTIVE workers itself, so
// exporting it cannot be used to grant eligibility to an arbitrary worker.
// It remains an automatic side effect of createBotApplication for every
// existing caller; it is exported additionally so Phase 5's bot onboarding
// orchestrator (apps/api) can call it explicitly, as the last step inside
// its own transaction, only after a credential and guild attachment are
// already staged -- see createBotApplicationPendingEligibility above.

export {
  claimAssignment,
  renewAssignment,
  releaseAssignment,
  findAssignment,
  listActiveAssignmentsForWorker,
  DEFAULT_LEASE_DURATION_MS,
} from "./repositories/worker-assignments.js";
export type {
  WorkerAssignment,
  ClaimResult,
  ClaimFailureReason,
} from "./repositories/worker-assignments.js";

export { recordAuditEvent } from "./repositories/audit-events.js";
export type { RecordAuditEventInput } from "./repositories/audit-events.js";

export {
  createInitialActiveCredential,
  createPendingCredential,
  getActiveCredentialForAssignedWorker,
  getPendingCredentialForAssignedWorker,
  promotePendingCredential,
  rejectPendingCredential,
  findActiveCredential,
  findCredentialStatusForTenantBotApplication,
} from "./repositories/bot-credentials.js";
export type {
  BotCredentialRow,
  CreateCredentialInput,
  CredentialStatusSummary,
} from "./repositories/bot-credentials.js";

export {
  upsertDiscordOauthCredential,
  findDiscordOauthCredential,
  replaceDiscordOauthCredentialIfUnchanged,
} from "./repositories/discord-oauth-credentials.js";
export type {
  DiscordOauthCredentialRow,
  DiscordOauthCredentialInput,
} from "./repositories/discord-oauth-credentials.js";

export {
  findDiscordAccountIdByBetterAuthUserId,
  findAuthUserName,
  createTestUserSession,
} from "./repositories/auth-accounts.js";

export {
  findSubscriptionByTenant,
  upsertSubscriptionForTenant,
} from "./repositories/subscriptions.js";
export type {
  TenantSubscription,
  SubscriptionPlan,
  SubscriptionStatus,
  UpsertSubscriptionInput,
} from "./repositories/subscriptions.js";

// Better Auth's own Drizzle table objects (Phase 5, docs/adr/0003) ARE
// exported here, unlike every CreatorCore-domain table above -- they are
// Better Auth's own infrastructure schema, handed directly to its Drizzle
// adapter config in apps/api, not accessed through a CreatorCore repository
// function. Never queried directly by CreatorCore authorization code: every
// authorization decision still goes through the repository functions above,
// keyed by CreatorCore's own users.id.
export { authUsers, authSessions, authAccounts, authVerifications } from "./schema/index.js";
