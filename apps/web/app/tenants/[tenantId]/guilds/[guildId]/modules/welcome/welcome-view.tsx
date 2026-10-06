"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  MessageSquare,
  UserPlus,
  CheckCircle2,
  Save,
  ShieldAlert,
  Palette,
  Loader2,
  AlertCircle,
  AtSign,
  Send,
  RefreshCw,
  Radio,
  Lock,
  ArrowRight,
} from "lucide-react";
import { WELCOME_VARIABLES } from "@/lib/template-variables";
import { VariableChips } from "@/components/modules/variable-chips";
import { saveWelcomeAction, refreshGuildDiscordResourcesAction } from "@/app/actions";
import {
  DEFAULT_WELCOME_CONFIG,
  type WelcomeConfig,
  type WelcomeBannerConfig,
  type LiveDiscordChannel,
  type LiveDiscordRole,
} from "./welcome-types";
import { DiscordWelcomeMockup } from "./discord-welcome-mockup";
import { BannerStudioModal } from "./banner-studio-modal";

interface WelcomeViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
  initialConfig?: WelcomeConfig;
  serverName?: string;
  botName?: string;
  botAvatarUrl?: string | null;
  liveChannels?: LiveDiscordChannel[];
  liveRoles?: LiveDiscordRole[];
  botRuntimeStatus?: string;
  isBotOnline?: boolean;
}

const FALLBACK_CHANNELS: LiveDiscordChannel[] = [
  { id: "c-welcome", name: "#welcome-and-rules", type: 0, position: 0 },
  { id: "c-general", name: "#general", type: 0, position: 1 },
  { id: "c-announcements", name: "#announcements", type: 5, position: 2 },
  { id: "c-lounge", name: "#lounge", type: 0, position: 3 },
];

const FALLBACK_ROLES: LiveDiscordRole[] = [
  { id: "r-member", name: "@Community Member", color: "#3B82F6", position: 10 },
  { id: "r-verified", name: "@Verified Citizen", color: "#10B981", position: 9 },
  { id: "r-gamer", name: "@Player", color: "#F59E0B", position: 8 },
];

