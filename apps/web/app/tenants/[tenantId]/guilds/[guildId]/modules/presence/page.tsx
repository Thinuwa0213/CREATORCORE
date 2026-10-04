import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
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

  const subRes = await callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
  );
  const currentPlan = subRes.ok && subRes.data ? subRes.data.plan : "FREE";

  const statusRes = await callApiServer<{
    status: string;
    botApplicationId: string | null;
    botName?: string | null;
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`,
  );
  const botName = statusRes.ok && statusRes.data?.botName ? statusRes.data.botName : "CreatorBot";

  return (
    <PresenceView
      tenantId={tenantId}
      guildId={guildId}
      currentPlan={currentPlan}
      botName={botName}
    />
  );
}
