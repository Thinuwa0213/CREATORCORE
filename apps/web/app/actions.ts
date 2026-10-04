"use server";

import { callApiServer } from "../lib/api";

export interface ConnectGuildActionResult {
  ok: boolean;
  tenantId?: string;
  error?: string;
}

export interface OnboardBotActionResult {
  ok: boolean;
  botApplicationId?: string;
  error?: string;
}

/**
 * Server Action to connect an authorized Discord guild to CreatorCore.
 * Calls `POST /app/guilds/:guildId/connect` in apps/api with forwarded session and origin.
 */
export async function connectGuildAction(guildId: string): Promise<ConnectGuildActionResult> {
  if (!guildId || !/^[0-9]{1,20}$/.test(guildId)) {
    return { ok: false, error: "INVALID_GUILD_ID" };
  }

  const res = await callApiServer<{ ok: boolean; tenantId: string; guildId: string }>(
    `/app/guilds/${guildId}/connect`,
    { method: "POST" },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to connect guild" };
  }

  return { ok: true, tenantId: res.data.tenantId };
}

/**
 * Server Action to onboard a BotApplication with initial encrypted credential.
 * Calls `POST /app/tenants/:tenantId/guilds/:guildId/bot-application` in apps/api.
 *
 * Security guarantees:
 * - Token is forwarded directly to apps/api for envelope encryption
 * - Token is NEVER returned in this action result payload
 * - Token is NEVER serialized back to the client
 */
export async function onboardBotAction(
  tenantId: string,
  guildId: string,
  name: string,
  token: string,
): Promise<OnboardBotActionResult> {
  if (!tenantId || !guildId || !token) {
    return { ok: false, error: "Missing required fields" };
  }

  const res = await callApiServer<{ botApplicationId: string; status: string }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/bot-application`,
    {
      method: "POST",
      body: { name, token },
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to configure bot application" };
  }

  return { ok: true, botApplicationId: res.data.botApplicationId };
}

export interface RotateBotCredentialActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Server Action to rotate a BotApplication credential.
 * Calls `POST /app/tenants/:tenantId/bot-applications/:botApplicationId/credential/rotate` in apps/api.
 *
 * Security guarantees:
 * - Token is forwarded directly to apps/api for envelope encryption and rotation
 * - Token is NEVER returned in this action result payload
 * - Token is NEVER serialized back to the client
 */
export async function rotateBotCredentialAction(
  tenantId: string,
  botApplicationId: string,
  token: string,
): Promise<RotateBotCredentialActionResult> {
  if (!tenantId || !botApplicationId || !token) {
    return { ok: false, error: "Missing required fields" };
  }

  const res = await callApiServer<{ status: string }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/bot-applications/${encodeURIComponent(botApplicationId)}/credential/rotate`,
    {
      method: "POST",
      body: { token },
    },
  );

  if (!res.ok) {
    return { ok: false, error: res.error ?? "Failed to rotate bot credentials" };
  }

  return { ok: true };
}

export interface BillingActionResult {
  ok: boolean;
  plan?: string;
  error?: string;
}

/**
 * Server Action to upgrade or change a tenant's subscription plan.
 */
export async function upgradePlanAction(
  tenantId: string,
  plan: "FREE" | "PRO" | "ENTERPRISE",
  interval: "month" | "year",
): Promise<BillingActionResult> {
  if (!tenantId || !plan) {
    return { ok: false, error: "Missing required fields" };
  }

  const res = await callApiServer<{ success: boolean; plan: string }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/billing/checkout`,
    {
      method: "POST",
      body: { plan, interval },
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to update plan" };
  }

  return { ok: true, plan: res.data.plan };
}

/**
 * Server Action to cancel or downgrade a tenant's subscription plan.
 */
export async function cancelPlanAction(tenantId: string): Promise<BillingActionResult> {
  if (!tenantId) {
    return { ok: false, error: "Missing tenant ID" };
  }

  const res = await callApiServer<{ success: boolean; plan: string }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/billing/cancel`,
    {
      method: "POST",
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to cancel subscription" };
  }

  return { ok: true, plan: res.data.plan };
}
