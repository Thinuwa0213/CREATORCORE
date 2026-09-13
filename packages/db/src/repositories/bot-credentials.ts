import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  botApplications,
  botCredentials,
  tenants,
  workerAssignments,
  workers,
} from "../schema/index.js";
import type { Db } from "../types.js";

export interface BotCredentialRow {
  id: string;
  botApplicationId: string;
  status: "PENDING" | "ACTIVE" | "SUPERSEDED";
  keyVersion: number;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  supersededAt: Date | null;
}

export interface CreateCredentialInput {
  id?: string;
  botApplicationId: string;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

/**
 * Creates the initial active credential for a newly provisioned BotApplication.
 * For initial setup / testing when no prior credential exists.
 */
export async function createInitialActiveCredential(
  db: Db,
  input: CreateCredentialInput,
): Promise<BotCredentialRow> {
  const id = input.id ?? randomUUID();
  await db.insert(botCredentials).values({
    id,
    botApplicationId: input.botApplicationId,
    status: "ACTIVE",
    keyVersion: input.keyVersion,
    ciphertext: input.ciphertext,
    nonce: input.nonce,
    authTag: input.authTag,
    createdAt: sql`now()`,
    activatedAt: sql`now()`,
  });

  const [row] = await db
    .select()
    .from(botCredentials)
    .where(eq(botCredentials.id, id))
    .limit(1);

  if (!row) {
    throw new Error("createInitialActiveCredential: row not found after insert");
  }

  return row as BotCredentialRow;
}

/**
 * Persists a PENDING credential candidate for rotation.
 *
 * Enforces the uniqueness invariant from ADR-0007 Gate 1 addition:
 * At most one PENDING credential may exist per BotApplication at a time.
 * If one is already in flight, rejects with PENDING_CREDENTIAL_ALREADY_EXISTS.
 */
export async function createPendingCredential(
  db: Db,
  input: CreateCredentialInput,
): Promise<
  | { ok: true; credential: BotCredentialRow }
  | { ok: false; reason: "PENDING_CREDENTIAL_ALREADY_EXISTS" }
> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: botCredentials.id })
      .from(botCredentials)
      .where(
        and(
          eq(botCredentials.botApplicationId, input.botApplicationId),
          eq(botCredentials.status, "PENDING"),
        ),
      )
      .for("update");

    if (existing) {
      return { ok: false, reason: "PENDING_CREDENTIAL_ALREADY_EXISTS" };
    }

    const id = input.id ?? randomUUID();
    await tx.insert(botCredentials).values({
      id,
      botApplicationId: input.botApplicationId,
      status: "PENDING",
      keyVersion: input.keyVersion,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      authTag: input.authTag,
      createdAt: sql`now()`,
    });

    const [row] = await tx
      .select()
      .from(botCredentials)
      .where(eq(botCredentials.id, id))
      .limit(1);

    if (!row) {
      throw new Error("createPendingCredential: row not found after insert");
    }

    return { ok: true, credential: row as BotCredentialRow };
  });
}

/**
 * Authoritative worker credential retrieval for the currently active credential.
 *
 * Checks all security invariants in a single database query:
 * 1. Worker is ACTIVE
 * 2. Worker owns an ACTIVE WorkerAssignment for this botApplicationId
 * 3. Worker assignment lease is live (lease_expires_at > NOW() authoritative DB clock)
 * 4. Tenant is ACTIVE
 * 5. Credential is ACTIVE and belongs to this botApplicationId
 */
