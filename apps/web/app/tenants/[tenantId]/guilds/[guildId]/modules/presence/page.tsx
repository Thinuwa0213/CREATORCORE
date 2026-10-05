import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import { readStoredPresence } from "../../../../../../../lib/presence-storage";
import { PresenceView } from "./presence-view";

export const dynamic = "force-dynamic";

interface PresencePageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function PresencePage({ params }: PresencePageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  const [subRes, statusRes, presenceRes] = await Promise.all([
    callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
    ),
    callApiServer<{
      status: string;
      botApplicationId: string | null;
      botName?: string | null;
    }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`,
    ),
    callApiServer<{
      statusMode: "online" | "idle" | "dnd";
      rotationInterval: number;
      activities: Array<{
        id: string;
        type: "WATCHING" | "PLAYING" | "LISTENING" | "STREAMING" | "COMPETING";
        text: string;
        streamUrl?: string;
      }>;
    }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/presence`,
    ),
  ]);

  const currentPlan = subRes.ok && subRes.data ? subRes.data.plan : "FREE";
  const botName = statusRes.ok && statusRes.data?.botName ? statusRes.data.botName : "CreatorBot";

  let presenceData = presenceRes.ok && presenceRes.data ? presenceRes.data : null;

  if (!presenceData) {
    const directStored = await readStoredPresence(tenantId, guildId);
    if (directStored) {
      presenceData = directStored;
    }
  }

  if (!presenceData) {
    presenceData = {
      statusMode: "online",
      rotationInterval: 60,
      activities: [], // First setup: clean/empty state
    };
  }

  return (
    <PresenceView
      tenantId={tenantId}
      guildId={guildId}
      currentPlan={currentPlan}
      botName={botName}
      initialActivities={presenceData.activities ?? []}
      initialStatusMode={presenceData.statusMode ?? "online"}
      initialRotationInterval={presenceData.rotationInterval ?? 60}
    />
  );
}
