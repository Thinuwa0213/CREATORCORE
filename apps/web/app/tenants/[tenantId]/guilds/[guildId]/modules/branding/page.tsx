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

  const brandingRes = await callApiServer<{
    plan: "FREE" | "PRO" | "ENTERPRISE";
    maxStorageBytes: number;
    usedStorageBytes: number;
    botName: string;
    botTag: string;
    discordAvatarUrl: string | null;
    customAvatarUrl: string | null;
    customAvatarSizeBytes: number;
    customBannerUrl: string | null;
    customBannerSizeBytes: number;
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding`,
  );

  const data = brandingRes.ok && brandingRes.data ? brandingRes.data : null;

  return (
    <BrandingView
      tenantId={tenantId}
      guildId={guildId}
      currentPlan={data?.plan ?? "FREE"}
      botName={data?.botName ?? "CreatorBot"}
      botAvatarUrl={data?.customAvatarUrl ?? data?.discordAvatarUrl ?? null}
      botAvatarSizeBytes={data?.customAvatarSizeBytes ?? 0}
      botBannerUrl={data?.customBannerUrl ?? null}
      botBannerSizeBytes={data?.customBannerSizeBytes ?? 0}
      botTag={data?.botTag ?? "@creatorbot"}
      initialUsedBytes={data?.usedStorageBytes ?? 0}
      maxStorageBytes={data?.maxStorageBytes ?? 10 * 1024 * 1024}
    />
  );
}
