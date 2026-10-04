import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../lib/api";
import { BillingView } from "./billing-view";

export const dynamic = "force-dynamic";

interface BillingPageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default async function BillingPage({ params }: BillingPageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId } = await params;

  const res = await callApiServer<{
    plan: "FREE" | "PRO" | "ENTERPRISE";
    subscription: {
      id?: string;
      status?: string;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
    } | null;
  }>(`/app/tenants/${encodeURIComponent(tenantId)}/subscription`);

  const currentPlan = res.ok && res.data ? res.data.plan : "FREE";
  const subscription = res.ok && res.data ? res.data.subscription : null;

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <BillingView
        tenantId={tenantId}
        currentPlan={currentPlan}
        subscription={subscription}
      />
    </main>
  );
}
