export { loadConfig } from "./env.js";
export { ConfigValidationError } from "./errors.js";

// databaseConfigSchema/loadDatabaseConfig AND apiConfigSchema/loadApiConfig
// are deliberately NOT re-exported here — see package.json's "exports"
// field and README.md. apiConfigSchema `.extend()`s databaseConfigSchema's
// shape, so it carries DATABASE_URL too; re-exporting it from this bare
// entry would reopen the exact leak the /database subpath split exists to
// close, since apps/web and apps/worker already legitimately depend on
// this package for their own (non-DB) config. Only apps/api imports
// @creatorcore/config/api; only apps/api (via that) and
// @creatorcore/config/database itself ever read DATABASE_URL.
export type { DatabaseConfig } from "./database.js";
export type { ApiConfig } from "./api.js";

export { workerConfigSchema, loadWorkerConfig } from "./worker.js";
export type { WorkerConfig } from "./worker.js";

export { webConfigSchema, loadWebConfig } from "./web.js";
export type { WebConfig } from "./web.js";

// webServerConfigSchema/loadWebServerConfig hold apps/web's server-only
// values (e.g. API_INTERNAL_URL) — safe to import from the bare entry point
// since they carry no secret, but never import this from a "use client"
// component (see web-server.ts's header comment).
export { webServerConfigSchema, loadWebServerConfig } from "./web-server.js";
export type { WebServerConfig } from "./web-server.js";
