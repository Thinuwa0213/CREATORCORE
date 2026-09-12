export { loadConfig } from "./env.js";
export { ConfigValidationError } from "./errors.js";

// databaseConfigSchema/loadDatabaseConfig are deliberately NOT re-exported
// here — see package.json's "exports" field and README.md. Only
// apps/api (via its own composed ApiConfig) and @creatorcore/config/database
// itself can read database credentials; importing the bare
// "@creatorcore/config" specifier must never be a path to DB_* values,
// since apps/web and apps/worker already legitimately depend on this
// package for their own (non-DB) config.
export type { DatabaseConfig } from "./database.js";

export { apiConfigSchema, loadApiConfig } from "./api.js";
export type { ApiConfig } from "./api.js";

export { workerConfigSchema, loadWorkerConfig } from "./worker.js";
export type { WorkerConfig } from "./worker.js";

export { webConfigSchema, loadWebConfig } from "./web.js";
export type { WebConfig } from "./web.js";
