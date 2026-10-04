import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { tenantSubscriptions } from "../schema/subscriptions.js";
import { assertTenantActive } from "./tenants.js";
import type { Db } from "../types.js";

export type SubscriptionPlan = "FREE" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING";

export interface TenantSubscription {
  id: string;
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSubscriptionInput {
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Retrieves the subscription record for a tenant.
 * Defaults to FREE tier if no record exists yet.
 */
export async function findSubscriptionByTenant(
  db: Db,
  tenantId: string,
): Promise<TenantSubscription | undefined> {
  const [row] = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1);

  return row;
}

/**
 * Upserts a subscription row for a tenant.
 * Guarantees tenant is active before writing (docs/DATABASE_RULES.md).
 */
export async function upsertSubscriptionForTenant(
  db: Db,
  tenantId: string,
  input: UpsertSubscriptionInput,
): Promise<TenantSubscription> {
  await assertTenantActive(db, tenantId);

  const existing = await findSubscriptionByTenant(db, tenantId);

  if (existing) {
    await db
      .update(tenantSubscriptions)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptions.tenantId, tenantId));
  } else {
    const id = randomUUID();
    await db.insert(tenantSubscriptions).values({
      id,
      tenantId,
      plan: input.plan ?? "FREE",
      status: input.status ?? "ACTIVE",
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    });
  }

  const updated = await findSubscriptionByTenant(db, tenantId);
  if (!updated) {
    throw new Error(`upsertSubscriptionForTenant: failed to load subscription for tenant ${tenantId}`);
  }

  return updated;
}
