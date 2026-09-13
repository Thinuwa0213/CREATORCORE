"use client";

import * as React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { AppHeader, type BreadcrumbSegment } from "./app-header";
import type { ConnectedGuildItem } from "./guild-switcher";

interface DashboardShellProps {
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
  breadcrumbs?: BreadcrumbSegment[] | undefined;
  children: React.ReactNode;
}

export function DashboardShell({
  currentGuild,
  connectedGuilds,
  user,
  breadcrumbs,
  children,
}: DashboardShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar currentGuild={currentGuild} connectedGuilds={connectedGuilds} user={user} />

        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader breadcrumbs={breadcrumbs} />
          <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
