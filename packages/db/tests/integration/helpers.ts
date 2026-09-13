import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { loadDatabaseConfig } from "@creatorcore/config/database";
import { createDatabaseClient, type DatabaseClient } from "../../src/index.js";
import { tenants, users, workers } from "../../src/schema/index.js";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(fileURLToPath(import.meta.url), "../../../../../.env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

/**
 * Shared fixtures/cleanup for the Phase 3 real-MySQL security regression
 * suites (docs/TESTING.md). Test-internal only -- not exported from the
 * package's public entry point. Importing schema tables directly here
 * (rather than only repository functions) is a deliberate, scoped
 * exception for test cleanup within this same package, not a precedent for
 * business code outside packages/db (docs/DATABASE_RULES.md).
 */

export async function probeDatabase(): Promise<boolean> {
  try {
    const config = loadDatabaseConfig();
    const connection = await mysql.createConnection({
      uri: config.DATABASE_URL,
      connectTimeout: 2000,
    });
    await connection.end();
    return true;
  } catch {
    return false;
  }
}

export function createTestClient(): DatabaseClient {
  return createDatabaseClient(loadDatabaseConfig());
}

export function testId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

let snowflakeCounter = 0n;

/** A realistic, guaranteed-unique-within-this-process Discord-snowflake-shaped bigint. */
export function randomSnowflake(): bigint {
  snowflakeCounter += 1n;
  return BigInt(Date.now()) * 1_000_000n + snowflakeCounter;
}

/**
 * Deletes a tenant and everything cascading from it (guilds,
 * bot_applications, tenant_memberships, guild_bot_assignments,
 * worker_eligibility, worker_assignments -- see schema FK cascade
 * definitions). Does NOT touch audit_events (immutable by design) or
 * workers (shared platform infra, not tenant-owned -- clean up separately
 * via cleanupWorkers).
 */
export async function cleanupTenant(db: DatabaseClient["db"], tenantId: string): Promise<void> {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

export async function cleanupUser(db: DatabaseClient["db"], userId: bigint): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/** Safe to call only after any referencing tenant (and its cascaded rows) is already deleted. */
export async function cleanupWorker(db: DatabaseClient["db"], workerId: string): Promise<void> {
  await db.delete(workers).where(eq(workers.id, workerId));
}
