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
  ShieldAlert,
  Save,
  CheckCircle2,
  Link2,
  Users,
  MessageSquareWarning,
  Flame,
} from "lucide-react";

interface ModerationViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

export function ModerationView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: ModerationViewProps) {
  const [enabled, setEnabled] = useState(true);
  const [logChannel, setLogChannel] = useState("#mod-logs");

  // Anti-Spam
  const [antiSpam, setAntiSpam] = useState(true);
  const [spamThreshold, setSpamThreshold] = useState("5");
  const [spamAction, setSpamAction] = useState<"DELETE" | "TIMEOUT">("TIMEOUT");

  // Anti-Raid
  const [antiRaid, setAntiRaid] = useState(true);
  const [raidThreshold, setRaidThreshold] = useState("10");

  // Link Filtering
  const [blockInvites, setBlockInvites] = useState(true);
  const [blockPhishing, setBlockPhishing] = useState(true);

  // Mention Limit
  const [mentionLimit, setMentionLimit] = useState(true);
  const [maxMentions, setMaxMentions] = useState("4");

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Auto-Moderation & Security</h1>
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automate server defense against raid attacks, spam waves, malicious links, and unauthorized invites.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-2 shadow-xs">
            <Save className="h-4 w-4" />
            <span>Save Rules</span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Security and moderation policies applied successfully!</span>
        </div>
      )}

      {/* Master Toggle & Logging */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-500" />
                Active Protection Engine
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time message analysis on Discord Gateway events.
              </CardDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="log-channel" className="text-xs font-semibold">
              Security & Audit Log Channel
            </Label>
            <Input
              id="log-channel"
              value={logChannel}
              onChange={(e) => setLogChannel(e.target.value)}
              placeholder="#mod-logs"
              className="text-xs font-mono max-w-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              All auto-moderation actions, flagged links, and timeouts will be logged here with reasons.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Spam & Flood Guard */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                Spam & Flood Prevention
              </CardTitle>
              <CardDescription className="text-xs">
                Restricts rapid repeated messaging and repetitive text walls.
              </CardDescription>
            </div>
            <Switch checked={antiSpam} onCheckedChange={setAntiSpam} />
          </div>
        </CardHeader>
        {antiSpam && (
          <CardContent className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="spam-limit" className="text-xs font-semibold">
                  Max Messages in 5 Seconds
                </Label>
                <Input
                  id="spam-limit"
                  type="number"
                  value={spamThreshold}
                  onChange={(e) => setSpamThreshold(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Action on Violation</Label>
                <select
                  value={spamAction}
                  onChange={(e) => setSpamAction(e.target.value as "DELETE" | "TIMEOUT")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="TIMEOUT">Delete Message & Timeout 5 Minutes</option>
                  <option value="DELETE">Delete Message & Warn User</option>
                </select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Anti-Raid Shield (Pro Gated UI) */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  Anti-Raid & Mass Join Shield
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono font-bold">
                  PRO
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Detects coordinated bot join waves and triggers server lockdown mode.
              </CardDescription>
            </div>
            <Switch checked={antiRaid} onCheckedChange={setAntiRaid} />
          </div>
        </CardHeader>
        {antiRaid && (
          <CardContent className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="raid-threshold" className="text-xs font-semibold">
                Raid Trigger Threshold (Joins in 10 Seconds)
              </Label>
              <Input
                id="raid-threshold"
                type="number"
                value={raidThreshold}
                onChange={(e) => setRaidThreshold(e.target.value)}
                className="text-xs font-mono max-w-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                When triggered, new joiners are quarantined and require manual verification.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Link Filtering & Phishing Shield */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-500" />
            Link Filtering & Invite Protection
          </CardTitle>
          <CardDescription className="text-xs">
            Prevent self-promotion invites and malicious scam links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Block Discord Server Invites (discord.gg)
              </span>
              <span className="text-[11px] text-muted-foreground block">
                Deletes unauthorized server invites posted in chat channels.
              </span>
            </div>
            <Switch checked={blockInvites} onCheckedChange={setBlockInvites} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Phishing & Known Scam Domain Blocker
                </span>
                <Badge variant="outline" className="text-[10px] font-mono font-bold">
                  PRO
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block">
                Real-time lookup against verified Discord token-grabber and free-nitro scam blocklists.
              </span>
            </div>
            <Switch checked={blockPhishing} onCheckedChange={setBlockPhishing} />
          </div>
        </CardContent>
      </Card>

      {/* Mention Limits */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-amber-500" />
                Mass Mention Protection
              </CardTitle>
              <CardDescription className="text-xs">
                Prevents griefers from spamming multiple @user mentions in a single message.
              </CardDescription>
            </div>
            <Switch checked={mentionLimit} onCheckedChange={setMentionLimit} />
          </div>
        </CardHeader>
        {mentionLimit && (
          <CardContent className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="mention-limit-input" className="text-xs font-semibold">
                Max Mentions Allowed per Message
              </Label>
              <Input
                id="mention-limit-input"
                type="number"
                value={maxMentions}
                onChange={(e) => setMaxMentions(e.target.value)}
                className="text-xs font-mono max-w-xs"
              />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
