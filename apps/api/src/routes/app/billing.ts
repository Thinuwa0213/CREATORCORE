import { Hono, type Context } from "hono";
import {
  recordAuditEvent,
  upsertSubscriptionForTenant,
  type DatabaseClient,
  type SubscriptionPlan,
} from "@creatorcore/db";
import { AuthorizationError, requireTenantMembership } from "../../authz/index.js";
import {
  createRequireAuthenticatedUser,
  type AuthenticatedUserEnv,
} from "../../middleware/require-authenticated-user.js";
import { createOriginCheckMiddleware } from "../../middleware/origin-check.js";
import type { Auth } from "../../auth/index.js";
import { EntitlementsService, PLAN_DEFINITIONS } from "../../services/entitlements.service.js";

export interface BillingRoutesDeps {
  db: DatabaseClient["db"];
  auth: Auth;
  webAppOrigin: string;
}

function respondToAuthError(c: Context, error: unknown): Response | undefined {
  if (error instanceof AuthorizationError) {
    return c.json({ error: error.code }, 403);
  }
  return undefined;
}

export function createBillingRoutes(deps: BillingRoutesDeps): Hono<AuthenticatedUserEnv> {
  const route = new Hono<AuthenticatedUserEnv>();
  const entitlements = new EntitlementsService(deps.db);

  route.use("*", createOriginCheckMiddleware(deps.webAppOrigin));
  route.use("*", createRequireAuthenticatedUser({ auth: deps.auth, db: deps.db }));

  /**
   * GET /app/tenants/:tenantId/subscription
   * Returns current subscription, active plan, and available plan definitions.
   */
  route.get("/:tenantId/subscription", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");

    try {
      await requireTenantMembership(deps.db, userId, tenantId);
    } catch (err) {
      const resp = respondToAuthError(c, err);
      if (resp) return resp;
      throw err;
    }

    const { subscription, plan, entitlements: currentEntitlements } =
      await entitlements.getTenantSubscription(tenantId);

    return c.json({
      plan,
      subscription,
      entitlements: currentEntitlements,
      plans: PLAN_DEFINITIONS,
    });
  });

  /**
   * POST /app/tenants/:tenantId/billing/checkout
   * Initiates upgrade to PRO or ENTERPRISE.
   * For local/staging development, immediately applies the upgrade and logs an audit event.
   */
  route.post("/:tenantId/billing/checkout", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");

    let membership;
    try {
      membership = await requireTenantMembership(deps.db, userId, tenantId);
    } catch (err) {
      const resp = respondToAuthError(c, err);
      if (resp) return resp;
      throw err;
    }

    // Only owners/admins can change subscription
    if (membership.role !== "owner" && membership.role !== "admin") {
      return c.json({ error: "FORBIDDEN_INSUFFICIENT_ROLE" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      plan?: string;
      interval?: "month" | "year";
    };

    const targetPlan = body.plan as SubscriptionPlan;
    if (!targetPlan || !["FREE", "PRO", "ENTERPRISE"].includes(targetPlan)) {
      return c.json({ error: "INVALID_PLAN" }, 400);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (body.interval === "year") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const updated = await upsertSubscriptionForTenant(deps.db, tenantId, {
      plan: targetPlan,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    await recordAuditEvent(deps.db, {
      tenantId,
      actorType: "USER",
      actorUserId: userId,
      targetType: "tenant_subscriptions",
      targetId: updated.id,
      action: "SUBSCRIPTION_PLAN_CHANGED",
      outcome: "SUCCESS",
      metadata: {
        previousPlan: body.plan ?? null,
        newPlan: targetPlan,
        interval: body.interval ?? "month",
      },
    });

    return c.json({
      success: true,
      plan: targetPlan,
      subscription: updated,
    });
  });

  /**
   * POST /app/tenants/:tenantId/billing/cancel
   * Cancels subscription at period end or downgrades to FREE.
   */
  route.post("/:tenantId/billing/cancel", async (c) => {
    const userId = c.get("userId");
    const tenantId = c.req.param("tenantId");

    let membership;
    try {
      membership = await requireTenantMembership(deps.db, userId, tenantId);
    } catch (err) {
      const resp = respondToAuthError(c, err);
      if (resp) return resp;
      throw err;
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return c.json({ error: "FORBIDDEN_INSUFFICIENT_ROLE" }, 403);
    }

    const updated = await upsertSubscriptionForTenant(deps.db, tenantId, {
      plan: "FREE",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
    });

    await recordAuditEvent(deps.db, {
      tenantId,
      actorType: "USER",
      actorUserId: userId,
      targetType: "tenant_subscriptions",
      targetId: updated.id,
      action: "SUBSCRIPTION_CANCELED",
      outcome: "SUCCESS",
      metadata: { newPlan: "FREE" },
    });

    return c.json({
      success: true,
      plan: "FREE",
      subscription: updated,
    });
  });

  return route;
}
