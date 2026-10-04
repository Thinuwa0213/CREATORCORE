"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Radio,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
} from "lucide-react";

interface NotificationsViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

interface StreamerAlert {
  id: string;
  platform: "twitch" | "youtube" | "kick";
  channelName: string;
  discordChannel: string;
  pingRole: string;
}

export function NotificationsView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: NotificationsViewProps) {
  const [streamers, setStreamers] = useState<StreamerAlert[]>([
    {
      id: "1",
      platform: "twitch",
      channelName: "Shroud",
      discordChannel: "#stream-announcements",
      pingRole: "@Live Ping",
    },
  ]);

  const [newPlatform, setNewPlatform] = useState<"twitch" | "youtube" | "kick">("twitch");
  const [newChannelName, setNewChannelName] = useState("");
  const [newDiscordChannel, setNewDiscordChannel] = useState("#live-streams");
  const [newPingRole, setNewPingRole] = useState("@everyone");

  const [autoCleanup, setAutoCleanup] = useState(false);
  const [customLiveMessage, setCustomLiveMessage] = useState(
    "🔴 **{streamer}** is now LIVE playing **{game}**!\nCome hang out: {url}",
  );

  const [saved, setSaved] = useState(false);

  const handleAddStreamer = () => {
    if (!newChannelName.trim()) return;

    setStreamers([
      ...streamers,
      {
        id: Date.now().toString(),
        platform: newPlatform,
        channelName: newChannelName.trim(),
        discordChannel: newDiscordChannel,
        pingRole: newPingRole,
      },
    ]);
    setNewChannelName("");
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Stream Alerts</h1>
            <Badge variant="default" className="text-xs">
              {streamers.length} Active {streamers.length === 1 ? "Alert" : "Alerts"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatically post rich embeds to Discord whenever creators go live on Twitch, YouTube, or Kick.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-2 shadow-xs">
            <Save className="h-4 w-4" />
            <span>Save Changes</span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Stream notifications configuration saved successfully!</span>
        </div>
      )}

      {/* Add New Stream Alert Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-rose-500" />
            Add Live Streamer Alert
          </CardTitle>
          <CardDescription className="text-xs">
            Connect a content creator channel to receive instant live stream notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Platform</Label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as "twitch" | "youtube" | "kick")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="twitch">Twitch</option>
                <option value="youtube">YouTube</option>
                <option value="kick">Kick</option>
              </select>
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs font-semibold">Channel Handle</Label>
              <Input
                placeholder="e.g. tarik"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Target Channel</Label>
              <Input
                value={newDiscordChannel}
                onChange={(e) => setNewDiscordChannel(e.target.value)}
                placeholder="#announcements"
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Ping Role</Label>
              <Input
                value={newPingRole}
                onChange={(e) => setNewPingRole(e.target.value)}
                placeholder="@Live Ping"
                className="text-xs font-mono"
              />
            </div>
          </div>

          <Button size="sm" onClick={handleAddStreamer} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Add Stream Alert</span>
          </Button>
        </CardContent>
      </Card>

      {/* Active Stream Alerts List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Configured Streamers</CardTitle>
          <CardDescription className="text-xs">
            Currently monitored creators and notification dispatch rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {streamers.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={`font-semibold capitalize text-[10px] ${
                      st.platform === "twitch"
                        ? "text-purple-500 border-purple-500/30"
                        : st.platform === "youtube"
                          ? "text-rose-500 border-rose-500/30"
                          : "text-emerald-500 border-emerald-500/30"
                    }`}
                  >
                    {st.platform}
                  </Badge>

                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-foreground block">{st.channelName}</span>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>{st.discordChannel}</span>
                      <span>•</span>
                      <span>{st.pingRole}</span>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setStreamers(streamers.filter((s) => s.id !== st.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Message Template & Pro Features */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Message Customization & Auto-Cleanup</CardTitle>
          <CardDescription className="text-xs">
            Configure how notifications look and behave when the stream goes offline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="live-msg" className="text-xs font-semibold">
                Live Announcement Format
              </Label>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{streamer}"}</code>
                <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{game}"}</code>
                <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{url}"}</code>
              </div>
            </div>
            <textarea
              id="live-msg"
              rows={3}
              value={customLiveMessage}
              onChange={(e) => setCustomLiveMessage(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <Separator />

          {/* Pro Auto-Cleanup */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Automatic Offline Message Cleanup</span>
                <Badge variant="default" className="text-[9px] px-1 py-0">PRO</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block">
                Automatically deletes or edits the notification to "Stream Ended" when the broadcaster goes offline.
              </span>
            </div>
            <Switch
              checked={autoCleanup}
              onCheckedChange={setAutoCleanup}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
