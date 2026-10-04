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
  Gift,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Users,
} from "lucide-react";

interface GiveawaysViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

interface GiveawayItem {
  id: string;
  prize: string;
  channel: string;
  winnerCount: number;
  durationHours: number;
  requiredRole?: string | undefined;
  boosterMultiplier?: boolean | undefined;
  entriesCount: number;
  endsAt: string;
}

export function GiveawaysView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: GiveawaysViewProps) {
  const [giveaways, setGiveaways] = useState<GiveawayItem[]>([
    {
      id: "1",
      prize: "Discord Nitro (1 Month)",
      channel: "#giveaways",
      winnerCount: 2,
      durationHours: 48,
      requiredRole: "@Community Member",
      boosterMultiplier: true,
      entriesCount: 142,
      endsAt: "In 1 day, 18 hours",
    },
  ]);

  // Form states
  const [prize, setPrize] = useState("");
  const [channel, setChannel] = useState("#giveaways");
  const [winners, setWinners] = useState("1");
  const [duration, setDuration] = useState("24");
  const [requiredRole, setRequiredRole] = useState("@Verified");
  const [boosterMultiplier, setBoosterMultiplier] = useState(true);

  const [saved, setSaved] = useState(false);

  const handleCreateGiveaway = () => {
    if (!prize.trim()) return;

    setGiveaways([
      ...giveaways,
      {
        id: Date.now().toString(),
        prize: prize.trim(),
        channel,
        winnerCount: parseInt(winners, 10) || 1,
        durationHours: parseInt(duration, 10) || 24,
        requiredRole: requiredRole.trim() || undefined,
        boosterMultiplier,
        entriesCount: 0,
        endsAt: `In ${duration} hours`,
      },
    ]);

    setPrize("");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Community Giveaways</h1>
            <Badge variant="default" className="text-xs">
              {giveaways.length} Active
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Host automated Discord giveaways with role requirements, timer countdowns, and fair winner picking.
          </p>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Giveaway created and scheduled to Discord channel!</span>
        </div>
      )}

      {/* Create Giveaway Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Launch New Giveaway
          </CardTitle>
          <CardDescription className="text-xs">
            Configure giveaway prize, duration, eligible roles, and channel destination.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prize-title" className="text-xs font-semibold">
                Prize Title
              </Label>
              <Input
                id="prize-title"
                placeholder="e.g. Steam Game Code or $25 Gift Card"
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target-chan" className="text-xs font-semibold">
                Target Channel
              </Label>
              <Input
                id="target-chan"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="#giveaways"
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="winner-count" className="text-xs font-semibold">
                Number of Winners
              </Label>
              <Input
                id="winner-count"
                type="number"
                value={winners}
                onChange={(e) => setWinners(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duration-hrs" className="text-xs font-semibold">
                Duration (Hours)
              </Label>
              <Input
                id="duration-hrs"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="req-role" className="text-xs font-semibold">
                Required Role (Optional)
              </Label>
              <Input
                id="req-role"
                value={requiredRole}
                onChange={(e) => setRequiredRole(e.target.value)}
                placeholder="@Community Member"
                className="text-xs font-mono"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Server Booster Bonus Entries (2x)
                </span>
                <Badge variant="outline" className="text-[10px] font-mono font-bold">
                  PRO
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block">
                Server Boosters automatically get double entries to reward boosting members.
              </span>
            </div>
            <Switch checked={boosterMultiplier} onCheckedChange={setBoosterMultiplier} />
          </div>

          <Button onClick={handleCreateGiveaway} size="sm" className="gap-1.5 text-xs">
            <Gift className="h-4 w-4" />
            <span>Publish Giveaway</span>
          </Button>
        </CardContent>
      </Card>

      {/* Active Giveaways List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Active & Scheduled Giveaways</CardTitle>
          <CardDescription className="text-xs">
            Currently running giveaways tracking entries in real time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {giveaways.map((gw) => (
              <div
                key={gw.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border/70 bg-card/50"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-bold text-foreground">{gw.prize}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {gw.winnerCount} {gw.winnerCount === 1 ? "Winner" : "Winners"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
                    <span>{gw.channel}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-amber-500">
                      <Clock className="h-3 w-3" />
                      {gw.endsAt}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      <Users className="h-3 w-3" />
                      {gw.entriesCount} Entries
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    onClick={() => setGiveaways(giveaways.filter((g) => g.id !== gw.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
