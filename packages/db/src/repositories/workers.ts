import { eq } from "drizzle-orm";
import { workers } from "../schema/index.js";
import { generateSecret, hashSecret, verifySecret } from "../lib/secret-hash.js";
import type { Db } from "../types.js";

export interface Worker {
  id: string;
  status: "ACTIVE" | "REVOKED";
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Identity lookup, not tenant-scoped -- Worker is not owned by a tenant
 * (the worker fleet is shared platform infrastructure, docs/adr/0005), so
 * this is the same root-lookup exception as findTenantById. Never selects
 * bootstrapSecretHash/bootstrapSecretSalt -- callers that need to verify a
 * secret use verifyWorkerBootstrapSecret below, which never returns the
 * hash to its caller either.
 */
export async function findWorkerById(db: Db, workerId: string): Promise<Worker | undefined> {
  const [row] = await db
    .select({
      id: workers.id,
      status: workers.status,
      lastSeenAt: workers.lastSeenAt,
      createdAt: workers.createdAt,
      updatedAt: workers.updatedAt,
    })
    .from(workers)
    .where(eq(workers.id, workerId))
    .limit(1);
  return row;
}

/**
 * Provisions a new worker identity: generates a high-entropy bootstrap
 * secret, hashes it (never stores plaintext), inserts the row, and returns
 * the plaintext secret exactly once -- the caller (an ops seed script or a
 * test fixture) is responsible for delivering it to the worker out-of-band.
 * No HTTP route exposes this in Phase 3 -- there is no authenticated
 * admin/operator flow yet to gate it behind.
 */
export async function provisionWorker(
  db: Db,
  workerId: string,
): Promise<{ worker: Worker; bootstrapSecret: string }> {
  const bootstrapSecret = generateSecret();
  const { hash, salt } = await hashSecret(bootstrapSecret);
  await db.insert(workers).values({
    id: workerId,
    bootstrapSecretHash: hash,
    bootstrapSecretSalt: salt,
  });
  const worker = await findWorkerById(db, workerId);
  if (!worker) {
    throw new Error("provisionWorker: row not found immediately after insert");
  }
  return { worker, bootstrapSecret };
}

/**
 * Verifies a presented bootstrap secret against the stored hash. Returns
 * false for both "unknown worker" and "wrong secret" -- indistinguishable
 * to the caller, avoiding a worker-enumeration oracle. Never returns the
 * stored hash/salt.
 */
export async function verifyWorkerBootstrapSecret(
  db: Db,
  workerId: string,
  presentedSecret: string,
): Promise<boolean> {
  const [row] = await db
    .select({
      bootstrapSecretHash: workers.bootstrapSecretHash,
      bootstrapSecretSalt: workers.bootstrapSecretSalt,
    })
    .from(workers)
    .where(eq(workers.id, workerId))
    .limit(1);
  if (!row) {
    return false;
  }
  return verifySecret(presentedSecret, row.bootstrapSecretHash, row.bootstrapSecretSalt);
}

export async function recordWorkerSeen(db: Db, workerId: string): Promise<void> {
  await db.update(workers).set({ lastSeenAt: new Date() }).where(eq(workers.id, workerId));
}

export async function revokeWorker(db: Db, workerId: string): Promise<void> {
  await db.update(workers).set({ status: "REVOKED" }).where(eq(workers.id, workerId));
}