export async function getActiveCredentialForAssignedWorker(
  db: Db,
  workerId: string,
  botApplicationId: string,
): Promise<BotCredentialRow | undefined> {
  const [row] = await db
    .select({
      id: botCredentials.id,
      botApplicationId: botCredentials.botApplicationId,
      status: botCredentials.status,
      keyVersion: botCredentials.keyVersion,
      ciphertext: botCredentials.ciphertext,
      nonce: botCredentials.nonce,
      authTag: botCredentials.authTag,
      createdAt: botCredentials.createdAt,
      updatedAt: botCredentials.updatedAt,
      activatedAt: botCredentials.activatedAt,
      supersededAt: botCredentials.supersededAt,
    })
    .from(botCredentials)
    .innerJoin(botApplications, eq(botApplications.id, botCredentials.botApplicationId))
    .innerJoin(tenants, eq(tenants.id, botApplications.tenantId))
    .innerJoin(
      workerAssignments,
      eq(workerAssignments.botApplicationId, botCredentials.botApplicationId),
    )
    .innerJoin(workers, eq(workers.id, workerAssignments.workerId))
    .where(
      and(
        eq(botCredentials.botApplicationId, botApplicationId),
        eq(botCredentials.status, "ACTIVE"),
        eq(workerAssignments.workerId, workerId),
        eq(workerAssignments.status, "ACTIVE"),
        gt(workerAssignments.leaseExpiresAt, sql`now()`),
        eq(workers.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return row as BotCredentialRow | undefined;
}

/**
 * Authoritative worker credential retrieval for a specific PENDING rotation candidate.
 *
 * Requires exact credentialId match (Amendment 2) in addition to all lease & tenant checks.
 */
export async function getPendingCredentialForAssignedWorker(
  db: Db,
  workerId: string,
  botApplicationId: string,
  credentialId: string,
): Promise<BotCredentialRow | undefined> {
  const [row] = await db
    .select({
      id: botCredentials.id,
      botApplicationId: botCredentials.botApplicationId,
      status: botCredentials.status,
      keyVersion: botCredentials.keyVersion,
      ciphertext: botCredentials.ciphertext,
      nonce: botCredentials.nonce,
      authTag: botCredentials.authTag,
      createdAt: botCredentials.createdAt,
      updatedAt: botCredentials.updatedAt,
      activatedAt: botCredentials.activatedAt,
      supersededAt: botCredentials.supersededAt,
    })
    .from(botCredentials)
    .innerJoin(botApplications, eq(botApplications.id, botCredentials.botApplicationId))
    .innerJoin(tenants, eq(tenants.id, botApplications.tenantId))
    .innerJoin(
      workerAssignments,
      eq(workerAssignments.botApplicationId, botCredentials.botApplicationId),
    )
    .innerJoin(workers, eq(workers.id, workerAssignments.workerId))
    .where(
      and(
        eq(botCredentials.id, credentialId),
        eq(botCredentials.botApplicationId, botApplicationId),
        eq(botCredentials.status, "PENDING"),
        eq(workerAssignments.workerId, workerId),
        eq(workerAssignments.status, "ACTIVE"),
        gt(workerAssignments.leaseExpiresAt, sql`now()`),
        eq(workers.status, "ACTIVE"),
        eq(tenants.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return row as BotCredentialRow | undefined;
}

/**
 * Atomically promotes a PENDING credential to ACTIVE upon successful worker connection.
 *
 * Crash-recoverable invariants:
 * 1. Verifies worker still owns live assignment lease
 * 2. If credential is already ACTIVE, returns idempotent success
 * 3. Promotes PENDING -> ACTIVE with activatedAt = NOW()
 * 4. Deletes superseded credential(s) within the same transaction (no historical token vault)
 */
export async function promotePendingCredential(
  db: Db,
  options: {
    workerId: string;
    botApplicationId: string;
    credentialId: string;
  },
): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction(
    async (tx) => {
      // 1. Authoritative lease check inside transaction with FOR UPDATE
      const [assignment] = await tx
        .select({
          leaseIsLive: sql<number>`(${workerAssignments.status} = 'ACTIVE' and ${workerAssignments.leaseExpiresAt} > now())`.as(
            "lease_is_live",
          ),
        })
        .from(workerAssignments)
        .innerJoin(workers, eq(workers.id, workerAssignments.workerId))
        .where(
          and(
            eq(workerAssignments.botApplicationId, options.botApplicationId),
            eq(workerAssignments.workerId, options.workerId),
            eq(workers.status, "ACTIVE"),
          ),
        )
        .for("update");

      if (!assignment || Number(assignment.leaseIsLive) !== 1) {
        return { ok: false, reason: "LEASE_INVALID_OR_NOT_OWNED" };
      }

      // 2. Check if the credential was already promoted (idempotent replay protection)
      const [existing] = await tx
        .select({ id: botCredentials.id, status: botCredentials.status })
        .from(botCredentials)
        .where(
          and(
            eq(botCredentials.id, options.credentialId),
            eq(botCredentials.botApplicationId, options.botApplicationId),
          ),
        )
        .for("update");

      if (!existing) {
        return { ok: false, reason: "CREDENTIAL_NOT_FOUND" };
      }

      if (existing.status === "ACTIVE") {
        // Idempotent: already promoted
        return { ok: true };
      }

      if (existing.status !== "PENDING") {
        return { ok: false, reason: "CREDENTIAL_NOT_PENDING" };
      }

      // 3. Atomically promote PENDING to ACTIVE
      await tx
        .update(botCredentials)
        .set({
          status: "ACTIVE",
          activatedAt: sql`now()`,
        })
        .where(
          and(
            eq(botCredentials.id, options.credentialId),
            eq(botCredentials.botApplicationId, options.botApplicationId),
            eq(botCredentials.status, "PENDING"),
          ),
        );

      // 4. Delete superseded active/old credentials for this botApplicationId
      await tx
        .delete(botCredentials)
        .where(
          and(
            eq(botCredentials.botApplicationId, options.botApplicationId),
            sql`${botCredentials.id} != ${options.credentialId}`,
          ),
        );

      return { ok: true };
    },
    { isolationLevel: "read committed" },
  );
}

/**
 * Hardened rejection/removal of a PENDING credential candidate (Amendment 3).
 *
 * Verifies authenticated worker, live WorkerAssignment, correct BotApplication,
 * and exact credentialId before removing the failed candidate.
 */
export async function rejectPendingCredential(
  db: Db,
  options: {
    workerId: string;
    botApplicationId: string;
    credentialId: string;
    reason?: string;
  },
): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction(
    async (tx) => {
      const [assignment] = await tx
        .select({
          leaseIsLive: sql<number>`(${workerAssignments.status} = 'ACTIVE' and ${workerAssignments.leaseExpiresAt} > now())`.as(
            "lease_is_live",
          ),
        })
        .from(workerAssignments)
        .innerJoin(workers, eq(workers.id, workerAssignments.workerId))
        .where(
          and(
            eq(workerAssignments.botApplicationId, options.botApplicationId),
            eq(workerAssignments.workerId, options.workerId),
            eq(workers.status, "ACTIVE"),
          ),
        )
        .for("update");

      if (!assignment || Number(assignment.leaseIsLive) !== 1) {
        return { ok: false, reason: "LEASE_INVALID_OR_NOT_OWNED" };
      }

      const result = await tx
        .delete(botCredentials)
        .where(
          and(
            eq(botCredentials.id, options.credentialId),
            eq(botCredentials.botApplicationId, options.botApplicationId),
            eq(botCredentials.status, "PENDING"),
          ),
        );

      if (result[0].affectedRows === 0) {
        return { ok: false, reason: "CREDENTIAL_NOT_PENDING_OR_NOT_FOUND" };
      }

      return { ok: true };
    },
    { isolationLevel: "read committed" },
  );
}

/**
 * Internal/testing lookup for the current active credential row of a BotApplication.
 */
export async function findActiveCredential(
  db: Db,
  botApplicationId: string,
): Promise<BotCredentialRow | undefined> {
  const [row] = await db
    .select()
    .from(botCredentials)
    .where(
      and(
        eq(botCredentials.botApplicationId, botApplicationId),
        eq(botCredentials.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return row as BotCredentialRow | undefined;
}

export interface CredentialStatusSummary {
  status: "PENDING" | "ACTIVE" | "SUPERSEDED";
  keyVersion: number;
  updatedAt: Date;
}

/**
 * Tenant-scoped, status-only read for the dashboard's runtime-status page
 * (task §18) — never selects `ciphertext`/`nonce`/`authTag`, so it is
 * structurally incapable of leaking credential material even by mistake.
 * `findByTenantAndId`-shaped (docs/DATABASE_RULES.md): both `tenantId` and
 * `botApplicationId` are required, joined through `bot_applications` so a
 * caller cannot read another tenant's credential status by guessing a
 * `botApplicationId`.
 */
export async function findCredentialStatusForTenantBotApplication(
  db: Db,
  tenantId: string,
  botApplicationId: string,
): Promise<CredentialStatusSummary | undefined> {
  const [row] = await db
    .select({
      status: botCredentials.status,
      keyVersion: botCredentials.keyVersion,
      updatedAt: botCredentials.updatedAt,
    })
    .from(botCredentials)
    .innerJoin(botApplications, eq(botApplications.id, botCredentials.botApplicationId))
    .where(
      and(
        eq(botApplications.tenantId, tenantId),
        eq(botCredentials.botApplicationId, botApplicationId),
        eq(botCredentials.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return row;
}
