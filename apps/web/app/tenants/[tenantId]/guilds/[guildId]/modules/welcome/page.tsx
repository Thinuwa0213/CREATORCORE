import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../../lib/api";
import { WelcomeView } from "./welcome-view";

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

  // Retrieve current subscription plan for feature gating
  const subRes = await callApiServer<{ plan: "FREE" | "PRO" | "ENTERPRISE" }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/subscription`,
  );
  const currentPlan = subRes.ok && subRes.data ? subRes.data.plan : "FREE";

  return <WelcomeView tenantId={tenantId} guildId={guildId} currentPlan={currentPlan} />;
}
