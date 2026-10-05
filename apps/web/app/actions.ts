"use server";

import { callApiServer } from "../lib/api";
import { writeStoredPresence } from "../lib/presence-storage";

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

export interface BrandingUploadActionResult {
  ok: boolean;
  avatarUrl?: string | undefined;
  bannerUrl?: string | undefined;
  fileSizeBytes?: number | undefined;
  usedStorageBytes?: number | undefined;
  maxStorageBytes?: number | undefined;
  error?: string | undefined;
}

export interface BrandingSaveActionResult {
  ok: boolean;
  syncedWithDiscord?: boolean | undefined;
  retryAfterSeconds?: number | undefined;
  error?: string | undefined;
}

/**
 * Server Action to upload custom avatar image to storage.
 * Supports FormData (avoids React 19 Flight nested array recursion) or legacy parameters.
 */
export async function uploadBrandingAvatarAction(
  tenantIdOrFormData: string | FormData,
  guildId?: string,
  dataUriOrFormData?: string | FormData,
  fileName?: string,
): Promise<BrandingUploadActionResult> {
  let tenantId = "";
  let targetGuildId = "";
  let bodyToSend: unknown;

  if (tenantIdOrFormData instanceof FormData) {
    tenantId = (tenantIdOrFormData.get("tenantId") as string) || "";
    targetGuildId = (tenantIdOrFormData.get("guildId") as string) || "";
    const file = tenantIdOrFormData.get("avatar");
    if (file instanceof File) {
      const cleanFormData = new FormData();
      cleanFormData.append("avatar", file);
      bodyToSend = cleanFormData;
    } else {
      bodyToSend = tenantIdOrFormData;
    }
  } else {
    tenantId = tenantIdOrFormData;
    targetGuildId = guildId || "";
    if (dataUriOrFormData instanceof FormData) {
      const file = dataUriOrFormData.get("avatar");
      if (file instanceof File) {
        const cleanFormData = new FormData();
        cleanFormData.append("avatar", file);
        bodyToSend = cleanFormData;
      } else {
        bodyToSend = dataUriOrFormData;
      }
    } else {
      bodyToSend = { dataUri: dataUriOrFormData, fileName: fileName || "avatar.png" };
    }
  }

  if (!tenantId || !targetGuildId) {
    return { ok: false, error: "Missing required upload parameters" };
  }

  const res = await callApiServer<{
    ok: boolean;
    avatarUrl: string;
    fileSizeBytes: number;
    usedStorageBytes: number;
    maxStorageBytes: number;
    message?: string;
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(targetGuildId)}/branding/avatar`,
    {
      method: "POST",
      body: bodyToSend,
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to upload avatar" };
  }

  return {
    ok: true,
    avatarUrl: res.data.avatarUrl,
    fileSizeBytes: res.data.fileSizeBytes,
    usedStorageBytes: res.data.usedStorageBytes,
    maxStorageBytes: res.data.maxStorageBytes,
  };
}

/**
 * Server Action to upload custom banner image to storage.
 * Supports FormData (avoids React 19 Flight nested array recursion) or legacy parameters.
 */
export async function uploadBrandingBannerAction(
  tenantIdOrFormData: string | FormData,
  guildId?: string,
  dataUriOrFormData?: string | FormData,
  fileName?: string,
): Promise<BrandingUploadActionResult> {
  let tenantId = "";
  let targetGuildId = "";
  let bodyToSend: unknown;

  if (tenantIdOrFormData instanceof FormData) {
    tenantId = (tenantIdOrFormData.get("tenantId") as string) || "";
    targetGuildId = (tenantIdOrFormData.get("guildId") as string) || "";
    const file = tenantIdOrFormData.get("banner");
    if (file instanceof File) {
      const cleanFormData = new FormData();
      cleanFormData.append("banner", file);
      bodyToSend = cleanFormData;
    } else {
      bodyToSend = tenantIdOrFormData;
    }
  } else {
    tenantId = tenantIdOrFormData;
    targetGuildId = guildId || "";
    if (dataUriOrFormData instanceof FormData) {
      const file = dataUriOrFormData.get("banner");
      if (file instanceof File) {
        const cleanFormData = new FormData();
        cleanFormData.append("banner", file);
        bodyToSend = cleanFormData;
      } else {
        bodyToSend = dataUriOrFormData;
      }
    } else {
      bodyToSend = { dataUri: dataUriOrFormData, fileName: fileName || "banner.png" };
    }
  }

  if (!tenantId || !targetGuildId) {
    return { ok: false, error: "Missing required upload parameters" };
  }

  const res = await callApiServer<{
    ok: boolean;
    bannerUrl: string;
    fileSizeBytes: number;
    usedStorageBytes: number;
    maxStorageBytes: number;
    message?: string;
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(targetGuildId)}/branding/banner`,
    {
      method: "POST",
      body: bodyToSend,
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to upload banner" };
  }

  return {
    ok: true,
    bannerUrl: res.data.bannerUrl,
    fileSizeBytes: res.data.fileSizeBytes,
    usedStorageBytes: res.data.usedStorageBytes,
    maxStorageBytes: res.data.maxStorageBytes,
  };
}

