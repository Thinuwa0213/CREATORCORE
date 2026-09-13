import { redirect } from "next/navigation";
import { callApiServer, getServerSession } from "../../../../../lib/api";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { GuildItem } from "@/app/components/guild-card";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    tenantId: string;
    guildId: string;
  }>;
}

export default async function TenantGuildLayout({ children, params }: LayoutProps) {
  const session = await getServerSession();

  if (!session) {
    redirect("/");
  }

  const { tenantId, guildId } = await params;

  // Retrieve user's manageable/connected guilds for the switcher
  const guildsRes = await callApiServer<{ guilds: GuildItem[] }>("/app/guilds");
  const allGuilds = guildsRes.ok && guildsRes.data ? guildsRes.data.guilds : [];

  // Filter only connected guilds (Amendment 2)
  const connectedGuilds = allGuilds.filter((g) => g.connected);
  const currentGuildItem = allGuilds.find((g) => g.id === guildId);

  return (
    <DashboardShell
      currentGuild={{
        id: guildId,
        tenantId,
        name: currentGuildItem?.name,
      }}
      connectedGuilds={connectedGuilds}
      user={session.user}
      breadcrumbs={[
        {
          label: currentGuildItem?.name ?? `Server (${guildId.slice(0, 6)}...)`,
          href: `/tenants/${tenantId}/guilds/${guildId}`,
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
