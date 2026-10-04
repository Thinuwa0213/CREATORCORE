"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Server,
  Search,
  LayoutGrid,
  Rows3,
  X,
  CheckCircle2,
  Clock,
  Crown,
} from "lucide-react";
import { GuildCard, type GuildItem } from "../components/guild-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type FilterTab = "all" | "connected" | "unassigned" | "owned";
type ViewMode = "grid" | "table";

export function GuildsCommandDeck({ initialGuilds }: { initialGuilds: GuildItem[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global hotkey: '/' focuses the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const stats = useMemo(() => {
    const total = initialGuilds.length;
    const connected = initialGuilds.filter((g) => g.connected).length;
    const unassigned = total - connected;
    const owned = initialGuilds.filter((g) => g.owner).length;
    return { total, connected, unassigned, owned };
  }, [initialGuilds]);

  const filteredGuilds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return initialGuilds.filter((guild) => {
      // Tab filter
      if (activeTab === "connected" && !guild.connected) return false;
      if (activeTab === "unassigned" && guild.connected) return false;
      if (activeTab === "owned" && !guild.owner) return false;

      // Text query filter (name or snowflake ID)
      if (query) {
        const matchesName = guild.name.toLowerCase().includes(query);
        const matchesId = guild.id.toLowerCase().includes(query);
        return matchesName || matchesId;
      }

      return true;
    });
  }, [initialGuilds, searchQuery, activeTab]);

  return (
    <div className="space-y-6">
      {/* 1. Quick Stats Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Discovered Guilds</span>
            <Server className="h-4 w-4 opacity-70" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {stats.total}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Active Control Planes</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 opacity-80" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-500">
            {stats.connected}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Ready to Deploy</span>
            <Clock className="h-4 w-4 text-muted-foreground opacity-70" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-muted-foreground">
            {stats.unassigned}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-medium">Server Ownership</span>
            <Crown className="h-4 w-4 text-amber-500 opacity-80" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-500 dark:text-amber-400">
            {stats.owned}
          </div>
        </div>
      </div>

      {/* 2. Operations Toolbar: Search + Filter Tabs + View Mode */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search servers by name or Snowflake ID..."
            className="pl-9 pr-14 h-9 bg-card text-sm border-border/70 shadow-2xs"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              /
            </kbd>
          )}
        </div>

        {/* Filter Pills & View Switcher */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          {/* Filter Pills */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === "all"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("connected")}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "connected"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span>Active ({stats.connected})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("unassigned")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === "unassigned"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Available ({stats.unassigned})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("owned")}
              className={`px-2.5 py-1 rounded-md transition-all hidden md:inline-flex items-center gap-1 ${
                activeTab === "owned"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Crown className="h-3 w-3 text-amber-500" />
              <span>Owned ({stats.owned})</span>
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Command Deck Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "table"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Operations Table View"
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Empty Search / Filter State */}
      {filteredGuilds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-12 text-center">
          <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="font-semibold text-foreground text-base">No matching servers found</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No servers match your search query "${searchQuery}".`
              : "No servers match the selected filter tab."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="text-xs"
              >
                Clear Search
              </Button>
            )}
            {activeTab !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("all")}
                className="text-xs"
              >
                Show All Servers
              </Button>
            )}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* 4. Command Deck Responsive Grid View */
        <ul
          id="manageable-guilds-list"
          className="p-0 m-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {filteredGuilds.map((guild) => (
            <GuildCard key={guild.id} guild={guild} viewMode="grid" />
          ))}
        </ul>
      ) : (
        /* 5. Compact Operations Table View */
        <div
          id="manageable-guilds-list"
          className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-2xs"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/80 bg-muted/40 text-muted-foreground text-xs font-semibold">
                <tr>
                  <th className="py-3 px-4">Discord Server</th>
                  <th className="py-3 px-4">Authority</th>
                  <th className="py-3 px-4">Connection</th>
                  <th className="py-3 px-4">Linked Bot</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredGuilds.map((guild) => (
                  <GuildCard key={guild.id} guild={guild} viewMode="table" />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
