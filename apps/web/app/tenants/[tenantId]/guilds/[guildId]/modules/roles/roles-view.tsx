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
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  MousePointerClick,
  Sliders,
} from "lucide-react";

interface RolesViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

interface RoleItem {
  id: string;
  label: string;
  roleName: string;
  color: "primary" | "secondary" | "success" | "destructive";
  emoji?: string | undefined;
}

export function RolesView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: RolesViewProps) {
  const [menuTitle, setMenuTitle] = useState("🔔 Choose Your Notification Roles");
  const [targetChannel, setTargetChannel] = useState("#role-select");
  const [mutuallyExclusive, setMutuallyExclusive] = useState(false);
  const [roles, setRoles] = useState<RoleItem[]>([
    { id: "1", label: "Twitch Pings", roleName: "@Twitch Alerts", color: "primary", emoji: "🟣" },
    { id: "2", label: "YouTube Pings", roleName: "@YouTube Alerts", color: "destructive", emoji: "🔴" },
    { id: "3", label: "Giveaways", roleName: "@Giveaway Pings", color: "success", emoji: "🎁" },
  ]);

  const [newLabel, setNewLabel] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newColor, setNewColor] = useState<"primary" | "secondary" | "success" | "destructive">("primary");
  const [newEmoji, setNewEmoji] = useState("🎮");

  const [saved, setSaved] = useState(false);

  const handleAddRole = () => {
    if (!newLabel.trim() || !newRoleName.trim()) return;

    setRoles([
      ...roles,
      {
        id: Date.now().toString(),
        label: newLabel.trim(),
        roleName: newRoleName.trim(),
        color: newColor,
        emoji: newEmoji.trim() || undefined,
      },
    ]);
    setNewLabel("");
    setNewRoleName("");
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Button & Dropdown Roles</h1>
            <Badge variant="default" className="text-xs">
              {roles.length} Role Buttons
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create interactive Discord button menus so members can self-assign notification and game roles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-2 shadow-xs">
            <Save className="h-4 w-4" />
            <span>Publish to Discord</span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Role menu published to channel successfully!</span>
        </div>
      )}

      {/* Menu Settings */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            Menu Embed & Destination
          </CardTitle>
          <CardDescription className="text-xs">
            Set the channel and header message displayed above the interactive buttons.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Embed Title</Label>
              <Input
                value={menuTitle}
                onChange={(e) => setMenuTitle(e.target.value)}
                placeholder="Choose Your Roles"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Target Channel</Label>
              <Input
                value={targetChannel}
                onChange={(e) => setTargetChannel(e.target.value)}
                placeholder="#role-select"
                className="text-xs font-mono"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Mutually Exclusive Roles</span>
                <Badge variant="default" className="text-[9px] px-1 py-0">PRO</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground block">
                Members can only pick 1 role at a time (e.g. Color roles or Region roles).
              </span>
            </div>
            <Switch
              checked={mutuallyExclusive}
              onCheckedChange={setMutuallyExclusive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Add New Role Button */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Add Interactive Role Button
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs font-semibold">Emoji</Label>
              <Input
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                placeholder="🎮"
                className="text-xs text-center font-mono"
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs font-semibold">Button Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Gaming Squad"
                className="text-xs"
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs font-semibold">Discord Role</Label>
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="@Gamer"
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs font-semibold">Button Style</Label>
              <select
                value={newColor}
                onChange={(e) =>
                  setNewColor(e.target.value as "primary" | "secondary" | "success" | "destructive")
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="primary">Blurple (Primary)</option>
                <option value="secondary">Grey (Secondary)</option>
                <option value="success">Green (Success)</option>
                <option value="destructive">Red (Danger)</option>
              </select>
            </div>
          </div>

          <Button size="sm" onClick={handleAddRole} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Add to Menu</span>
          </Button>
        </CardContent>
      </Card>

      {/* Live Discord Component Preview */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-emerald-500" />
            Live Discord Component Preview
          </CardTitle>
          <CardDescription className="text-xs">
            Visual preview of how the embed and button matrix will appear inside Discord.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-3">
            {/* Embed Box */}
            <div className="rounded-lg border-l-4 border-l-primary bg-background/80 p-3.5 shadow-xs space-y-1">
              <h4 className="text-sm font-bold text-foreground">{menuTitle}</h4>
              <p className="text-xs text-muted-foreground">
                Click any button below to instantly toggle the role on your profile.
              </p>
            </div>

            {/* Buttons Matrix */}
            <div className="flex flex-wrap gap-2 pt-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-xs transition-all ${
                    r.color === "primary"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : r.color === "success"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : r.color === "destructive"
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {r.emoji && <span>{r.emoji}</span>}
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configured Roles List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Configured Role Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {roles.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/30"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  {r.emoji && <span className="text-base">{r.emoji}</span>}
                  <span className="font-semibold text-foreground">{r.label}</span>
                  <span className="text-muted-foreground font-mono">→ {r.roleName}</span>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {r.color}
                  </Badge>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setRoles(roles.filter((item) => item.id !== r.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
