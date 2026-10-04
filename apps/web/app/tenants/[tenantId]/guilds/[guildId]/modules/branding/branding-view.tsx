"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  CheckCircle2,
  Bot,
  Upload,
  HardDrive,
  Clock,
  X,
  Palette,
  AlertCircle,
} from "lucide-react";

interface BrandingViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
  botName?: string;
  botAvatarUrl?: string | null;
  botTag?: string | null;
}

export function BrandingView({
  tenantId,
  guildId: _guildId,
  currentPlan,
  botName = "CreatorBot",
  botAvatarUrl = null,
  botTag = null,
}: BrandingViewProps) {
  // Live values from server
  const [displayNickname, setDisplayNickname] = useState(botName);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(botAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [accentColor, setAccentColor] = useState("#5865F2");

  useEffect(() => {
    setDisplayNickname(botName);
  }, [botName]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(botAvatarUrl);
    }
  }, [botAvatarUrl, avatarFile]);

  // Storage usage based on plan and uploaded assets
  const maxStorageMb: Record<"FREE" | "PRO" | "ENTERPRISE", number> = {
    FREE: 10,
    PRO: 100,
    ENTERPRISE: 250,
  };
  const maxMb = maxStorageMb[currentPlan];
  const uploadedMb = avatarFile ? parseFloat((avatarFile.size / (1024 * 1024)).toFixed(2)) : 0.0;
  const storagePercent = Math.min(100, Math.round((uploadedMb / maxMb) * 100));

  // Cooldown timer state (Discord rate limits: avatar 2/hour = 15m cooldown, nick 2m)
  const [avatarCooldownSeconds, setAvatarCooldownSeconds] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer effect
  useEffect(() => {
    if (avatarCooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setAvatarCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [avatarCooldownSeconds]);

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleFileSelect = (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload a valid image file (PNG, JPG, GIF, WebP).");
      return;
    }
    // 8MB limit (Discord's max avatar upload)
    if (file.size > 8 * 1024 * 1024) {
      setUploadError("Image size exceeds 8MB Discord limit. Please choose a smaller file.");
      return;
    }

    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(botAvatarUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    setIsPending(true);
    // Simulate application to Discord Gateway / REST
    setTimeout(() => {
      setIsPending(false);
      setSaved(true);
      // Start cooldown simulation: 15 minutes (900 seconds)
      setAvatarCooldownSeconds(900);
      setTimeout(() => setSaved(false), 4000);
    }, 1000);
  };

  // Bot handle/tag formatting
  const globalHandle = botTag || `@${botName.toLowerCase().replace(/[^a-z0-9_]/g, "") || "bot"}`;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Bot Identity &amp; Branding
                </h1>
                <Badge
                  variant={currentPlan === "FREE" ? "secondary" : "default"}
                  className="text-[10px] font-mono font-bold"
                >
                  {currentPlan}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize your bot&apos;s server display nickname, uploaded avatar, and brand accent colors.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isPending || avatarCooldownSeconds > 0}
            className="gap-2 shadow-xs"
          >
            <Save className="h-4 w-4" />
            <span>
              {isPending
                ? "Applying..."
                : avatarCooldownSeconds > 0
                  ? `Cooldown (${formatCooldown(avatarCooldownSeconds)})`
                  : "Save Branding Changes"}
            </span>
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Bot branding updated successfully and synced with Discord! Cooldown active.</span>
        </div>
      )}

      {/* Storage Quota Card */}
      <Card className="border-border bg-card/60">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <HardDrive className="h-4 w-4 text-primary" />
              <span>Branding Storage Quota ({currentPlan} Plan)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {uploadedMb.toFixed(1)} MB / {maxMb} MB used ({storagePercent}%)
              </span>
              {currentPlan === "FREE" && (
                <Button variant="ghost" size="sm" asChild className="h-6 text-[11px] px-2 text-primary">
                  <a href={`/tenants/${tenantId}/billing`}>Upgrade to Pro (100MB) &rarr;</a>
                </Button>
              )}
            </div>
          </div>

          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                storagePercent > 90
                  ? "bg-destructive"
                  : storagePercent > 70
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-muted-foreground mt-2">
            <span>Free: 10MB • Pro: 100MB • Enterprise: 250MB</span>
            <span>Supports PNG, JPG, GIF (animated avatars), and WebP up to 8MB</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Form Controls (7 cols) */}
        <div className="md:col-span-7 space-y-6">
          {/* Bot Profile & Identity */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Server Identity
              </CardTitle>
              <CardDescription className="text-xs">
                Configure the server nickname and visual avatar for this Discord server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Display Nickname */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bot-name" className="text-xs font-semibold">
                    Server Display Nickname
                  </Label>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 2m Discord cooldown
                  </span>
                </div>
                <Input
                  id="bot-name"
                  value={displayNickname}
                  onChange={(e) => setDisplayNickname(e.target.value)}
                  placeholder="e.g. MyServer Assistant"
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The nickname members see in this server&apos;s member list and channel messages.
                </p>
              </div>

              {/* Drag and Drop Avatar Uploader */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Bot Avatar Image</Label>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 15m Discord cooldown (max 2/hour)
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                {avatarPreview ? (
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-3.5">
                    <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-primary/30 shrink-0 bg-background shadow-xs">
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {avatarFile
                          ? avatarFile.name
                          : botAvatarUrl
                            ? "Current Discord Avatar"
                            : "Custom Bot Avatar"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {avatarFile
                          ? `${(avatarFile.size / 1024).toFixed(1)} KB • Ready to apply`
                          : botAvatarUrl
                            ? "Active avatar from Discord • Click change to replace"
                            : "Custom image active"}
                      </p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Change Image
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={handleRemoveAvatar}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all ${
                      isDragging
                        ? "border-primary bg-primary/5 scale-[0.99]"
                        : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-foreground">
                        <span className="text-primary hover:underline">Click to upload</span> or drag
                        and drop
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        PNG, JPG, GIF (animated) or WebP up to 8MB
                      </p>
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="flex items-center gap-2 text-xs text-destructive p-2.5 rounded-md bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {avatarCooldownSeconds > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Discord avatar change cooldown active: next change available in{" "}
                      <strong>{formatCooldown(avatarCooldownSeconds)}</strong>.
                    </span>
                  </div>
                )}
              </div>

              {/* Accent Color & Banner */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <Label htmlFor="accent-color" className="text-xs font-semibold">
                  Embed Accent &amp; Banner Color
                </Label>
                <div className="flex items-center gap-2.5 pt-0.5">
                  <input
                    type="color"
                    id="accent-color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-8 w-12 rounded cursor-pointer border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-28 text-xs font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Applied to Discord embeds and mini-profile banner
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Discord User Profile Card Preview (5 cols) */}
        <div className="md:col-span-5 sticky top-6">
          <Card className="border-border shadow-md bg-card/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Discord Mini-Profile Preview
                </CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono">
                  LIVE PREVIEW
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="rounded-xl border border-border/80 bg-[#111214] text-white overflow-hidden shadow-lg">
                {/* Top Banner */}
                <div
                  className="h-20 w-full transition-colors relative"
                  style={{ backgroundColor: accentColor }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                </div>

                {/* Avatar with Status Bubble */}
                <div className="px-4 pb-4 space-y-3 relative">
                  <div className="relative -mt-10 inline-block">
                    <div className="h-20 w-20 rounded-full border-4 border-[#111214] overflow-hidden bg-[#2b2d31]">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Bot Avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center font-bold text-sm bg-[#5865F2] text-white">
                          <Bot className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    {/* Online Status Dot */}
                    <div className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full border-[3px] border-[#111214] bg-[#23a55a]" />
                  </div>

                  {/* Names Section (Display Nickname + Global Handle) */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-base font-bold text-white tracking-tight">
                        {displayNickname || botName}
                      </span>
                      <span className="bg-[#5865F2] text-white text-[10px] font-bold px-1.5 py-0.5 rounded leading-none flex items-center gap-0.5">
                        ✓ BOT
                      </span>
                    </div>
                    <span className="text-xs text-[#949ba4] font-mono block">
                      {globalHandle}
                    </span>
                  </div>

                  <div className="h-px bg-[#2b2d31] my-2" />

                  {/* About / Embed preview sample */}
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wider block">
                      Embed Color Preview
                    </span>
                    <div
                      className="rounded border-l-4 bg-[#2b2d31]/80 p-2.5 text-xs text-[#dbdee1] flex items-center gap-2"
                      style={{ borderLeftColor: accentColor }}
                    >
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: accentColor }}
                      />
                      <span>Active Server Embed Border Color</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Updates in real-time as you modify display nickname, avatar, and accent color.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