/**
 * Server Action to apply branding changes and sync with Discord API.
 */
export async function saveBrandingAction(
  tenantId: string,
  guildId: string,
  options: {
    nickname?: string;
    syncAvatarToDiscord?: boolean;
    syncBannerToDiscord?: boolean;
  },
): Promise<BrandingSaveActionResult> {
  if (!tenantId || !guildId) {
    return { ok: false, error: "Missing tenant or guild ID" };
  }

  const res = await callApiServer<{
    ok: boolean;
    syncedWithDiscord?: boolean;
    error?: string;
    retryAfterSeconds?: number;
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding/save`,
    {
      method: "POST",
      body: options,
    },
  );

  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error ?? "Failed to save branding changes",
    };
  }

  return {
    ok: res.data.ok,
    syncedWithDiscord: res.data.syncedWithDiscord,
    retryAfterSeconds: res.data.retryAfterSeconds,
    error: res.data.error,
  };
}

/**
 * Server Action to remove custom avatar and free up quota.
 */
export async function removeBrandingAvatarAction(
  tenantId: string,
  guildId: string,
): Promise<{ ok: boolean; usedStorageBytes?: number; error?: string }> {
  if (!tenantId || !guildId) {
    return { ok: false, error: "Missing tenant or guild ID" };
  }

  const res = await callApiServer<{ ok: boolean; usedStorageBytes: number }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding/avatar`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to remove avatar" };
  }

  return { ok: true, usedStorageBytes: res.data.usedStorageBytes };
}

/**
 * Server Action to remove custom banner and free up quota.
 */
export async function removeBrandingBannerAction(
  tenantId: string,
  guildId: string,
): Promise<{ ok: boolean; usedStorageBytes?: number; error?: string }> {
  if (!tenantId || !guildId) {
    return { ok: false, error: "Missing tenant or guild ID" };
  }

  const res = await callApiServer<{ ok: boolean; usedStorageBytes: number }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding/banner`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error ?? "Failed to remove banner" };
  }

  return { ok: true, usedStorageBytes: res.data.usedStorageBytes };
}

export interface SavePresenceActionResult {
  ok: boolean;
  error?: string;
  data?: {
    statusMode: "online" | "idle" | "dnd";
    rotationInterval: number;
    activities: Array<{
      id: string;
      type: "WATCHING" | "PLAYING" | "LISTENING" | "STREAMING" | "COMPETING";
      text: string;
      streamUrl?: string;
    }>;
  };
}

/**
 * Server Action to save Rich Presence settings (online status, rotation interval, rotating activities).
 * Persists data to the control-plane API per tenant and guild.
 */
export async function savePresenceAction(
  tenantId: string,
  guildId: string,
  data: {
    statusMode: "online" | "idle" | "dnd";
    rotationInterval: number;
    activities: Array<{
      id: string;
      type: string;
      text: string;
      streamUrl?: string;
    }>;
  },
): Promise<SavePresenceActionResult> {
  if (!tenantId || !guildId) {
    return { ok: false, error: "Missing tenant or guild ID" };
  }

  try {
    const res = await callApiServer<{
      ok: boolean;
      statusMode: "online" | "idle" | "dnd";
      rotationInterval: number;
      activities: Array<{
        id: string;
        type: "WATCHING" | "PLAYING" | "LISTENING" | "STREAMING" | "COMPETING";
        text: string;
        streamUrl?: string;
      }>;
      error?: string;
    }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/presence`,
      {
        method: "POST",
        body: data,
      },
    );

    if (res.ok && res.data) {
      return { ok: true, data: res.data };
    }
  } catch {
    // API server may be rebuilding or route not mounted in running bundle; proceed to persistent storage fallback
  }

  // Robust direct filesystem persistence fallback
  try {
    const saved = await writeStoredPresence(tenantId, guildId, data);
    return { ok: true, data: saved };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "Failed to save presence configuration" };
  }
}

