import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { tenantMemberships, tenants } from "../schema/index.js";
import type { Db } from "../types.js";

export interface Tenant {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant is the root of the authorization chain itself -- there is no
 * "authorizing tenant" above a Tenant to scope this lookup by, so a bare-ID
 * lookup is the one legitimate exception to docs/DATABASE_RULES.md's
 * findByTenantAndId rule (the rule's own carve-out for genuine
 * platform-root lookups).
 */
export async function findTenantById(db: Db, tenantId: string): Promise<Tenant | undefined> {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return row;
}

export async function createTenant(db: Db, name: string): Promise<Tenant> {
  const id = randomUUID();
  await db.insert(tenants).values({ id, name });
  const created = await findTenantById(db, id);
  if (!created) {
    throw new Error("createTenant: row not found immediately after insert");
  }
  return created;
}

export async function disableTenant(db: Db, tenantId: string): Promise<void> {
  await db.update(tenants).set({ status: "DISABLED" }).where(eq(tenants.id, tenantId));
}

export class TenantNotActiveError extends Error {
  constructor(tenantId: string) {
    super(`tenant is not active: ${tenantId}`);
    this.name = "TenantNotActiveError";
  }
}

/**
 * Required by every privileged tenant-scoped write path (docs/TESTING.md's
 * locked "disabled tenants cannot continue to perform privileged
 * operations" regression scenario) -- called by createGuild/
 * createBotApplication before writing anything. Throws for both "tenant
 * does not exist" and "tenant is disabled" -- a caller must never be able
 * to distinguish the two from this error alone.
 */
export async function assertTenantActive(db: Db, tenantId: string): Promise<void> {
  const tenant = await findTenantById(db, tenantId);
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new TenantNotActiveError(tenantId);
  }
}

export interface TenantMembership {
  tenantId: string;
  userId: bigint;
  role: "owner" | "admin" | "member";
  createdAt: Date;
}

export async function findTenantMembership(
  db: Db,
  userId: bigint,
  tenantId: string,
): Promise<TenantMembership | undefined> {
  const [row] = await db
    .select()
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
    .limit(1);
  return row;
}

export async function createTenantMembership(
  db: Db,
  tenantId: string,
  userId: bigint,
  role: "owner" | "admin" | "member",
): Promise<void> {
  await db.insert(tenantMemberships).values({ tenantId, userId, role });
}
