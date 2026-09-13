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
  findBotApplicationByTenantAndId,
  createBotApplication,
} from "./repositories/bot-applications.js";
export type { BotApplication } from "./repositories/bot-applications.js";

export {
  resolveBotApplicationForGuild,
  reassignBotForGuild,
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

export { isWorkerEligible, listClaimableWorkForWorker } from "./repositories/worker-eligibility.js";
export type { ClaimableWorkItem } from "./repositories/worker-eligibility.js";
// assignEligibleWorkers is deliberately NOT exported -- it is an internal
// side effect of createBotApplication, never a standalone callable that
// business code outside this package could invoke with an arbitrary
// (workerId, botApplicationId) pair.

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
} from "./repositories/bot-credentials.js";
export type {
  BotCredentialRow,
  CreateCredentialInput,
} from "./repositories/bot-credentials.js";


