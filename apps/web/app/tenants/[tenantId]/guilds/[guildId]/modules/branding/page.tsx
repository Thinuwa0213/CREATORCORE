import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import { BrandingView } from "./branding-view";

export const dynamic = "force-dynamic";

interface BrandingPageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function BrandingPage({ params }: BrandingPageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  const [subRes, profileRes, statusRes] = await Promise.all([
    callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
    ),
    callApiServer<{
      configured: boolean;
      botApplicationId: string | null;
      botName?: string | null;
      botAvatarUrl?: string | null;
      botTag?: string | null;
    }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/bot-profile`,
    ),
    callApiServer<{
      status: string;
      botApplicationId: string | null;
      botName?: string | null;
    }>(
      `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`,
    ),
  ]);

  const currentPlan = subRes.ok && subRes.data ? subRes.data.plan : "FREE";
  const botName =
    profileRes.ok && profileRes.data?.botName
      ? profileRes.data.botName
      : statusRes.ok && statusRes.data?.botName
        ? statusRes.data.botName
        : "CreatorBot";
  const botAvatarUrl =
    profileRes.ok && profileRes.data?.botAvatarUrl ? profileRes.data.botAvatarUrl : null;
  const botTag = profileRes.ok && profileRes.data?.botTag ? profileRes.data.botTag : null;

  return (
    <BrandingView
      tenantId={tenantId}
      guildId={guildId}
      currentPlan={currentPlan}
      botName={botName}
      botAvatarUrl={botAvatarUrl}
      botTag={botTag}
    />
  );
}
