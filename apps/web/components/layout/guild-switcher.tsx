"use client";

import * as React from "react";
import { ChevronsUpDown, Check, PlusCircle, Server } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ConnectedGuildItem {
  id: string;
  name: string;
  connected: boolean;
  tenantId?: string;
}

interface GuildSwitcherProps {
  currentGuild: {
    id: string;
    tenantId: string;
    name?: string | undefined;
  };
  connectedGuilds: ConnectedGuildItem[];
}

export function GuildSwitcher({ currentGuild, connectedGuilds }: GuildSwitcherProps) {
  const router = useRouter();
  const { state, isMobile } = useSidebar();

  // Active guild name or fallback
  const activeGuildName =
    currentGuild.name ??
    connectedGuilds.find((g) => g.id === currentGuild.id)?.name ??
    `Guild ${currentGuild.id.slice(0, 6)}...`;

  const initials = activeGuildName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Only guilds that are connected
  const otherConnectedGuilds = connectedGuilds.filter(
    (g) => g.connected && g.id !== currentGuild.id && g.tenantId,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id="guild-switcher-trigger"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-sidebar-ring select-none",
          state === "collapsed" && !isMobile && "justify-center p-1",
        )}
        aria-label="Switch Discord Server"
      >
        <Avatar className="h-8 w-8 shrink-0 rounded-md border border-sidebar-border">
          <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs rounded-md">
            {initials}
          </AvatarFallback>
        </Avatar>

        {(state === "expanded" || isMobile) && (
          <div className="flex min-w-0 flex-1 flex-col text-left">
            <span
              id="active-guild-name"
              className="truncate text-sm font-semibold text-sidebar-foreground leading-tight"
            >
              {activeGuildName}
            </span>
            <span className="truncate text-xs text-muted-foreground">Connected Server</span>
          </div>
        )}

        {(state === "expanded" || isMobile) && (
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={state === "collapsed" && !isMobile ? "start" : "center"}
        className="w-64"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Connected Discord Servers
        </DropdownMenuLabel>

        {/* Current active guild */}
        <DropdownMenuItem className="flex items-center justify-between font-semibold bg-sidebar-accent text-sidebar-accent-foreground">
          <div className="flex items-center gap-2 truncate">
            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{activeGuildName}</span>
          </div>
          <Check className="h-4 w-4 shrink-0 text-primary" />
        </DropdownMenuItem>

        {/* Other connected guilds */}
        {otherConnectedGuilds.map((guild) => (
          <DropdownMenuItem
            key={guild.id}
            id={`switch-to-guild-${guild.id}`}
            onClick={() => router.push(`/tenants/${guild.tenantId}/guilds/${guild.id}`)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{guild.name}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Dedicated action to navigate to /guilds for discovery/connecting */}
        <DropdownMenuItem
          id="manage-connect-servers-link"
          onClick={() => router.push("/guilds")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <PlusCircle className="h-4 w-4 shrink-0" />
          <span>Manage / Connect another server</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
