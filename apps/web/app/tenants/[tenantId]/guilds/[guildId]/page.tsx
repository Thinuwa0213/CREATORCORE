import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, Bot, Activity, Server, ArrowRight, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function GuildOverviewPage({ params }: PageProps) {
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
  }>(
    `/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/runtime-status`,
  );

  if (!res.ok || !res.data) {
    return (
      <div
        id="access-denied-container"
        className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 shadow-sm max-w-lg mx-auto"
      >
        <div className="flex items-center gap-2.5 text-destructive mb-2">
          <ShieldAlert className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Access Denied</h1>
        </div>
        <p id="access-denied-message" className="text-sm text-destructive leading-relaxed">
          {res.error ?? "You do not have access to this guild or tenant."}
        </p>
        <div className="mt-6 pt-4 border-t border-destructive/15">
          <Button variant="outline" size="sm" asChild>
            <a href="/guilds">&larr; Back to Guild Selection</a>
          </Button>
        </div>
      </div>
    );
  }

  const { status, botApplicationId } = res.data;

  const getBadgeVariant = (
    st: string,
  ): "success" | "default" | "warning" | "secondary" | "destructive" => {
    switch (st) {
      case "ONLINE":
        return "success";
      case "ACTIVE_ASSIGNMENT":
        return "default";
      case "UNASSIGNED":
        return "warning";
      case "NOT_CONFIGURED":
        return "secondary";
      case "DEGRADED":
      case "OFFLINE":
      default:
        return "destructive";
    }
  };

  const badgeVariant = getBadgeVariant(status);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Guild Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Operational status and bot application configuration for this server.
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href="/guilds">&larr; All Servers</a>
        </Button>
      </div>

      {/* Main Overview Card */}
      <div
        id="guild-overview-card"
        className="rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        {/* Guild Identity */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Server className="h-4 w-4" />
            <span>Server Identity</span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Discord Guild ID</dt>
              <dd id="overview-guild-id" className="font-mono text-foreground font-semibold mt-0.5">
                {guildId}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tenant ID</dt>
              <dd className="mt-0.5">
                <code
                  id="overview-tenant-id"
                  className="font-mono text-xs text-foreground bg-muted px-2 py-0.5 rounded"
                >
                  {tenantId}
                </code>
              </dd>
            </div>
          </dl>
        </section>

        <Separator className="my-6" />

        {/* Bot Application Status */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Bot className="h-4 w-4" />
            <span>Bot Application Configuration</span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Application</dt>
              <dd id="overview-bot-app-status" className="font-medium text-foreground mt-0.5">
                {botApplicationId ? `Configured (${botApplicationId})` : "Not Configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Credential Status</dt>
              <dd id="overview-credential-status" className="font-medium text-foreground mt-0.5">
                {status === "NOT_CONFIGURED" ? "None" : "Stored & Encrypted"}
              </dd>
            </div>
          </dl>
        </section>

        <Separator className="my-6" />

        {/* Authoritative Runtime Status */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>Authoritative Runtime Status</span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Badge
              id="overview-runtime-status-badge"
              data-status={status}
              variant={badgeVariant}
              className="text-xs px-3 py-1 font-semibold"
            >
              {status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {status === "ONLINE"
                ? "Bot worker active and connected to Discord Gateway."
                : status === "ACTIVE_ASSIGNMENT"
                  ? "Assigned to an active bot worker replica."
                  : status === "UNASSIGNED"
                    ? "Application configured; awaiting worker assignment."
                    : "Bot credentials required to activate this server."}
            </span>
          </div>
        </section>

        {/* Action Container */}
        <div id="setup-action-container" className="mt-8 pt-6 border-t border-border">
          {status === "NOT_CONFIGURED" ? (
            <Button id="setup-bot-link" asChild size="default">
              <a
                href={`/tenants/${tenantId}/guilds/${guildId}/setup`}
                className="flex items-center gap-2"
              >
                <span>Configure Discord Bot</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <div
              id="bot-configured-notice"
              className="flex items-center gap-2 text-sm font-medium text-success"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>✓ Bot application configured and active.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
