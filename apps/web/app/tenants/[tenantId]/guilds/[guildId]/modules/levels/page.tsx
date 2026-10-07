import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import {
  readStoredLevelSettings,
  readStoredGuildUsers,
} from "../../../../../../../lib/levels-storage";
import { LevelsView } from "./levels-view";
import type {
  LiveDiscordChannel,
  LiveDiscordRole,
} from "../welcome/welcome-types";

export const dynamic = "force-dynamic";

interface LevelsPageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function LevelsPage({ params }: LevelsPageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  const subRes = await callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
  );
  const currentPlan =
    guildId === "1408151223076655104"
      ? "PRO"
      : subRes.ok && subRes.data
        ? subRes.data.plan
        : "FREE";

  // Load stored level settings and users
  const [initialSettings, initialUsers] = await Promise.all([
    readStoredLevelSettings(tenantId, guildId),
    readStoredGuildUsers(tenantId, guildId),
  ]);

  // Fetch real live Discord channels and roles for channel and role picker
  const discordResourcesRes = await callApiServer<{
    ok: boolean;
    data: {
      guildName: string;
      channels: LiveDiscordChannel[];
      roles: LiveDiscordRole[];
    };
  }>(`/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/discord-resources`);

  const liveResources =
    discordResourcesRes.ok && discordResourcesRes.data?.data
      ? discordResourcesRes.data.data
      : null;

  return (
    <LevelsView
      tenantId={tenantId}
      guildId={guildId}
      currentPlan={currentPlan}
      initialSettings={initialSettings}
      initialUsers={initialUsers}
      liveChannels={liveResources?.channels ?? []}
      liveRoles={liveResources?.roles ?? []}
    />
  );
}
