"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Bot, LayoutDashboard } from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { GuildSwitcher, type ConnectedGuildItem } from "./guild-switcher";
import { UserMenu } from "./user-menu";

interface AppSidebarProps {
  currentGuild: {
    id: string;
    tenantId: string;
    name?: string | undefined;
  };
  connectedGuilds: ConnectedGuildItem[];
  user: {
    id: string;
    name: string;
    email?: string | undefined;
    image?: string | null | undefined;
  };
}

export function AppSidebar({ currentGuild, connectedGuilds, user }: AppSidebarProps) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();

  const overviewUrl = `/tenants/${currentGuild.tenantId}/guilds/${currentGuild.id}`;
  const setupUrl = `/tenants/${currentGuild.tenantId}/guilds/${currentGuild.id}/setup`;

  const isOverviewActive = pathname === overviewUrl;
  const isSetupActive = pathname === setupUrl;

  return (
    <Sidebar id="app-sidebar" collapsible="icon">
      {/* Brand Header — Wordmark only, no internal dev phase labels */}
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-black text-sm">
            C
          </div>
          {(state === "expanded" || isMobile) && (
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight leading-none text-sidebar-foreground">
                CreatorCore
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Discord Operations
              </span>
            </div>
          )}
        </div>

        {/* Guild Switcher */}
        <div className="mt-2">
          <GuildSwitcher currentGuild={currentGuild} connectedGuilds={connectedGuilds} />
        </div>
      </SidebarHeader>

      {/* Main Navigation — Truthful links only */}
      <SidebarContent>
        <div className="px-2 py-1">
          {(state === "expanded" || isMobile) && (
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase px-2 mb-1 block">
              Manage
            </span>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                id="nav-guild-overview"
                href={overviewUrl}
                isActive={isOverviewActive}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                {(state === "expanded" || isMobile) && <span>Overview</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton id="nav-bot-setup" href={setupUrl} isActive={isSetupActive}>
                <Bot className="h-4 w-4 shrink-0" />
                {(state === "expanded" || isMobile) && <span>Bot Configuration</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>

      {/* Sidebar Footer — User information & session control */}
      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2 overflow-hidden">
            <UserMenu user={user} />
            {(state === "expanded" || isMobile) && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                  {user.name}
                </span>
                {user.email && (
                  <span className="text-[11px] text-muted-foreground truncate leading-tight">
                    {user.email}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
