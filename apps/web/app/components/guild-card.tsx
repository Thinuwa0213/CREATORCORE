"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Plug,
  Crown,
  Shield,
  Bot,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { connectGuildAction } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BotOnboardingModal } from "./bot-onboarding-modal";

export interface GuildItem {
  id: string;
  name: string;
  connected: boolean;
  tenantId?: string;
  icon?: string | null;
  owner?: boolean;
  botName?: string | null;
}

function getGuildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "G";
  if (parts.length <= 1) {
    return first.slice(0, 2).toUpperCase();
  }
  const second = parts[1] ?? "";
  return ((first[0] ?? "") + (second[0] ?? "")).toUpperCase() || "CC";
}

function getGuildIconUrl(guildId: string, iconHash?: string | null): string | null {
  if (!iconHash) return null;
  const isAnimated = iconHash.startsWith("a_");
  const ext = isAnimated ? "gif" : "webp";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=128`;
}

export function GuildCard({
  guild,
  viewMode = "grid",
}: {
  guild: GuildItem;
  viewMode?: "grid" | "table";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const iconUrl = getGuildIconUrl(guild.id, guild.icon);

  const copySnowflake = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(guild.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const handleConnect = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Dense Table Row View
  if (viewMode === "table") {
    return (
      <tr
        id={`guild-item-${guild.id}`}
        data-testid="guild-item"
        data-guild-id={guild.id}
        className="border-b border-border/60 hover:bg-muted/30 transition-colors group"
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden border border-border/60 bg-muted flex items-center justify-center font-bold text-xs">
              {iconUrl && !imageFailed ? (
                <img
                  src={iconUrl}
                  alt={guild.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <span>{getGuildInitials(guild.name)}</span>
              )}
            </div>
            <div className="min-w-0">
              <span
                id={`guild-name-${guild.id}`}
                className="font-semibold text-sm text-foreground truncate block max-w-[200px] sm:max-w-xs"
                title={guild.name}
              >
                {guild.name}
              </span>
              <button
                type="button"
                onClick={copySnowflake}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                title="Copy Discord Snowflake ID"
              >
                <span>ID: {guild.id}</span>
                {copiedId ? (
                  <Check className="h-2.5 w-2.5 text-emerald-500" />
                ) : (
                  <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          {guild.owner ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 dark:text-amber-400 border border-amber-500/20">
              <Crown className="h-3 w-3" /> Owner
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
              <Shield className="h-3 w-3" /> Manager
            </span>
          )}
        </td>
        <td className="py-3 px-4">
          <Badge
            id={`guild-connection-badge-${guild.id}`}
            variant={guild.connected ? "success" : "secondary"}
            className="text-[11px] px-2 py-0"
          >
            {guild.connected ? "Connected" : "Not Connected"}
          </Badge>
        </td>
        <td className="py-3 px-4 text-xs text-muted-foreground">
          {guild.connected ? (
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span>{guild.botName ?? "Active Bot"}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/60">Unassigned</span>
          )}
        </td>
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-2">
            {!guild.connected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="h-8 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Wizard</span>
              </Button>
            )}
            <Button
              id={`connect-guild-button-${guild.id}`}
              onClick={handleConnect}
              disabled={loading}
              variant={guild.connected ? "default" : "secondary"}
              size="sm"
              className="h-8 text-xs font-medium flex items-center gap-1.5"
            >
              {loading ? (
                "Connecting..."
              ) : guild.connected ? (
                <>
                  <span>Open Console</span>
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
          {error && <div className="text-[11px] text-destructive mt-1 text-right">{error}</div>}
        </td>
      </tr>
    );
  }

  // Bespoke CreatorCore Command Deck Card View
  return (
    <li
      id={`guild-item-${guild.id}`}
      data-testid="guild-item"
      data-guild-id={guild.id}
      className="list-none group relative flex flex-col justify-between rounded-xl border border-border/70 bg-card p-5 shadow-xs transition-all duration-200 hover:border-foreground/30 hover:shadow-md hover:-translate-y-0.5"
    >
      {/* Subtle State Edge Indicator */}
      <div
        className={`absolute left-0 top-3.5 bottom-3.5 w-1 rounded-r-full transition-colors ${
          guild.connected ? "bg-emerald-500" : "bg-muted-foreground/20 group-hover:bg-muted-foreground/40"
        }`}
      />

      <div>
        {/* Card Header: Squircle Avatar & Identity */}
        <div className="flex items-start gap-3.5">
          <div className="relative h-12 w-12 shrink-0 rounded-xl overflow-hidden border border-border/80 bg-secondary flex items-center justify-center shadow-xs">
            {iconUrl && !imageFailed ? (
              <img
                src={iconUrl}
                alt={guild.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-bold text-sm tracking-wider text-secondary-foreground bg-gradient-to-br from-secondary to-muted">
                {getGuildInitials(guild.name)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <h3
                id={`guild-name-${guild.id}`}
                className="font-bold text-base text-foreground tracking-tight truncate leading-tight"
                title={guild.name}
              >
                {guild.name}
              </h3>

              {guild.owner ? (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 dark:text-amber-400 border border-amber-500/20">
                  <Crown className="h-3 w-3" /> Owner
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
                  <Shield className="h-3 w-3" /> Manager
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={copySnowflake}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                title="Copy Discord Snowflake ID"
              >
                <span>ID: {guild.id}</span>
                {copiedId ? (
                  <Check className="h-2.5 w-2.5 text-emerald-500" />
                ) : (
                  <Copy className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Operational Intel Divider & Middle Section */}
        <div className="my-4 pt-3.5 border-t border-border/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Control Plane</span>
            {guild.connected ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-500">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Active Console</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
                <span>Ready to Provision</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Linked Bot</span>
            {guild.connected ? (
              <span className="font-semibold text-foreground flex items-center gap-1 truncate max-w-[170px]">
                <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{guild.botName ?? "Active Instance"}</span>
              </span>
            ) : (
              <span className="text-muted-foreground/60 italic text-[11px]">No bot instance</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-2 pt-3.5 border-t border-border/50">
        {error && (
          <div
            id={`guild-error-${guild.id}`}
            className="text-xs text-destructive mb-2 font-medium"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Badge
            id={`guild-connection-badge-${guild.id}`}
            variant={guild.connected ? "success" : "secondary"}
            className="text-[10px] px-2 py-0 font-medium"
          >
            {guild.connected ? "Connected" : "Not Connected"}
          </Badge>

          <div className="flex items-center gap-1.5">
            {!guild.connected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Launch setup wizard"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Wizard</span>
              </Button>
            )}

            <Button
              id={`connect-guild-button-${guild.id}`}
              onClick={handleConnect}
              disabled={loading}
              variant={guild.connected ? "default" : "secondary"}
              size="sm"
              className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              {loading ? (
                "Connecting..."
              ) : guild.connected ? (
                <>
                  <span>Open Console</span>
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
        </div>
      </div>

      {/* Bot Onboarding & Developer Portal Guide Wizard */}
      <BotOnboardingModal
        guild={guild}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </li>
  );
}
