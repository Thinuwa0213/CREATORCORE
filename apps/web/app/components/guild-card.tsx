"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Server, ArrowRight, Plug } from "lucide-react";
import { connectGuildAction } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface GuildItem {
  id: string;
  name: string;
  connected: boolean;
  tenantId?: string;
}

export function GuildCard({ guild }: { guild: GuildItem }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    const res = await connectGuildAction(guild.id);
    if (!res.ok || !res.tenantId) {
      setError(res.error ?? "Failed to connect guild");
      setLoading(false);
      return;
    }

    router.push(`/tenants/${res.tenantId}/guilds/${guild.id}`);
  };

  return (
    <li
      id={`guild-item-${guild.id}`}
      data-testid="guild-item"
      data-guild-id={guild.id}
      className="list-none mb-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:border-border/80 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Server className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="min-w-0">
          <div
            id={`guild-name-${guild.id}`}
            className="font-semibold text-base text-card-foreground truncate"
          >
            {guild.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground font-mono">ID: {guild.id}</span>
            <Badge
              id={`guild-connection-badge-${guild.id}`}
              variant={guild.connected ? "success" : "secondary"}
              className="text-[11px] px-2 py-0"
            >
              {guild.connected ? "Connected" : "Not Connected"}
            </Badge>
          </div>

          {error && (
            <div
              id={`guild-error-${guild.id}`}
              className="text-xs text-destructive mt-1.5 font-medium"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <Button
          id={`connect-guild-button-${guild.id}`}
          onClick={handleConnect}
          disabled={loading}
          variant={guild.connected ? "default" : "secondary"}
          size="sm"
          className="flex items-center gap-1.5 font-medium"
        >
          {loading ? (
            "Connecting..."
          ) : guild.connected ? (
            <>
              <span>Manage Guild</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              <Plug className="h-3.5 w-3.5" />
              <span>Connect</span>
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