export function WelcomeView({
  tenantId,
  guildId,
  currentPlan,
  initialConfig = DEFAULT_WELCOME_CONFIG,
  serverName = "Creator Realm",
  botName = "CreatorBot",
  botAvatarUrl = null,
  liveChannels = [],
  liveRoles = [],
  botRuntimeStatus = "ONLINE",
  isBotOnline = true,
}: WelcomeViewProps) {
  // Live channels & roles state
  const [channels, setChannels] = useState<LiveDiscordChannel[]>(
    liveChannels.length > 0 ? liveChannels : FALLBACK_CHANNELS,
  );
  const [roles, setRoles] = useState<LiveDiscordRole[]>(
    liveRoles.length > 0 ? liveRoles : FALLBACK_ROLES,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Config state
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [channelId, setChannelId] = useState(
    initialConfig.channelId || (liveChannels[0]?.id ?? "c-welcome"),
  );
  const [channelName, setChannelName] = useState(
    initialConfig.channelName || (liveChannels[0]?.name ?? "#welcome-and-rules"),
  );
  const [welcomeMessage, setWelcomeMessage] = useState(initialConfig.message);
  const [pingUser, setPingUser] = useState(initialConfig.pingUser);
  const [sendDm, setSendDm] = useState(initialConfig.sendDm);
  const [autoRoleEnabled, setAutoRoleEnabled] = useState(initialConfig.autoRoleEnabled);
  const [autoRoleId, setAutoRoleId] = useState(
    initialConfig.autoRoleId || (liveRoles[0]?.id ?? "r-member"),
  );
  const [autoRoleName, setAutoRoleName] = useState(
    initialConfig.autoRoleName || (liveRoles[0]?.name ?? "@Community Member"),
  );
  const [customCanvasCard, setCustomCanvasCard] = useState(initialConfig.customCanvasCard);
  const [bannerConfig, setBannerConfig] = useState<WelcomeBannerConfig>(initialConfig.bannerConfig);

  // Studio modal & save status
  const [studioOpen, setStudioOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // If live channels are provided and the stored channel is not in the list, auto-select first channel
  useEffect(() => {
    if (liveChannels.length > 0) {
      setChannels(liveChannels);
      const firstChannel = liveChannels[0];
      if (firstChannel && !liveChannels.some((c) => c.id === channelId)) {
        setChannelId(firstChannel.id);
        setChannelName(firstChannel.name);
      }
    }
  }, [liveChannels, channelId]);

  // If live roles are provided and the stored role is not in the list, auto-select first role
  useEffect(() => {
    if (liveRoles.length > 0) {
      setRoles(liveRoles);
      const firstRole = liveRoles[0];
      if (firstRole && !liveRoles.some((r) => r.id === autoRoleId)) {
        setAutoRoleId(firstRole.id);
        setAutoRoleName(firstRole.name);
      }
    }
  }, [liveRoles, autoRoleId]);

  // Sync live channels and roles directly from Discord
  const handleSyncFromDiscord = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await refreshGuildDiscordResourcesAction(tenantId, guildId);
      if (res.ok && res.data) {
        if (res.data.channels.length > 0) {
          setChannels(res.data.channels);
          const firstCh = res.data.channels[0];
          if (firstCh && !res.data.channels.some((c) => c.id === channelId)) {
            setChannelId(firstCh.id);
            setChannelName(firstCh.name);
          }
        }
        if (res.data.roles.length > 0) {
          setRoles(res.data.roles);
          const firstR = res.data.roles[0];
          if (firstR && !res.data.roles.some((r) => r.id === autoRoleId)) {
            setAutoRoleId(firstR.id);
            setAutoRoleName(firstR.name);
          }
        }
        setSyncStatus(`Live Sync Complete! Found ${res.data.channels.length} channels & ${res.data.roles.length} roles.`);
        setTimeout(() => setSyncStatus(null), 4000);
      } else {
        setSyncStatus(res.error || "Could not fetch Discord live data. Ensure bot is invited to server.");
        setTimeout(() => setSyncStatus(null), 5000);
      }
    } catch (err) {
      setSyncStatus((err as Error).message || "Sync request failed");
      setTimeout(() => setSyncStatus(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Insert standard variable token at cursor position
  const handleInsertVariable = (token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setWelcomeMessage((prev) => prev + " " + token);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = welcomeMessage;
    const updated = current.slice(0, start) + token + current.slice(end);
    setWelcomeMessage(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const handleChannelSelect = (selectedId: string) => {
    setChannelId(selectedId);
    const ch = channels.find((c) => c.id === selectedId);
    if (ch) setChannelName(ch.name);
  };

  const handleRoleSelect = (selectedId: string) => {
    setAutoRoleId(selectedId);
    const r = roles.find((role) => role.id === selectedId);
    if (r) setAutoRoleName(r.name);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    const payload: WelcomeConfig = {
      enabled,
      channelId,
      channelName,
      message: welcomeMessage,
      pingUser,
      sendDm,
      autoRoleEnabled,
      autoRoleId,
      autoRoleName,
      customCanvasCard,
      rulesGate: false,
      bannerConfig,
    };

    try {
      const res = await saveWelcomeAction(tenantId, guildId, payload);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setErrorMessage(res.error || "Failed to save welcome settings");
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const isLiveConnected = liveChannels.length > 0 || roles !== FALLBACK_ROLES;

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome &amp; Onboarding
            </h1>
            <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
              {enabled ? "Active" : "Disabled"}
            </Badge>

            {/* Live Discord Sync Status Badge */}
            {isLiveConnected ? (
              <Badge
                variant="outline"
                className="text-[11px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 flex items-center gap-1 font-mono"
              >
                <Radio className="h-3 w-3 animate-pulse text-emerald-500" />
                <span>Live Discord Sync ({channels.length} channels, {roles.length} roles)</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[11px] text-zinc-400 border-zinc-700/40 bg-zinc-800/30 flex items-center gap-1 font-mono"
              >
                <span>●</span>
                <span>Standby Mode</span>
              </Badge>
            )}

            {currentPlan !== "FREE" && (
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                {currentPlan}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Greet newcomers in live Discord channels, assign real server roles, and customize dynamic welcome cards.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncFromDiscord}
            disabled={isSyncing}
            className="gap-1.5 text-xs h-9 border-border hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync Live Data"}</span>
          </Button>

          <Button
            onClick={handleSave}
            disabled={isSaving || !isBotOnline}
            className="gap-2 shadow-xs bg-primary text-primary-foreground font-semibold h-9"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !isBotOnline ? (
              <Lock className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{isSaving ? "Saving..." : !isBotOnline ? "Configuration Locked" : "Save Changes"}</span>
          </Button>
        </div>
      </div>

      {/* Bot Prerequisite & Privileged Intents Gate Warning */}
      {!isBotOnline && (
        <div
          id="bot-offline-gating-banner"
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-500 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-semibold text-sm text-foreground block">
                  Module Configuration Disabled — Active Bot Required
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed block mt-0.5">
                  Your Discord Bot is currently{" "}
                  <strong className="text-amber-500 uppercase font-mono">{botRuntimeStatus}</strong>.
                  Welcome messages, canvas cards, and auto-roles require an active bot with Privileged Gateway Intents (Server Members, Message Content, Presence) enabled in the Discord Developer Portal.
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              asChild
              className="shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 text-xs font-semibold"
            >
              <a href={`/tenants/${tenantId}/guilds/${guildId}/setup`} className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                <span>Configure Bot &amp; Intents</span>
                <ArrowRight className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Status Alerts */}
      {syncStatus && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs animate-in fade-in">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Welcome module settings saved successfully!</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Configuration Forms (7 cols) */}
        <div className={`lg:col-span-7 space-y-6 ${!isBotOnline ? "opacity-60 pointer-events-none select-none" : ""}`}>
          {/* Master Toggle */}
          <Card className="border-border">
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-foreground">
                    Enable Welcome Module
                  </span>
                  {!isBotOnline && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 bg-amber-500/10 flex items-center gap-1 font-mono">
                      <Lock className="h-3 w-3" /> LOCKED
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatically announce and orient new members when they join the server.
                </p>
              </div>
              <Switch checked={enabled && isBotOnline} disabled={!isBotOnline} onCheckedChange={setEnabled} />
            </CardContent>
          </Card>

          {/* Section 1: Channel & Message Template */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span>Message Configuration</span>
                </CardTitle>
                <button
                  type="button"
                  onClick={handleSyncFromDiscord}
                  disabled={isSyncing}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>Refresh Channels</span>
                </button>
              </div>
              <CardDescription className="text-xs">
                Select where the announcement appears and format the automated greeting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Channel Selector with Live Discord Channels */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="welcome-channel" className="text-xs font-semibold">
                    Announcement Channel
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {channels.length} channels available
                  </span>
                </div>
                <select
                  id="welcome-channel"
                  value={channelId}
                  onChange={(e) => handleChannelSelect(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Ensure the bot has Send Messages and Embed Links permissions in this channel.
                </p>
              </div>

              {/* Message Template with Variable Chips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="welcome-msg" className="text-xs font-semibold">
                    Message Template
                  </Label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Markdown &amp; variables supported
                  </span>
                </div>

                <textarea
                  id="welcome-msg"
                  ref={textareaRef}
                  rows={4}
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="Welcome to {server}, {user}! Check out #rules to get started!"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono leading-relaxed"
                />

                {/* Centralized Variable Chips Component */}
                <VariableChips
                  variables={WELCOME_VARIABLES}
                  onInsert={handleInsertVariable}
                />
              </div>

              <Separator />

              {/* Mention User & Direct Message Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <AtSign className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs font-semibold text-foreground">Ping Member</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Send a push notification ping
                    </span>
                  </div>
                  <Switch checked={pingUser} onCheckedChange={setPingUser} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-foreground">Direct Message</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Send greeting to private DM
                    </span>
                  </div>
                  <Switch checked={sendDm} onCheckedChange={setSendDm} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Auto-Role on Join with Live Discord Roles */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-blue-400" />
                    <span>Auto-Role on Join</span>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Automatically grant an initial Discord role to verified newcomers.
                  </CardDescription>
                </div>
                <Switch
                  checked={autoRoleEnabled}
                  onCheckedChange={setAutoRoleEnabled}
                />
              </div>
            </CardHeader>

            {autoRoleEnabled && (
              <CardContent className="space-y-3.5 pt-0">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-role-select" className="text-xs font-semibold">
                      Role to Assign
                    </Label>
                    <button
                      type="button"
                      onClick={handleSyncFromDiscord}
                      disabled={isSyncing}
                      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                      <span>Refresh Roles</span>
                    </button>
                  </div>
                  <select
                    id="auto-role-select"
                    value={autoRoleId}
                    onChange={(e) => handleRoleSelect(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id} style={{ color: role.color }}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role Hierarchy Safety Alert */}
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold block">Discord Role Hierarchy Notice</span>
                    <p className="text-[11px] text-muted-foreground">
                      In Discord Server Settings &gt; Roles, ensure the bot&apos;s role is positioned
                      higher than <span className="font-mono text-foreground font-semibold">{autoRoleName}</span>,
                      otherwise Discord will block role assignments.
                    </p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Section 3: Dynamic Welcome Card */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4 text-purple-400" />
                <span>Dynamic Welcome Banner Card</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Enhance onboarding with visual card graphics and personalized artwork.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dynamic Welcome Card */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      Custom Canvas Welcome Card
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-bold">
                      PRO
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground block">
                    Generates a personalized image attachment with user avatar, name, and brand banner.
                  </span>
                </div>
                <Switch
                  checked={customCanvasCard}
                  onCheckedChange={setCustomCanvasCard}
                />
              </div>

              {customCanvasCard && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground block">
                      Banner Studio Design
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      Drag and drop avatar &amp; text, edit fonts, and customize background artwork.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStudioOpen(true)}
                    className="gap-1.5 text-xs h-8 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Palette className="h-3.5 w-3.5" />
                    <span>Open Banner Studio</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Sticky Live Discord Preview (5 cols) */}
        <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-3">
          <DiscordWelcomeMockup
            botName={botName}
            botAvatarUrl={botAvatarUrl}
            serverName={serverName}
            channelName={channelName}
            messageText={welcomeMessage}
            sendDm={sendDm}
            customCanvasCard={customCanvasCard}
            rulesGate={false}
            bannerConfig={bannerConfig}
            onOpenStudio={() => setStudioOpen(true)}
          />

          <div className="p-3 rounded-lg border border-border bg-muted/20 text-[11px] text-muted-foreground space-y-1">
            <span className="font-semibold text-foreground block">💡 Pro-Tip</span>
            <p>
              Changes to messages, real channels, and dynamic canvas card positions update live
              in the Discord mockup container above.
            </p>
          </div>
        </div>
      </div>

      {/* Banner Studio Modal */}
      <BannerStudioModal
        open={studioOpen}
        onOpenChange={setStudioOpen}
        config={bannerConfig}
        onSave={setBannerConfig}
        serverName={serverName}
        currentPlan={currentPlan}
      />
    </div>
  );
}
