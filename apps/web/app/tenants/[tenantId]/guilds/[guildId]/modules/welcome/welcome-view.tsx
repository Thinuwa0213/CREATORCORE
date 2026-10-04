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
import { Sparkles, MessageSquare, UserPlus, CheckCircle2, Save } from "lucide-react";

interface WelcomeViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

export function WelcomeView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: WelcomeViewProps) {
  const [enabled, setEnabled] = useState(true);
  const [channel, setChannel] = useState("#welcome-and-rules");
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Welcome to **{server}**, {user}! You are our **#{memberCount}** member. Check out #rules to get started! 🚀",
  );
  const [autoRole, setAutoRole] = useState("@Community Member");
  const [sendDm, setSendDm] = useState(false);
  const [customCanvasCard, setCustomCanvasCard] = useState(false);
  const [rulesGate, setRulesGate] = useState(false);
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome & Onboarding</h1>
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Greet new members, assign auto-roles, and configure onboarding verification.
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
          <span>Welcome module settings saved successfully!</span>
        </div>
      )}

      {/* Module Master Toggle */}
      <Card className="border-border">
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-foreground">Enable Welcome Module</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically send welcome messages when a new user joins your Discord server.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </CardContent>
      </Card>

      {/* Channel & Message Template */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Welcome Message & Channel
          </CardTitle>
          <CardDescription className="text-xs">
            Choose where welcome announcements appear and customize the message formatting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="welcome-channel" className="text-xs font-semibold">
              Announcement Channel
            </Label>
            <Input
              id="welcome-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="#welcome"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="welcome-msg" className="text-xs font-semibold">
                Message Template
              </Label>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Variables:</span>
                <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{user}"}</code>
                <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{server}"}</code>
                <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{memberCount}"}</code>
              </div>
            </div>
            <textarea
              id="welcome-msg"
              rows={3}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Live Preview Box */}
          <div className="rounded-lg border border-border/70 bg-muted/40 p-3 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Discord Live Message Preview
            </span>
            <div className="flex items-start gap-2.5 pt-1">
              <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                Bot
              </div>
              <div className="text-xs space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">CreatorBot</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">BOT</Badge>
                  <span className="text-[10px] text-muted-foreground">Today at 12:00 PM</span>
                </div>
                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {welcomeMessage
                    .replace("{user}", "@NewMember")
                    .replace("{server}", "My Community")
                    .replace("{memberCount}", "1,420")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto Roles & Onboarding Verification */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-emerald-500" />
            Roles & Direct Messages
          </CardTitle>
          <CardDescription className="text-xs">
            Assign default roles automatically and send private orientation instructions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auto-role" className="text-xs font-semibold">
              Auto-Role on Join
            </Label>
            <Input
              id="auto-role"
              value={autoRole}
              onChange={(e) => setAutoRole(e.target.value)}
              placeholder="@Member"
              className="text-xs font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Assigned immediately when a verified user enters the Discord server.
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">Send Direct Welcome Message (DM)</span>
              <span className="text-[11px] text-muted-foreground block">
                Sends a private message to the user with onboarding links and server info.
              </span>
            </div>
            <Switch checked={sendDm} onCheckedChange={setSendDm} />
          </div>

          <Separator />

          {/* Pro Feature: Custom Canvas Welcome Card */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Custom Canvas Welcome Card</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-bold">PRO</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block">
                Generates a dynamic image card with user avatar, brand banner, and welcome text.
              </span>
            </div>
            <Switch
              checked={customCanvasCard}
              onCheckedChange={setCustomCanvasCard}
            />
          </div>

          <Separator />

          {/* Pro Feature: Rules Screening Gate */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Require Rules Verification Gate</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-bold">PRO</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block">
                User must click a verification button before roles or channel access are granted.
              </span>
            </div>
            <Switch
              checked={rulesGate}
              onCheckedChange={setRulesGate}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
