"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";

interface EmbedsViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
}

interface EmbedField {
  id: string;
  name: string;
  value: string;
  inline: boolean;
}

const PRESET_COLORS = [
  { label: "Blurple", hex: "#5865F2" },
  { label: "Emerald", hex: "#57F287" },
  { label: "Gold", hex: "#FEE75C" },
  { label: "Crimson", hex: "#ED4245" },
  { label: "Fuchsia", hex: "#EB459E" },
  { label: "Dark Slate", hex: "#2B2D31" },
];

export function EmbedsView({ tenantId: _tenantId, guildId: _guildId, currentPlan: _currentPlan }: EmbedsViewProps) {
  const [channel, setChannel] = useState("#announcements");
  const [authorName, setAuthorName] = useState("CreatorCore News");
  const [title, setTitle] = useState("🚨 Community Update & Tournament Schedule");
  const [description, setDescription] = useState(
    "Welcome to the official monthly championship! Check the schedule below and ensure your squads are checked in before Friday 6 PM EST.",
  );
  const [color, setColor] = useState("#5865F2");
  const [footerText, setFooterText] = useState("CreatorCore System • Event Operations");
  const [includeTimestamp, setIncludeTimestamp] = useState(true);

  const [fields, setFields] = useState<EmbedField[]>([
    { id: "1", name: "🏆 Prize Pool", value: "$1,000 USD", inline: true },
    { id: "2", name: "📅 Date & Time", value: "Oct 24th, 6 PM EST", inline: true },
  ]);

  const [saved, setSaved] = useState(false);

  const handleAddField = () => {
    setFields([
      ...fields,
      {
        id: Date.now().toString(),
        name: "New Field",
        value: "Field content",
        inline: true,
      },
    ]);
  };

  const handleSend = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Visual Embed Builder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Craft rich Discord announcement embeds with formatted fields, custom brand colors, and instant previews.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSend} className="gap-2 shadow-xs">
            <Send className="h-4 w-4" />
            <span>Publish to Discord</span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Embed announcement dispatched to Discord channel!</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Editor Form Column (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Embed Content Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Destination Channel</Label>
                <Input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="#announcements"
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Author Header</Label>
                <Input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Organization or Event Name"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Embed Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Main Headline"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description (Markdown Supported)</Label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Color Preset Palette */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Embed Border Color</Label>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
                        color === c.hex ? "ring-2 ring-primary border-transparent" : "border-border"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-24 h-7 text-xs font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fields Configuration */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Dynamic Fields</CardTitle>
                <Button size="sm" variant="outline" onClick={handleAddField} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" />
                  <span>Add Field</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className="p-3 rounded-lg border border-border/70 bg-card/60 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Field #{i + 1}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setFields(fields.filter((item) => item.id !== f.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Field Title"
                      value={f.name}
                      onChange={(e) =>
                        setFields(fields.map((item) => (item.id === f.id ? { ...item, name: e.target.value } : item)))
                      }
                      className="text-xs"
                    />
                    <Input
                      placeholder="Field Value"
                      value={f.value}
                      onChange={(e) =>
                        setFields(fields.map((item) => (item.id === f.id ? { ...item, value: e.target.value } : item)))
                      }
                      className="text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">Inline Layout (Side-by-side)</span>
                    <Switch
                      checked={f.inline}
                      onCheckedChange={(val) =>
                        setFields(fields.map((item) => (item.id === f.id ? { ...item, inline: val } : item)))
                      }
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Footer Configuration */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Footer & Timestamp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Footer Text</Label>
                <Input
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Footer caption"
                  className="text-xs"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Include Live Timestamp</span>
                <Switch checked={includeTimestamp} onCheckedChange={setIncludeTimestamp} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Discord Embed Preview Column (5 cols) */}
        <div className="lg:col-span-5 sticky top-6">
          <Card className="border-border shadow-md bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Live Discord Message Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {/* Message Container */}
              <div className="rounded-xl border border-border/80 bg-background/95 p-4 space-y-3 font-sans">
                {/* Bot Header */}
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0">
                    C
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground">CreatorBot</span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 font-bold">
                        BOT
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">Today at 12:00 PM</span>
                    </div>
                  </div>
                </div>

                {/* Discord Embed Element */}
                <div
                  className="rounded-md border-l-4 bg-muted/30 p-3.5 space-y-2.5 text-xs"
                  style={{ borderLeftColor: color }}
                >
                  {authorName && (
                    <span className="text-[11px] font-semibold text-foreground/80 block">
                      {authorName}
                    </span>
                  )}

                  {title && (
                    <h3 className="text-sm font-bold text-foreground leading-snug">
                      {title}
                    </h3>
                  )}

                  {description && (
                    <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {description}
                    </p>
                  )}

                  {/* Embed Fields Grid */}
                  {fields.length > 0 && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {fields.map((f) => (
                        <div key={f.id} className={f.inline ? "col-span-1" : "col-span-2"}>
                          <span className="text-[11px] font-bold text-foreground block">{f.name}</span>
                          <span className="text-muted-foreground">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  {(footerText || includeTimestamp) && (
                    <div className="flex items-center gap-1.5 pt-2 text-[10px] text-muted-foreground font-mono border-t border-border/50">
                      {footerText && <span>{footerText}</span>}
                      {footerText && includeTimestamp && <span>•</span>}
                      {includeTimestamp && <span>Today at 12:00 PM</span>}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
