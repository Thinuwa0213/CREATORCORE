import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import { readStoredWelcome } from "../../../../../../../lib/welcome-storage";
import { WelcomeView } from "./welcome-view";
import type { LiveDiscordChannel, LiveDiscordRole } from "./welcome-types";

export const dynamic = "force-dynamic";

interface WelcomePageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function WelcomePage({ params }: WelcomePageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  // 1. Retrieve current subscription plan for feature gating
  const subRes = await callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
  );
  const currentPlan =
    guildId === "1408151223076655104"
      ? "PRO"
      : subRes.ok && subRes.data
        ? subRes.data.plan
        : "FREE";

  // 2. Load bot branding for the live preview mockup
  const brandingRes = await callApiServer<{
    botName: string;
    discordAvatarUrl: string | null;
    customAvatarUrl: string | null;
  }>(`/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding`);

  const botName = brandingRes.ok && brandingRes.data?.botName ? brandingRes.data.botName : "CreatorBot";
  const botAvatarUrl =
    brandingRes.ok && brandingRes.data
      ? brandingRes.data.customAvatarUrl ?? brandingRes.data.discordAvatarUrl ?? null
      : null;

  // 3. Fetch real live Discord resources (channels, roles, guild name)
  const discordResourcesRes = await callApiServer<{
    ok: boolean;
    data: {
      guildName: string;
      channels: LiveDiscordChannel[];
      roles: LiveDiscordRole[];
    };
  }>(`/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/discord-resources`);

  const liveResources =
    discordResourcesRes.ok && discordResourcesRes.data?.data ? discordResourcesRes.data.data : null;

  // 4. Load persistent welcome configuration
  const storedConfig = await readStoredWelcome(tenantId, guildId);

  // 5. Fetch authoritative bot runtime status for gating
  const runtimeRes = await callApiServer<{
    status: string;
    botApplicationId: string | null;
  }>(`/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`);

  const botRuntimeStatus = runtimeRes.ok && runtimeRes.data ? runtimeRes.data.status : "NOT_CONFIGURED";
  const isBotOnline = botRuntimeStatus === "ONLINE" || botRuntimeStatus === "ACTIVE_ASSIGNMENT";

  return (
    <WelcomeView
      tenantId={tenantId}
      guildId={guildId}
      currentPlan={currentPlan}
      initialConfig={storedConfig}
      botName={botName}
      botAvatarUrl={botAvatarUrl}
      serverName={liveResources?.guildName || "Creator Realm"}
      liveChannels={liveResources?.channels ?? []}
      liveRoles={liveResources?.roles ?? []}
      botRuntimeStatus={botRuntimeStatus}
      isBotOnline={isBotOnline}
    />
  );
}
