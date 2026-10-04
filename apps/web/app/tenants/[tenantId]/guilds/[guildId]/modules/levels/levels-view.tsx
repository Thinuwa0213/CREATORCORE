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
  Trophy,
  Award,
  Zap,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
} from "lucide-react";

interface LevelsViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

interface RoleReward {
  level: number;
  role: string;
}

export function LevelsView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: LevelsViewProps) {
  const [enabled, setEnabled] = useState(true);
  const [channel, setChannel] = useState("#level-ups");
  const [cooldown, setCooldown] = useState("60");
  const [vipMultiplier, setVipMultiplier] = useState(false);
  const [customRankCard, setCustomRankCard] = useState(false);
  const [roleRewards, setRoleRewards] = useState<RoleReward[]>([
    { level: 5, role: "@Regular" },
    { level: 10, role: "@Veteran" },
    { level: 25, role: "@Champion" },
  ]);

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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Levels & XP System</h1>
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reward active community members with XP, rank cards, and automated milestone roles.
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
          <span>Leveling configuration saved successfully!</span>
        </div>
      )}

      {/* Module Master Toggle */}
      <Card className="border-border">
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-foreground">Enable Leveling & XP</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Tracks text messages and awards between 15-25 XP once per minute.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </CardContent>
      </Card>

      {/* Announcements & Settings */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Level-Up Announcements
          </CardTitle>
          <CardDescription className="text-xs">
            Specify where celebrations are posted when a user advances to the next level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="levelup-channel" className="text-xs font-semibold">
                Announcement Channel
              </Label>
              <Input
                id="levelup-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="#level-ups"
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xp-cooldown" className="text-xs font-semibold">
                Message XP Cooldown (seconds)
              </Label>
              <Input
                id="xp-cooldown"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                placeholder="60"
                className="text-xs font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Rewards */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              Role Rewards by Milestone
            </span>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1 h-7"
              onClick={() => setRoleRewards([...roleRewards, { level: 50, role: "@Mythic" }])}
            >
              <Plus className="h-3 w-3" />
              <span>Add Role</span>
            </Button>
          </CardTitle>
          <CardDescription className="text-xs">
            Roles automatically granted when members reach milestone levels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {roleRewards.map((reward, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 font-bold">
                    Level {reward.level}
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">{reward.role}</span>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setRoleRewards(roleRewards.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pro Features: Multipliers & Custom Canvas Cards */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              XP Multipliers & Custom Branding
            </CardTitle>
            <Badge variant="default" className="text-[10px]">PRO</Badge>
          </div>
          <CardDescription className="text-xs">
            Unlock server booster bonuses and fully branded rank cards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Server Booster XP Multiplier (1.5x)
              </span>
              <span className="text-[11px] text-muted-foreground block">
                Gives Nitro Boosters extra XP per message to encourage boosts.
              </span>
            </div>
            <Switch
              checked={vipMultiplier}
              onCheckedChange={setVipMultiplier}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Custom Canvas Rank Cards
              </span>
              <span className="text-[11px] text-muted-foreground block">
                Tailor rank card backgrounds, badges, and progress bar colors to match your brand.
              </span>
            </div>
            <Switch
              checked={customRankCard}
              onCheckedChange={setCustomRankCard}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
