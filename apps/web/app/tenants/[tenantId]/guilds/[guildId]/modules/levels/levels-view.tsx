"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Award,
  Zap,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  Users,
  Settings2,
  Clock,
  Sparkles,
  Loader2,
  AlertCircle,
  Hash,
  Mic,
  Gift,
  Rocket,
  Palette,
  Check,
} from "lucide-react";
import { saveLevelSettingsAction } from "@/app/actions";
import {
  DEFAULT_RANK_CARD_CONFIG,
  type LevelSettings,
  type LevelRoleReward,
  type UserXpRecord,
} from "@/lib/levels-storage";
import type { LiveDiscordChannel, LiveDiscordRole } from "../welcome/welcome-types";
import { getLevelProgress } from "@/lib/level-calculator";

interface LevelsViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
  initialSettings: LevelSettings;
  initialUsers: UserXpRecord[];
  liveChannels: LiveDiscordChannel[];
  liveRoles: LiveDiscordRole[];
}

export function LevelsView({
  tenantId,
  guildId,
  initialSettings,
  initialUsers,
  liveChannels,
  liveRoles,
}: LevelsViewProps) {
  const [activeTab, setActiveTab] = useState<"settings" | "card" | "rewards" | "leaderboard">("settings");

  // Form states
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [xpMin, setXpMin] = useState(initialSettings.xpMin ?? 15);
  const [xpMax, setXpMax] = useState(initialSettings.xpMax ?? 25);
  const [cooldownSeconds, setCooldownSeconds] = useState(initialSettings.cooldownSeconds ?? 60);
  const [announcementEnabled, setAnnouncementEnabled] = useState(initialSettings.announcementEnabled ?? true);
  const [announcementChannelId, setAnnouncementChannelId] = useState(
    initialSettings.announcementChannelId || (liveChannels[0]?.id ?? ""),
  );
  // Filter out any legacy fallback dummy roles (e.g. starting with r-)
  const initialCleanRewards = (initialSettings.roleRewards ?? []).filter(
    (r) => r && !r.roleId.startsWith("r-"),
  );
  const [roleRewards, setRoleRewards] = useState<LevelRoleReward[]>(initialCleanRewards);
  const [roleRewardsEnabled, setRoleRewardsEnabled] = useState(
    initialSettings.roleRewardsEnabled ?? (initialCleanRewards.length > 0),
  );

  // Voice, Booster & Daily states
  const [voiceXpEnabled, setVoiceXpEnabled] = useState(initialSettings.voiceXpEnabled ?? false);
  const [voiceXpPerInterval, setVoiceXpPerInterval] = useState(initialSettings.voiceXpPerInterval ?? 10);
  const [voiceIntervalMinutes, setVoiceIntervalMinutes] = useState(initialSettings.voiceIntervalMinutes ?? 5);
  const [boosterMultiplierEnabled, setBoosterMultiplierEnabled] = useState(initialSettings.boosterMultiplierEnabled ?? true);
  const [boosterMultiplier, setBoosterMultiplier] = useState(initialSettings.boosterMultiplier ?? 1.5);
  const [dailyXpEnabled, setDailyXpEnabled] = useState(initialSettings.dailyXpEnabled ?? true);
  const [dailyXpAmount, setDailyXpAmount] = useState(initialSettings.dailyXpAmount ?? 100);

  // Rank Card customization state
  const initialRankCard = initialSettings.rankCard ?? DEFAULT_RANK_CARD_CONFIG;
  const [cardEnabled, setCardEnabled] = useState(initialRankCard.enabled ?? true);
  const [cardPreset, setCardPreset] = useState<"landscape" | "ocean" | "midnight" | "blurple">(
    initialRankCard.preset ?? "landscape",
  );
  const [cardProgressBarColor, setCardProgressBarColor] = useState(
    initialRankCard.progressBarColor ?? "#5865f2",
  );
  const [cardCircleColor, setCardCircleColor] = useState(
    initialRankCard.circleColor ?? "#5865f2",
  );
  const [cardTextColor, setCardTextColor] = useState(
    initialRankCard.textColor ?? "#ffffff",
  );
  const [cardBarTextColor, setCardBarTextColor] = useState(
    initialRankCard.barTextColor ?? "#ffffff",
  );

  // New reward builder state
  const [newRewardLevel, setNewRewardLevel] = useState<number>(5);
  const [newRewardRoleId, setNewRewardRoleId] = useState<string>(liveRoles[0]?.id ?? "");

  // Save feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAddReward = () => {
    if (!newRewardRoleId) return;
    const selectedRole = liveRoles.find((r) => r.id === newRewardRoleId);
    const cleanName = selectedRole ? selectedRole.name.replace(/^@/, "") : `Role-${newRewardRoleId}`;
    const roleName = `@${cleanName}`;

    // Prevent duplicate level rewards
    if (roleRewards.some((r) => r.level === newRewardLevel)) {
      setErrorMessage(`A reward for Level ${newRewardLevel} already exists.`);
      return;
    }

    const updated = [...roleRewards, { level: newRewardLevel, roleId: newRewardRoleId, roleName }].sort(
      (a, b) => a.level - b.level,
    );
    setRoleRewards(updated);
    setErrorMessage(null);
  };

  const handleRemoveReward = (level: number) => {
    setRoleRewards(roleRewards.filter((r) => r.level !== level));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    const ch = liveChannels.find((c) => c.id === announcementChannelId);
    const payload: LevelSettings = {
      enabled,
      xpMin: Number(xpMin) || 15,
      xpMax: Number(xpMax) || 25,
      cooldownSeconds: Number(cooldownSeconds) || 60,
      announcementEnabled,
      announcementChannelId: announcementChannelId || undefined,
      announcementChannelName: ch ? `#${ch.name.replace(/^#/, "")}` : undefined,
      ignoredChannelIds: initialSettings.ignoredChannelIds ?? [],
      roleRewardsEnabled,
      roleRewards,
      voiceXpEnabled,
      voiceXpPerInterval: Number(voiceXpPerInterval) || 10,
      voiceIntervalMinutes: Number(voiceIntervalMinutes) || 5,
      boosterMultiplierEnabled,
      boosterMultiplier: Number(boosterMultiplier) || 1.5,
      dailyXpEnabled,
      dailyXpAmount: Number(dailyXpAmount) || 100,
      rankCard: {
        enabled: cardEnabled,
        preset: cardPreset,
        progressBarColor: cardProgressBarColor,
        circleColor: cardCircleColor,
        textColor: cardTextColor,
        barTextColor: cardBarTextColor,
      },
    };

    try {
      const res = await saveLevelSettingsAction(tenantId, guildId, payload);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setErrorMessage(res.error || "Failed to save leveling settings");
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  // Sort leaderboard descending by XP
  const sortedUsers = [...initialUsers].sort((a, b) => b.xp - a.xp);

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">XP & Leveling System</h1>
            <Badge variant={enabled ? "default" : "secondary"} className={enabled ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : ""}>
              {enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Reward chat activity with XP points, milestone Discord roles, and public server leaderboards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2 shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{isSaving ? "Saving..." : "Save Changes"}</span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Leveling configuration saved and synced with Discord bot!</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Navigation Pills */}
      <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/40 border border-border w-fit">
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "settings"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Configuration</span>
        </button>

        <button
          onClick={() => setActiveTab("card")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "card"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          <span>Rank Card</span>
        </button>

        <button
          onClick={() => setActiveTab("rewards")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "rewards"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Award className="h-3.5 w-3.5" />
          <span>Role Rewards ({roleRewards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "leaderboard"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="h-3.5 w-3.5" />
          <span>Server Leaderboard ({sortedUsers.length})</span>
        </button>
      </div>

      {/* TAB 1: CONFIGURATION */}
      {activeTab === "settings" && (
        <div className="space-y-5">
          {/* Master Enable Switch */}
          <Card className="border-border">
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-foreground">Enable Leveling & XP</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, non-bot messages award XP points and unlock milestone roles.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </CardContent>
          </Card>

          {/* XP Calculation & Cooldown Settings */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span>Message XP & Cooldown Rules</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Configure random XP bounds awarded per message and anti-spam rate limiting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="xp-min" className="text-xs font-medium">
                    Min XP Per Message
                  </Label>
                  <Input
                    id="xp-min"
                    type="number"
                    min={1}
                    max={100}
                    value={xpMin}
                    onChange={(e) => setXpMin(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Default: 15 XP</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="xp-max" className="text-xs font-medium">
                    Max XP Per Message
                  </Label>
                  <Input
                    id="xp-max"
                    type="number"
                    min={1}
                    max={200}
                    value={xpMax}
                    onChange={(e) => setXpMax(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Default: 25 XP</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="xp-cooldown" className="text-xs font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    Cooldown (Seconds)
                  </Label>
                  <Input
                    id="xp-cooldown"
                    type="number"
                    min={5}
                    max={3600}
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">1 message per 60s</p>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
                📐 <strong>Level Formula:</strong> <code className="text-foreground font-mono">Total XP = 100 × Level²</code>.
                Example: Level 1 = 100 XP, Level 5 = 2,500 XP, Level 10 = 10,000 XP.
              </div>
            </CardContent>
          </Card>

          {/* Level-Up Announcement Settings */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <span>Level-Up Announcements</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Post celebratory embeds when members level up in the community.
                  </CardDescription>
                </div>
                <Switch checked={announcementEnabled} onCheckedChange={setAnnouncementEnabled} />
              </div>
            </CardHeader>

            {announcementEnabled && (
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="announcement-channel" className="text-xs font-medium">
                    Announcement Channel
                  </Label>
                  {liveChannels.length > 0 ? (
                    <select
                      id="announcement-channel"
                      value={announcementChannelId}
                      onChange={(e) => setAnnouncementChannelId(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Post in the same channel where user chatted</option>
                      {liveChannels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          #{ch.name.replace(/^#/, "")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-md border border-border bg-muted/20">
                      <Hash className="h-3.5 w-3.5" />
                      <span>Bot will announce in the same channel where the user chats.</span>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Voice Channel XP Settings */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Mic className="h-4 w-4 text-emerald-400" />
                    <span>Voice Channel XP</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Reward active voice channel discussions with periodic XP points.
                  </CardDescription>
                </div>
                <Switch checked={voiceXpEnabled} onCheckedChange={setVoiceXpEnabled} />
              </div>
            </CardHeader>

            {voiceXpEnabled && (
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="voice-xp" className="text-xs font-medium">
                      XP Awarded Per Interval
                    </Label>
                    <Input
                      id="voice-xp"
                      type="number"
                      min={1}
                      max={100}
                      value={voiceXpPerInterval}
                      onChange={(e) => setVoiceXpPerInterval(Number(e.target.value))}
                      className="text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Default: 10 XP</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="voice-interval" className="text-xs font-medium">
                      Voice Interval (Minutes)
                    </Label>
                    <Input
                      id="voice-interval"
                      type="number"
                      min={1}
                      max={60}
                      value={voiceIntervalMinutes}
                      onChange={(e) => setVoiceIntervalMinutes(Number(e.target.value))}
                      className="text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Every 5 minutes active</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border bg-muted/20 text-[11px] text-muted-foreground">
                  🛡️ <strong>Anti-AFK Protection:</strong> Members who are server-deafened or self-deafened are automatically skipped.
                </div>
              </CardContent>
            )}
          </Card>

          {/* XP Multipliers & Daily Bonus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nitro Booster Bonus */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-purple-400" />
                      <span>Server Booster Multiplier</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Bonus XP for Nitro Boosters.
                    </CardDescription>
                  </div>
                  <Switch
                    checked={boosterMultiplierEnabled}
                    onCheckedChange={setBoosterMultiplierEnabled}
                  />
                </div>
              </CardHeader>
              {boosterMultiplierEnabled && (
                <CardContent className="pt-0 space-y-1.5">
                  <Label htmlFor="booster-multiplier" className="text-xs font-medium">
                    Multiplier Value
                  </Label>
                  <select
                    id="booster-multiplier"
                    value={boosterMultiplier}
                    onChange={(e) => setBoosterMultiplier(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value={1.25}>1.25x (+25% bonus XP)</option>
                    <option value={1.5}>1.50x (+50% bonus XP - Recommended)</option>
                    <option value={1.75}>1.75x (+75% bonus XP)</option>
                    <option value={2.0}>2.00x (Double XP)</option>
                  </select>
                </CardContent>
              )}
            </Card>

            {/* Daily XP Command */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Gift className="h-4 w-4 text-emerald-400" />
                      <span>Daily Reward (/daily)</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Allow members to claim free daily XP.
                    </CardDescription>
                  </div>
                  <Switch checked={dailyXpEnabled} onCheckedChange={setDailyXpEnabled} />
                </div>
              </CardHeader>
              {dailyXpEnabled && (
                <CardContent className="pt-0 space-y-1.5">
                  <Label htmlFor="daily-amount" className="text-xs font-medium">
                    Daily Bonus Amount
                  </Label>
                  <Input
                    id="daily-amount"
                    type="number"
                    min={10}
                    max={1000}
                    value={dailyXpAmount}
                    onChange={(e) => setDailyXpAmount(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Default: 100 XP per 24 hours</p>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB: RANK CARD CUSTOMIZER */}
      {activeTab === "card" && (
        <div className="space-y-6">
          {/* Top Live Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  <span>Interactive Card Preview</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Real-time preview of how <code className="text-indigo-400 font-mono">/rank</code> appears to Discord members.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono">
                800 × 260 PNG Canvas
              </Badge>
            </div>

            {/* The Live Rendered Card */}
            <div className="relative w-full max-w-3xl mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-2xl p-6 select-none transition-all">
              {/* Dynamic Preset Background */}
              {cardPreset === "landscape" && (
                <div className="absolute inset-0 bg-gradient-to-br from-[#071524] via-[#0e263d] to-[#05101a]">
                  <div className="absolute top-1/4 left-1/3 w-64 h-32 bg-sky-500/15 rounded-full blur-2xl" />
                  <div className="absolute top-1/3 left-1/2 w-48 h-24 bg-indigo-500/10 rounded-full blur-xl" />
                  <div className="absolute top-4 left-12 w-1 h-1 bg-white/80 rounded-full" />
                  <div className="absolute top-8 left-36 w-1.5 h-1.5 bg-white/90 rounded-full" />
                  <div className="absolute top-14 left-72 w-1 h-1 bg-white/60 rounded-full" />
                  <div className="absolute top-6 right-32 w-1 h-1 bg-white/70 rounded-full" />
                  <div className="absolute top-12 right-16 w-1.5 h-1.5 bg-white/90 rounded-full" />
                  <div className="absolute bottom-16 left-24 w-1 h-1 bg-white/50 rounded-full" />
                  <div className="absolute bottom-14 right-48 w-1 h-1 bg-white/70 rounded-full" />
                  <svg className="absolute bottom-0 left-0 right-0 w-full h-16 text-[#030a11]/90" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d="M0,100 L0,50 Q25,20 50,45 T100,35 L100,100 Z" fill="currentColor" />
                  </svg>
                  <svg className="absolute bottom-0 left-0 right-0 w-full h-12 text-[#02060a]" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d="M0,100 L0,60 Q35,30 70,55 T100,50 L100,100 Z" fill="currentColor" />
                  </svg>
                </div>
              )}

              {cardPreset === "ocean" && (
                <div className="absolute inset-0 bg-gradient-to-br from-[#050e1d] via-[#0b1d3a] to-[#030812]">
                  <div className="absolute top-5 right-24 w-9 h-9 bg-slate-100 rounded-full shadow-[0_0_25px_rgba(200,230,255,0.4)]" />
                  <div className="absolute bottom-10 inset-x-0 h-0.5 bg-sky-400/10" />
                </div>
              )}

              {cardPreset === "midnight" && (
                <div className="absolute inset-0 bg-gradient-to-br from-[#0a0c10] via-[#151821] to-[#08090d]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0,transparent_70%)]" />
                </div>
              )}

              {cardPreset === "blurple" && (
                <div className="absolute inset-0 bg-gradient-to-br from-[#131326] via-[#252254] to-[#363273]">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#5865f2]/20 rounded-full blur-3xl" />
                </div>
              )}

              {/* Foreground Card Content */}
              <div className="relative z-10 flex flex-col gap-4">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  {/* Left: Avatar with Glowing Circle Ring & Name */}
                  <div className="flex items-center gap-4">
                    <div
                      className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full p-1 transition-all duration-300"
                      style={{
                        boxShadow: `0 0 16px ${cardCircleColor}99`,
                      }}
                    >
                      <div
                        className="w-full h-full rounded-full border-3 overflow-hidden bg-black/40 flex items-center justify-center"
                        style={{ borderColor: cardCircleColor }}
                      >
                        <div className="w-full h-full bg-linear-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                          <Users className="h-8 w-8 text-white/90" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xl sm:text-2xl font-bold tracking-tight block transition-colors" style={{ color: cardTextColor }}>
                        Assistance
                      </span>
                      <span className="text-[11px] font-mono opacity-60 block" style={{ color: cardTextColor }}>
                        CreatorCore Member
                      </span>
                    </div>
                  </div>

                  {/* Right Badges */}
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase block opacity-60" style={{ color: cardTextColor }}>
                        RANK
                      </span>
                      <span className="text-xl sm:text-2xl font-extrabold font-mono" style={{ color: cardTextColor }}>
                        #1
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase block opacity-60" style={{ color: cardTextColor }}>
                        LVL
                      </span>
                      <span className="text-xl sm:text-2xl font-extrabold font-mono" style={{ color: cardTextColor }}>
                        10
                      </span>
                    </div>
                  </div>
                </div>

                {/* Glassmorphism Stats Box */}
                <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-black/45 border border-white/10 backdrop-blur-xs text-center">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider block opacity-55" style={{ color: cardTextColor }}>
                      TOTAL XP
                    </span>
                    <span className="text-xs sm:text-sm font-bold font-mono" style={{ color: cardTextColor }}>
                      4,250
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider block opacity-55" style={{ color: cardTextColor }}>
                      CURRENT XP
                    </span>
                    <span className="text-xs sm:text-sm font-bold font-mono" style={{ color: cardTextColor }}>
                      835 XP
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider block opacity-55" style={{ color: cardTextColor }}>
                      TARGET
                    </span>
                    <span className="text-xs sm:text-sm font-bold font-mono" style={{ color: cardTextColor }}>
                      925 XP
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider block opacity-55" style={{ color: cardTextColor }}>
                      POSITION
                    </span>
                    <span className="text-xs sm:text-sm font-bold font-mono" style={{ color: cardTextColor }}>
                      #1 of 1
                    </span>
                  </div>
                </div>

                {/* Progress Bar Section */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-bold font-mono">
                    <span style={{ color: cardTextColor }}>835 / 925 XP</span>
                    <span style={{ color: cardTextColor }}>90%</span>
                  </div>
                  <div className="w-full h-6 rounded-full bg-white/15 p-0.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 flex items-center justify-center font-bold text-[10px] font-mono shadow-xs"
                      style={{
                        width: "90%",
                        backgroundColor: cardProgressBarColor,
                        color: cardBarTextColor,
                      }}
                    >
                      90%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Master Enable Card for Image Card */}
          <Card className="border-border">
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-foreground">
                    Enable High-Resolution Canvas Card
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, /rank generates and attaches the graphical Rank Card image. When disabled, it falls back to the classic text embed.
                </p>
              </div>
              <Switch checked={cardEnabled} onCheckedChange={setCardEnabled} />
            </CardContent>
          </Card>

          {/* Background Preset Selector */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <span>Card Background Wallpaper</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Choose one of 4 curated backgrounds or themes for your server's rank cards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    id: "landscape" as const,
                    name: "Cosmic Landscape",
                    desc: "Starry sky & mountains",
                    bgClass: "from-[#071524] via-[#0e263d] to-[#05101a]",
                  },
                  {
                    id: "ocean" as const,
                    name: "Midnight Ocean",
                    desc: "Deep sea & moon",
                    bgClass: "from-[#050e1d] via-[#0b1d3a] to-[#030812]",
                  },
                  {
                    id: "midnight" as const,
                    name: "Obsidian Carbon",
                    desc: "Dark minimalist slate",
                    bgClass: "from-[#0a0c10] via-[#151821] to-[#08090d]",
                  },
                  {
                    id: "blurple" as const,
                    name: "Discord Blurple",
                    desc: "Vibrant indigo & violet",
                    bgClass: "from-[#131326] via-[#252254] to-[#363273]",
                  },
                ].map((preset) => {
                  const isSelected = cardPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCardPreset(preset.id)}
                      className={`relative flex flex-col text-left rounded-xl p-3 border transition-all overflow-hidden ${
                        isSelected
                          ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-500/5 shadow-md"
                          : "border-border hover:border-border/80 bg-card hover:bg-muted/20"
                      }`}
                    >
                      <div
                        className={`w-full h-14 rounded-lg bg-linear-to-br ${preset.bgClass} border border-white/10 mb-2 relative overflow-hidden flex items-center justify-center`}
                      >
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-foreground">{preset.name}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Color Customization Panel */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <span>Theme Colors & Accents</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Fine-tune progress bar, avatar glow ring, and typography colors to match your server branding.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Progress Bar Color */}
                <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Progress Bar Color</Label>
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: cardProgressBarColor }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cardProgressBarColor}
                      onChange={(e) => setCardProgressBarColor(e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={cardProgressBarColor}
                      onChange={(e) => setCardProgressBarColor(e.target.value)}
                      className="text-xs font-mono h-8 flex-1 uppercase"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    {["#5865f2", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"].map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setCardProgressBarColor(swatch)}
                        className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                        style={{ backgroundColor: swatch }}
                        title={swatch}
                      />
                    ))}
                  </div>
                </div>

                {/* Circle Glow Color */}
                <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Avatar Ring Glow</Label>
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: cardCircleColor }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cardCircleColor}
                      onChange={(e) => setCardCircleColor(e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={cardCircleColor}
                      onChange={(e) => setCardCircleColor(e.target.value)}
                      className="text-xs font-mono h-8 flex-1 uppercase"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    {["#5865f2", "#38bdf8", "#10b981", "#f59e0b", "#ec4899", "#a855f7"].map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setCardCircleColor(swatch)}
                        className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                        style={{ backgroundColor: swatch }}
                        title={swatch}
                      />
                    ))}
                  </div>
                </div>

                {/* Text Color */}
                <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Text Color</Label>
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: cardTextColor }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cardTextColor}
                      onChange={(e) => setCardTextColor(e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={cardTextColor}
                      onChange={(e) => setCardTextColor(e.target.value)}
                      className="text-xs font-mono h-8 flex-1 uppercase"
                    />
                  </div>
                </div>

                {/* Bar Text Color */}
                <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Progress Bar Text Color</Label>
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: cardBarTextColor }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cardBarTextColor}
                      onChange={(e) => setCardBarTextColor(e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={cardBarTextColor}
                      onChange={(e) => setCardBarTextColor(e.target.value)}
                      className="text-xs font-mono h-8 flex-1 uppercase"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: ROLE REWARDS */}
      {activeTab === "rewards" && (
        <div className="space-y-5">
          {/* Master Toggle for Role Rewards */}
          <Card className="border-border">
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-foreground">
                    Enable Milestone Role Rewards
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatically grant Discord roles when members achieve milestone levels. If disabled, members level up without receiving roles.
                </p>
              </div>
              <Switch checked={roleRewardsEnabled} onCheckedChange={setRoleRewardsEnabled} />
            </CardContent>
          </Card>

          {roleRewardsEnabled ? (
            <>
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    <span>Add Milestone Role Reward</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Select a milestone level and pick an existing Discord server role to grant automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-end gap-3 p-3 rounded-lg border border-border bg-muted/20">
                    <div className="space-y-1.5 w-full sm:w-32">
                      <Label htmlFor="reward-level" className="text-xs font-medium">
                        Milestone Level
                      </Label>
                      <Input
                        id="reward-level"
                        type="number"
                        min={1}
                        max={100}
                        value={newRewardLevel}
                        onChange={(e) => setNewRewardLevel(Number(e.target.value))}
                        className="text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5 flex-1 w-full">
                      <Label htmlFor="reward-role" className="text-xs font-medium">
                        Discord Role
                      </Label>
                      {liveRoles.length > 0 ? (
                        <select
                          id="reward-role"
                          value={newRewardRoleId}
                          onChange={(e) => setNewRewardRoleId(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Select a Discord role...</option>
                          {liveRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              @{role.name.replace(/^@/, "")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          id="reward-role"
                          placeholder="Role ID (e.g. 14081512...)"
                          value={newRewardRoleId}
                          onChange={(e) => setNewRewardRoleId(e.target.value)}
                          className="text-xs font-mono"
                        />
                      )}
                    </div>

                    <Button
                      onClick={handleAddReward}
                      size="sm"
                      className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Reward</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Rewards List */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Active Milestone Roles</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {roleRewards.length} Configured
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {roleRewards.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      No role rewards configured yet. Choose a milestone level and select a role above to add your first reward!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {roleRewards.map((reward) => (
                        <div
                          key={reward.level}
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Badge className="bg-indigo-500/15 text-indigo-400 border-indigo-500/30 font-mono text-xs px-2.5 py-0.5">
                              Level {reward.level}
                            </Badge>
                            <span className="text-xs font-semibold text-foreground">
                              {reward.roleName.startsWith("@") ? reward.roleName : `@${reward.roleName}`}
                            </span>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveReward(reward.level)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed border-border bg-muted/10">
              <CardContent className="p-8 text-center space-y-2">
                <Award className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <h3 className="text-xs font-semibold text-foreground">Role Rewards Disabled</h3>
                <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                  Members will level up and rank on the leaderboard based on XP, but no Discord roles will be granted. Turn on the switch above if you want to assign milestone roles.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: LEADERBOARD */}
      {activeTab === "leaderboard" && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span>Server XP Leaderboard</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time member activity rankings based on chat engagement.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {sortedUsers.length} Ranked Members
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {sortedUsers.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground border border-dashed border-border rounded-lg space-y-2">
                <Users className="h-6 w-6 mx-auto opacity-40" />
                <p>No chat activity recorded yet.</p>
                <p className="text-[11px]">When members chat in text channels, their XP and rankings will appear here!</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sortedUsers.slice(0, 25).map((user, idx) => {
                  const progress = getLevelProgress(user.xp);
                  const isPodium = idx < 3;
                  const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;

                  return (
                    <div key={user.userId} className="flex items-center justify-between py-3 px-2 gap-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold font-mono w-7 text-center ${isPodium ? "text-lg" : "text-muted-foreground"}`}>
                          {medal}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {user.username || `User-${user.userId.slice(-4)}`}
                            </span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                              Lvl {user.level}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {user.xp.toLocaleString()} Total XP • {progress.percentage}% to Level {user.level + 1}
                          </p>
                        </div>
                      </div>

                      <div className="w-32 hidden sm:block text-right">
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${progress.percentage}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground font-mono mt-1 block">
                          {progress.progressXp} / {progress.neededXp} XP
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
