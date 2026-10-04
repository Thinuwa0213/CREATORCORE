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
  ImageIcon,
  Sparkles,
} from "lucide-react";
import {
  saveBrandingAction,
  removeBrandingAvatarAction,
  removeBrandingBannerAction,
} from "@/app/actions";
import { ImageCropperModal } from "./image-cropper-modal";

interface BrandingViewProps {
  tenantId: string;
  guildId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
  botName?: string;
  botAvatarUrl?: string | null;
  botAvatarSizeBytes?: number;
  botBannerUrl?: string | null;
  botBannerSizeBytes?: number;
  botTag?: string | null;
  initialUsedBytes?: number;
  maxStorageBytes?: number;
}

export function BrandingView({
  tenantId,
  guildId,
  currentPlan,
  botName = "CreatorBot",
  botAvatarUrl = null,
  botAvatarSizeBytes = 0,
  botBannerUrl = null,
  botBannerSizeBytes = 0,
  botTag = null,
  initialUsedBytes = 0,
  maxStorageBytes = 10 * 1024 * 1024,
}: BrandingViewProps) {
  // Live values from server
  const [displayNickname, setDisplayNickname] = useState(botName);
  const [accentColor, setAccentColor] = useState("#5865F2");

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(botAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarMeta, setAvatarMeta] = useState<{
    width: number;
    height: number;
    sizeBytes: number;
  } | null>(null);

  // Banner state
  const [bannerPreview, setBannerPreview] = useState<string | null>(botBannerUrl);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerMeta, setBannerMeta] = useState<{
    width: number;
    height: number;
    sizeBytes: number;
  } | null>(null);

  // Storage usage
  const [usedBytes, setUsedBytes] = useState(initialUsedBytes);
  const [maxBytes, setMaxBytes] = useState(maxStorageBytes);

  // Cooldown & Status
  const [avatarCooldownSeconds, setAvatarCooldownSeconds] = useState(0);
  const [saved, setSaved] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Drag states
  const [isAvatarDragging, setIsAvatarDragging] = useState(false);
  const [isBannerDragging, setIsBannerDragging] = useState(false);

  // Cropper Modal state
  const [cropperState, setCropperState] = useState<{
    open: boolean;
    imageSrc: string | null;
    fileName: string;
    originalMimeType?: string;
    type: "avatar" | "banner";
    aspectRatio: number;
    targetWidth: number;
    targetHeight: number;
    title: string;
  }>({
    open: false,
    imageSrc: null,
    fileName: "image.png",
    type: "avatar",
    aspectRatio: 1,
    targetWidth: 1024,
    targetHeight: 1024,
    title: "Crop Bot Icon",
  });

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayNickname(botName);
  }, [botName]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(botAvatarUrl);
    }
  }, [botAvatarUrl, avatarFile]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(botBannerUrl);
    }
  }, [botBannerUrl, bannerFile]);

  useEffect(() => {
    setUsedBytes(initialUsedBytes);
  }, [initialUsedBytes]);

  useEffect(() => {
    setMaxBytes(maxStorageBytes);
  }, [maxStorageBytes]);

  // Storage calculation including staged pending files
  const pendingFileBytes = (avatarFile ? avatarFile.size : 0) + (bannerFile ? bannerFile.size : 0);
  const currentTotalBytes = usedBytes + pendingFileBytes;
  const usedMb = parseFloat((currentTotalBytes / (1024 * 1024)).toFixed(2));
  const maxMb = parseFloat((maxBytes / (1024 * 1024)).toFixed(0));
  const storagePercent = Math.min(100, Math.round((currentTotalBytes / maxBytes) * 100));

  const hasStagedChanges = Boolean(avatarFile || bannerFile);

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

  const handleImageFilePick = (file: File, type: "avatar" | "banner") => {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload a valid image file (PNG, JPG, GIF, WebP).");
      return;
    }

    // 3MB user-specified limit
    const MAX_FILE_SIZE = 3 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("Image size exceeds 3MB limit. Please choose a smaller file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      if (type === "avatar") {
        setCropperState({
          open: true,
          imageSrc: src,
          fileName: file.name,
          originalMimeType: file.type,
          type: "avatar",
          aspectRatio: 1, // 1:1
          targetWidth: 1024,
          targetHeight: 1024,
          title: "Crop Bot Icon",
        });
      } else {
        setCropperState({
          open: true,
          imageSrc: src,
          fileName: file.name,
          originalMimeType: file.type,
          type: "banner",
          aspectRatio: 17 / 6, // 17:6 (680x240)
          targetWidth: 1360,
          targetHeight: 480,
          title: "Crop Bot Banner",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCropApply = (result: {
    dataUri: string;
    file: File;
    width: number;
    height: number;
    sizeBytes: number;
  }) => {
    if (cropperState.type === "avatar") {
      setAvatarFile(result.file);
      setAvatarPreview(result.dataUri);
      setAvatarMeta({
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
      });
    } else {
      setBannerFile(result.file);
      setBannerPreview(result.dataUri);
      setBannerMeta({
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
      });
    }
    setCropperState((prev) => ({ ...prev, open: false, imageSrc: null }));
  };

  const handleRemoveAvatar = async () => {
    if (avatarFile) {
      setAvatarFile(null);
      setAvatarPreview(botAvatarUrl);
      setAvatarMeta(null);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    setIsPending(true);
    setUploadError(null);
    const res = await removeBrandingAvatarAction(tenantId, guildId);
    setIsPending(false);
    if (res.ok && res.usedStorageBytes !== undefined) {
      setUsedBytes(res.usedStorageBytes);
      setAvatarPreview(null);
      setAvatarMeta(null);
    } else if (res.error) {
      setUploadError(res.error);
    }
  };

  const handleRemoveBanner = async () => {
    if (bannerFile) {
      setBannerFile(null);
      setBannerPreview(botBannerUrl);
      setBannerMeta(null);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      return;
    }

    setIsPending(true);
    setUploadError(null);
    const res = await removeBrandingBannerAction(tenantId, guildId);
    setIsPending(false);
    if (res.ok && res.usedStorageBytes !== undefined) {
      setUsedBytes(res.usedStorageBytes);
      setBannerPreview(null);
      setBannerMeta(null);
    } else if (res.error) {
      setUploadError(res.error);
    }
  };

  const handleSave = async () => {
    setIsPending(true);
    setUploadError(null);

    try {
      let syncAvatarToDiscord = false;
      let syncBannerToDiscord = false;
      let uploadedAny = false;

      // 1. Upload Avatar if staged using native Route Handler
      if (avatarFile) {
        const formData = new FormData();
        formData.append("avatar", avatarFile);

        const uploadRes = await fetch(
          `/api/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding/avatar`,
          {
            method: "POST",
            body: formData,
            credentials: "include",
          },
        );

        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadData.ok) {
          setUploadError(uploadData.error || uploadData.message || "Failed to upload avatar to storage.");
          setIsPending(false);
          return;
        }

        if (uploadData.usedStorageBytes !== undefined) {
          setUsedBytes(uploadData.usedStorageBytes);
        }
        if (uploadData.avatarUrl) {
          setAvatarPreview(uploadData.avatarUrl);
        }
        setAvatarFile(null);
        syncAvatarToDiscord = true;
        uploadedAny = true;
      }

      // 2. Upload Banner if staged using native Route Handler
      if (bannerFile) {
        const formData = new FormData();
        formData.append("banner", bannerFile);

        const uploadBannerRes = await fetch(
          `/api/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding/banner`,
          {
            method: "POST",
            body: formData,
            credentials: "include",
          },
        );

        const uploadBannerData = await uploadBannerRes.json().catch(() => ({}));
        if (!uploadBannerRes.ok || !uploadBannerData.ok) {
          setUploadError(uploadBannerData.error || uploadBannerData.message || "Failed to upload banner to storage.");
          setIsPending(false);
          return;
        }

        if (uploadBannerData.usedStorageBytes !== undefined) {
          setUsedBytes(uploadBannerData.usedStorageBytes);
        }
        if (uploadBannerData.bannerUrl) {
          setBannerPreview(uploadBannerData.bannerUrl);
        }
        setBannerFile(null);
        syncBannerToDiscord = true;
        uploadedAny = true;
      }

      // 3. Save branding & sync to Discord
      const saveRes = await saveBrandingAction(tenantId, guildId, {
        nickname: displayNickname,
        syncAvatarToDiscord,
        syncBannerToDiscord,
      });

      if (!saveRes.ok) {
        if (saveRes.error === "DISCORD_COOLDOWN" && saveRes.retryAfterSeconds) {
          setAvatarCooldownSeconds(saveRes.retryAfterSeconds);
          setSuccessMessage(
            `Images saved to storage! Discord cooldown active: Next live avatar sync in ${formatCooldown(saveRes.retryAfterSeconds)}.`,
          );
          setSaved(true);
        } else {
          if (uploadedAny) {
            setSuccessMessage("Images stored successfully in CreatorCore storage.");
            setSaved(true);
            setUploadError(`Note on Discord sync: ${saveRes.error || "Throttled or missing permissions"}`);
          } else {
            setUploadError(saveRes.error || "Failed to sync branding with Discord.");
          }
        }
        setIsPending(false);
        setTimeout(() => setSaved(false), 5000);
        return;
      }

      setSuccessMessage("Bot branding and media assets saved successfully!");
      setSaved(true);
      if (syncAvatarToDiscord) {
        setAvatarCooldownSeconds(900);
      }
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsPending(false);
    }
  };

  const globalHandle = botTag || `@${botName.toLowerCase().replace(/[^a-z0-9_]/g, "") || "bot"}`;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/70">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <Palette className="h-4.5 w-4.5" />
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
                Customize your bot&apos;s server display nickname, uploaded icon, banner, and brand colors.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="gap-2 shadow-xs transition-all"
          >
            <Save className="h-4 w-4" />
            <span>
              {isPending
                ? "Saving..."
                : hasStagedChanges
                  ? "Save Staged Changes"
                  : avatarCooldownSeconds > 0
                    ? `Save Changes (${formatCooldown(avatarCooldownSeconds)} Cooldown)`
                    : "Save Branding Changes"}
            </span>
          </Button>
        </div>
      </div>

      {/* Staged Changes Alert */}
      {hasStagedChanges && !saved && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span>
              You have newly cropped images ready to save! Click <strong>Save Staged Changes</strong> to store them into your branding storage.
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
            className="h-7 text-xs px-3 shadow-xs shrink-0 self-end sm:self-auto"
          >
            Save Now
          </Button>
        </div>
      )}

      {/* Success Notification */}
      {saved && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium shadow-xs animate-in fade-in-50">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage || "Bot branding updated successfully and synced with Discord!"}</span>
        </div>
      )}

      {/* Storage Quota Card */}
      <Card className="border-border/80 bg-card/60 backdrop-blur-xs shadow-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <HardDrive className="h-4 w-4 text-primary" />
              <span>Branding Storage Quota ({currentPlan} Plan)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {usedMb} MB / {maxMb} MB used ({storagePercent}%)
              </span>
              {currentPlan === "FREE" && (
                <Button variant="ghost" size="sm" asChild className="h-6 text-[11px] px-2 text-primary hover:text-primary hover:bg-primary/10">
                  <a href={`/tenants/${tenantId}/billing`}>Upgrade to Pro (100MB) &rarr;</a>
                </Button>
              )}
            </div>
          </div>

          <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
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
            <span>Max 3MB per file • PNG, JPG, GIF (animated), and WebP supported</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Form Controls (7 cols) */}
        <div className="md:col-span-7 space-y-6">
          {/* Server Identity Card */}
          <Card className="border-border/80 bg-card/60 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Server Identity
              </CardTitle>
              <CardDescription className="text-xs">
                Configure display nickname and brand theme colors for this server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  className="text-xs bg-background/50"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The nickname members see in this server&apos;s member list and channel messages.
                </p>
              </div>

              {/* Accent Color & Banner */}
              <div className="space-y-1.5 pt-2 border-t border-border/70">
                <Label htmlFor="accent-color" className="text-xs font-semibold">
                  Embed Accent &amp; Banner Color
                </Label>
                <div className="flex items-center gap-2.5 pt-0.5">
                  <input
                    type="color"
                    id="accent-color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-8 w-12 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-28 text-xs font-mono bg-background/50"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Fallback banner background and Discord embed accent
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Media Assets Card */}
          <Card className="border-border/80 bg-card/60 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                Bot Media Assets
              </CardTitle>
              <CardDescription className="text-xs">
                Upload and crop custom bot icons and banners with precise aspect ratios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Hidden file inputs */}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFilePick(e.target.files[0], "avatar");
                  }
                }}
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFilePick(e.target.files[0], "banner");
                  }
                }}
              />

              {/* 1. Icon Section (1024x1024 1:1) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start pb-6 border-b border-border/70">
                {/* Left: Spec info */}
                <div className="sm:col-span-5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Icon</h3>
                    {avatarCooldownSeconds > 0 && (
                      <Badge variant="outline" className="text-[9px] text-amber-500 font-mono">
                        {formatCooldown(avatarCooldownSeconds)}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      <strong className="text-foreground font-medium">Dimensions:</strong> 1024x1024
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">Aspect Ratio:</strong> 1:1
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">File Types:</strong> PNG, GIF, JPG, WEBP
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">Max Size:</strong> 3MB
                    </p>
                  </div>

                  {avatarMeta ? (
                    <Badge variant="secondary" className="text-[10px] font-mono mt-1 bg-primary/10 text-primary border border-primary/20">
                      {avatarMeta.width}x{avatarMeta.height} • {(avatarMeta.sizeBytes / 1024).toFixed(1)} KB (Ready to save)
                    </Badge>
                  ) : botAvatarSizeBytes > 0 ? (
                    <Badge variant="outline" className="text-[10px] font-mono mt-1 text-muted-foreground">
                      {(botAvatarSizeBytes / 1024).toFixed(1)} KB active
                    </Badge>
                  ) : null}
                </div>

                {/* Right: Dropzone / Preview */}
                <div className="sm:col-span-7 flex flex-col items-start">
                  {avatarPreview ? (
                    <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-muted/20 p-3 w-full shadow-xs">
                      <div className="relative h-20 w-20 rounded-2xl overflow-hidden border border-border shadow-xs bg-background shrink-0">
                        <img
                          src={avatarPreview}
                          alt="Icon preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {avatarFile ? avatarFile.name : "Custom Bot Icon"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {avatarFile
                            ? "Cropped and ready to save"
                            : botAvatarUrl
                              ? "Active Discord bot icon"
                              : "Active custom icon"}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            onClick={() => avatarInputRef.current?.click()}
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
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsAvatarDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleImageFilePick(e.dataTransfer.files[0], "avatar");
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsAvatarDragging(true);
                      }}
                      onDragLeave={() => setIsAvatarDragging(false)}
                      onClick={() => avatarInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 cursor-pointer transition-all w-full ${
                        isAvatarDragging
                          ? "border-primary bg-primary/5 scale-[0.99]"
                          : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Upload className="h-4 w-4" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-foreground">
                          <span className="text-primary hover:underline">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          1:1 Square • Max 3MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Banner Section (680x240 17:6) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                {/* Left: Spec info */}
                <div className="sm:col-span-5 space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Banner</h3>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      <strong className="text-foreground font-medium">Dimensions:</strong> 680x240
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">Aspect Ratio:</strong> 17:6
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">File Types:</strong> PNG, GIF, JPG, WEBP
                    </p>
                    <p>
                      <strong className="text-foreground font-medium">Max Size:</strong> 3MB
                    </p>
                  </div>

                  {bannerMeta ? (
                    <Badge variant="secondary" className="text-[10px] font-mono mt-1 bg-primary/10 text-primary border border-primary/20">
                      {bannerMeta.width}x{bannerMeta.height} • {(bannerMeta.sizeBytes / 1024).toFixed(1)} KB (Ready to save)
                    </Badge>
                  ) : botBannerSizeBytes > 0 ? (
                    <Badge variant="outline" className="text-[10px] font-mono mt-1 text-muted-foreground">
                      {(botBannerSizeBytes / 1024).toFixed(1)} KB active
                    </Badge>
                  ) : null}
                </div>

                {/* Right: Dropzone / Preview */}
                <div className="sm:col-span-7 w-full flex flex-col items-start">
                  {bannerPreview ? (
                    <div className="w-full space-y-2.5">
                      <div className="relative w-full aspect-[17/6] rounded-xl overflow-hidden border border-border/80 shadow-xs bg-muted/30 group">
                        <img
                          src={bannerPreview}
                          alt="Banner preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {bannerFile ? bannerFile.name : "Custom Profile Banner"}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            onClick={() => bannerInputRef.current?.click()}
                          >
                            Change Image
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={handleRemoveBanner}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsBannerDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleImageFilePick(e.dataTransfer.files[0], "banner");
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsBannerDragging(true);
                      }}
                      onDragLeave={() => setIsBannerDragging(false)}
                      onClick={() => bannerInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all w-full aspect-[17/6] ${
                        isBannerDragging
                          ? "border-primary bg-primary/5 scale-[0.99]"
                          : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Upload className="h-4 w-4" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-foreground">
                          <span className="text-primary hover:underline">Drag or click to upload</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          17:6 ratio • Max 3MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-xs text-destructive p-3 rounded-xl bg-destructive/10 border border-destructive/20 shadow-xs animate-in fade-in-50">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live Discord User Profile Card Preview (5 cols) */}
        <div className="md:col-span-5 sticky top-6">
          <Card className="border-border/80 shadow-md bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Discord Mini-Profile Preview
                </CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono border-border">
                  LIVE PREVIEW
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="rounded-2xl border border-border/80 bg-[#111214] text-white overflow-hidden shadow-xl">
                {/* Top Banner: supports custom uploaded banner image or fallback color */}
                <div
                  className="h-24 w-full transition-colors relative overflow-hidden bg-[#2b2d31]"
                  style={{ backgroundColor: accentColor }}
                >
                  {bannerPreview ? (
                    <img
                      src={bannerPreview}
                      alt="Banner Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                  )}
                </div>

                {/* Avatar with Status Bubble */}
                <div className="px-4 pb-4 space-y-3 relative">
                  <div className="relative -mt-10 inline-block">
                    <div className="h-20 w-20 rounded-full border-4 border-[#111214] overflow-hidden bg-[#2b2d31] shadow-md">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Bot Avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center font-bold text-sm bg-primary text-primary-foreground">
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
                      className="rounded-lg border-l-4 bg-[#2b2d31]/80 p-2.5 text-xs text-[#dbdee1] flex items-center gap-2"
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
                Updates in real-time as you modify display nickname, icon, banner, and accent color.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Interactive Crop Modal (CreatorCore theme) */}
      <ImageCropperModal
        open={cropperState.open}
        imageSrc={cropperState.imageSrc}
        fileName={cropperState.fileName}
        originalMimeType={cropperState.originalMimeType}
        aspectRatio={cropperState.aspectRatio}
        title={cropperState.title}
        targetWidth={cropperState.targetWidth}
        targetHeight={cropperState.targetHeight}
        onApply={handleCropApply}
        onCancel={() => setCropperState((prev) => ({ ...prev, open: false, imageSrc: null }))}
      />
    </div>
  );
}
