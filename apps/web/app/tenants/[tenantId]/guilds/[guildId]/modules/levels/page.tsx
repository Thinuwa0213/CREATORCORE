import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import { LevelsView } from "./levels-view";

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
  const currentPlan = subRes.ok && subRes.data ? subRes.data.plan : "FREE";

  return <LevelsView tenantId={tenantId} guildId={guildId} currentPlan={currentPlan} />;
}
