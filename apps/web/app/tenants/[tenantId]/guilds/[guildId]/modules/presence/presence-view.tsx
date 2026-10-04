"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  CheckCircle2,
  Bot,
  Activity,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Play,
  Pause,
  Radio,
  Gamepad2,
  Headphones,
  Tv,
  Trophy,
} from "lucide-react";

export type ActivityType = "WATCHING" | "PLAYING" | "LISTENING" | "STREAMING" | "COMPETING";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  text: string;
  streamUrl?: string;
}

interface PresenceViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
  botName?: string;
}

export function PresenceView({
  tenantId,
  guildId: _guildId,
  currentPlan,
  botName = "CreatorBot",
}: PresenceViewProps) {
  // Plan limits: Free = 2, Pro = 5, Enterprise = 10
  const maxActivitiesMap: Record<"FREE" | "PRO" | "ENTERPRISE", number> = {
    FREE: 2,
    PRO: 5,
    ENTERPRISE: 10,
  };
  const maxAllowed = maxActivitiesMap[currentPlan];

  // Activities list
  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: "act-1",
      type: "WATCHING",
      text: "14,200+ Members • /help",
    },
    {
      id: "act-2",
      type: "PLAYING",
      text: "Serving Discord Communities",
    },
  ]);

  // Global presence state
  const [statusMode, setStatusMode] = useState<"online" | "idle" | "dnd">("online");
  const [rotationInterval, setRotationInterval] = useState<number>(60);
  const [saved, setSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Live cycling preview index in Discord Mini-Profile card
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);

  // Auto-cycle the preview in the card every 3.5s
  useEffect(() => {
    if (!isPreviewPlaying || activities.length <= 1) return;
    const interval = setInterval(() => {
      setActivePreviewIndex((prev) => (prev + 1) % activities.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [isPreviewPlaying, activities.length]);

  // Ensure activePreviewIndex is always within bounds
  useEffect(() => {
    if (activePreviewIndex >= activities.length) {
      setActivePreviewIndex(0);
    }
  }, [activities.length, activePreviewIndex]);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleAddActivity = () => {
    if (activities.length >= maxAllowed) return;
    const newId = `act-${Date.now()}`;
    const newActivity: ActivityItem = {
      id: newId,
      type: "PLAYING",
      text: "New Rotating Status",
    };
    setActivities([...activities, newActivity]);
  };

  const handleRemoveActivity = (id: string) => {
    if (activities.length <= 1) return; // Keep at least one
    setActivities(activities.filter((item) => item.id !== id));
  };

  const handleUpdateActivity = (id: string, updates: Partial<ActivityItem>) => {
    setActivities(
      activities.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const handleSave = () => {
    setIsPending(true);
    setTimeout(() => {
      setIsPending(false);
      setSaved(true);
      setCooldownSeconds(60); // 60s cooldown to safeguard Discord Gateway rate-limit
      setTimeout(() => setSaved(false), 4000);
    }, 900);
  };

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case "WATCHING":
        return <Tv className="h-3.5 w-3.5 text-primary" />;
      case "PLAYING":
        return <Gamepad2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "LISTENING":
        return <Headphones className="h-3.5 w-3.5 text-amber-500" />;
      case "STREAMING":
        return <Radio className="h-3.5 w-3.5 text-purple-500" />;
      case "COMPETING":
        return <Trophy className="h-3.5 w-3.5 text-rose-500" />;
    }
  };

  const currentPreviewActivity: ActivityItem = activities[activePreviewIndex] ?? activities[0] ?? {
    id: "fallback",
    type: "WATCHING",
    text: "Serving Discord Communities",
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Rich Presence &amp; Activities
                </h1>
                <Badge
                  variant={currentPlan === "FREE" ? "secondary" : "default"}
                  className="text-[10px] font-mono font-bold"
                >
                  {currentPlan}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure dynamic rotating Rich Presence activities displayed underneath the bot&apos;s username in Discord.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isPending || cooldownSeconds > 0}
            className="gap-2 shadow-xs"
          >
            <Save className="h-4 w-4" />
            <span>
              {isPending
                ? "Applying..."
                : cooldownSeconds > 0
                  ? `Cooldown (${cooldownSeconds}s)`
                  : "Apply Presence"}
            </span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Discord Gateway presence successfully updated and rotation cycle deployed!</span>
        </div>
      )}

      {/* Plan Quota & Gateway Safety Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Quota card */}
        <Card className="border-border bg-card/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Rotating Status Slots</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {activities.length} of {maxAllowed} allowed on {currentPlan} plan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {activities.length} / {maxAllowed}
              </Badge>
              {currentPlan !== "ENTERPRISE" && (
                <Button variant="ghost" size="sm" asChild className="h-7 text-[11px] px-2 text-primary">
                  <a href={`/tenants/${tenantId}/billing`}>
                    Upgrade {currentPlan === "FREE" ? "to Pro (5 slots)" : "to Enterprise (10 slots)"} &rarr;
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gateway Rate-limit card */}
        <Card className="border-border bg-card/60">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Clock className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                Discord Gateway Safety
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Max 5 updates/minute enforced by Discord. CreatorCore safely spaces out rotations.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Activity Controls (7 cols) */}
        <div className="md:col-span-7 space-y-5">
          {/* Global Gateway Status Card */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Global Gateway Presence
              </CardTitle>
              <CardDescription className="text-xs">
                Configure the bot&apos;s online status bubble and rotation frequency.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Online Indicator</Label>
                  <select
                    value={statusMode}
                    onChange={(e) => setStatusMode(e.target.value as "online" | "idle" | "dnd")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="online">🟢 Online (Green)</option>
                    <option value="idle">🟡 Idle (Yellow)</option>
                    <option value="dnd">🔴 Do Not Disturb (Red)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Rotation Speed</Label>
                  <select
                    value={rotationInterval}
                    onChange={(e) => setRotationInterval(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value={30}>Every 30 seconds</option>
                    <option value={60}>Every 60 seconds (Recommended)</option>
                    <option value={120}>Every 2 minutes</option>
                    <option value={300}>Every 5 minutes</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rotating Activities List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Rotating Activity Items
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  The bot will sequentially cycle through these activity messages.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddActivity}
                disabled={activities.length >= maxAllowed}
                className="gap-1.5 text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Status ({activities.length}/{maxAllowed})</span>
              </Button>
            </div>

            {/* List */}
            <div className="space-y-3">
              {activities.map((activity, index) => (
                <Card
                  key={activity.id}
                  className={`border-border transition-all ${
                    activePreviewIndex === index ? "ring-1 ring-primary/40 bg-card" : "bg-card/60"
                  }`}
                >
                  <CardContent className="p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground font-mono">
                          {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          {getActivityIcon(activity.type)}
                          <span>Status Slot {index + 1}</span>
                        </span>
                        {activePreviewIndex === index && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                            Active Preview
                          </Badge>
                        )}
                      </div>

                      {activities.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveActivity(activity.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      <div className="sm:col-span-4 space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Activity Type
                        </Label>
                        <select
                          value={activity.type}
                          onChange={(e) =>
                            handleUpdateActivity(activity.id, {
                              type: e.target.value as ActivityType,
                            })
                          }
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="WATCHING">Watching</option>
                          <option value="PLAYING">Playing</option>
                          <option value="LISTENING">Listening to</option>
                          <option value="STREAMING">Streaming</option>
                          <option value="COMPETING">Competing in</option>
                        </select>
                      </div>

                      <div className="sm:col-span-8 space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Status Message Text
                        </Label>
                        <Input
                          value={activity.text}
                          onChange={(e) =>
                            handleUpdateActivity(activity.id, { text: e.target.value })
                          }
                          placeholder="e.g. 14,000+ members • /help"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {activity.type === "STREAMING" && (
                      <div className="space-y-1 pt-1 border-t border-border/50">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Twitch or YouTube Stream URL
                        </Label>
                        <Input
                          value={activity.streamUrl || ""}
                          onChange={(e) =>
                            handleUpdateActivity(activity.id, { streamUrl: e.target.value })
                          }
                          placeholder="https://twitch.tv/..."
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {activities.length >= maxAllowed && currentPlan !== "ENTERPRISE" && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs">
                <span className="text-muted-foreground">
                  You have reached the maximum {maxAllowed} status slots for the {currentPlan} plan.
                </span>
                <Button variant="link" size="sm" asChild className="h-auto p-0 text-primary font-semibold">
                  <a href={`/tenants/${tenantId}/billing`}>
                    Upgrade for more &rarr;
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Live Discord User Profile Card Preview (5 cols) */}
        <div className="md:col-span-5 sticky top-6">
          <Card className="border-border shadow-md bg-card/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Discord Mini-Profile Preview
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
                    title={isPreviewPlaying ? "Pause cycle preview" : "Play cycle preview"}
                  >
                    {isPreviewPlaying ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {activePreviewIndex + 1} / {activities.length}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="rounded-xl border border-border/80 bg-[#111214] text-white overflow-hidden shadow-lg">
                {/* Top Banner */}
                <div className="h-16 w-full bg-[#5865F2] relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                </div>

                {/* Avatar with Status Bubble */}
                <div className="px-4 pb-4 space-y-3 relative">
                  <div className="relative -mt-8 inline-block">
                    <div className="h-16 w-16 rounded-full border-4 border-[#111214] overflow-hidden bg-[#2b2d31]">
                      <div className="h-full w-full flex items-center justify-center font-bold text-xs bg-[#5865F2] text-white">
                        <Bot className="h-7 w-7" />
                      </div>
                    </div>
                    {/* Status Dot */}
                    <div
                      className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-[#111214] ${
                        statusMode === "online"
                          ? "bg-[#23a55a]"
                          : statusMode === "idle"
                            ? "bg-[#f0b232]"
                            : "bg-[#f23f43]"
                      }`}
                    />
                  </div>

                  {/* Names */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-white tracking-tight">
                        {botName}
                      </span>
                      <span className="bg-[#5865F2] text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                        BOT
                      </span>
                    </div>
                    <span className="text-[11px] text-[#949ba4] font-mono block">
                      @{botName.toLowerCase().replace(/[^a-z0-9_]/g, "")}
                    </span>
                  </div>

                  <div className="h-px bg-[#2b2d31] my-2" />

                  {/* Dynamic Cycling Activity Display */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wider block">
                        Activity
                      </span>
                      <span className="text-[10px] text-[#949ba4] font-mono">
                        rotates every {rotationInterval}s
                      </span>
                    </div>

                    <div className="rounded bg-[#2b2d31] p-2.5 transition-all duration-300">
                      <p className="text-xs text-[#dbdee1] flex items-center gap-1.5 flex-wrap">
                        <span className="capitalize font-medium text-white flex items-center gap-1">
                          {getActivityIcon(currentPreviewActivity.type)}
                          <span>
                            {currentPreviewActivity.type === "LISTENING"
                              ? "Listening to"
                              : currentPreviewActivity.type === "COMPETING"
                                ? "Competing in"
                                : currentPreviewActivity.type.toLowerCase()}
                          </span>
                        </span>
                        <span className="font-semibold text-white">
                          {currentPreviewActivity.text || "..."}
                        </span>
                      </p>
                      {currentPreviewActivity.type === "STREAMING" && currentPreviewActivity.streamUrl && (
                        <p className="text-[10px] text-[#949ba4] truncate mt-1 font-mono">
                          {currentPreviewActivity.streamUrl}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cycle indicator dots */}
              {activities.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {activities.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActivePreviewIndex(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        activePreviewIndex === i
                          ? "w-4 bg-primary"
                          : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                      }`}
                    />
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Simulating live rotation on Discord. Click dots to preview specific status.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
