import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import { EmbedsView } from "./embeds-view";

export const dynamic = "force-dynamic";

interface EmbedsPageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function EmbedsPage({ params }: EmbedsPageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  const subRes = await callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
  );
  const currentPlan = subRes.ok && subRes.data ? subRes.data.plan : "FREE";

  return <EmbedsView tenantId={tenantId} guildId={guildId} currentPlan={currentPlan} />;
}
