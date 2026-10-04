import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../../lib/api";
import { BotSetupForm } from "../../../../../components/bot-setup-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function BotSetupPage({ params }: PageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  const res = await callApiServer<{
    status:
      | "NOT_CONFIGURED"
      | "PENDING_CREDENTIAL"
      | "UNASSIGNED"
      | "ACTIVE_ASSIGNMENT"
      | "ONLINE"
      | "DEGRADED"
      | "OFFLINE";
    botApplicationId: string | null;
    botName?: string | null;
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`,
  );

  const initialStatus = res.ok && res.data ? res.data.status : "NOT_CONFIGURED";
  const botApplicationId = res.ok && res.data ? res.data.botApplicationId : null;
  const currentBotName = res.ok && res.data ? res.data.botName : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bot Configuration</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure your Discord bot application token and credentials.
          </p>
        </div>

        <Button variant="ghost" size="sm" asChild>
          <a
            href={`/tenants/${tenantId}/guilds/${guildId}`}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Guild Overview</span>
          </a>
        </Button>
      </div>

      <div className="py-2">
        <BotSetupForm
          tenantId={tenantId}
          guildId={guildId}
          initialStatus={initialStatus}
          botApplicationId={botApplicationId}
          currentBotName={currentBotName}
        />
      </div>
    </div>
  );
}
