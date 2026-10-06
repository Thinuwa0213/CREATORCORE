"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Type,
  User,
  Palette,
  Upload,
  Crop,
  RotateCcw,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Move,
  Focus,
  Plus,
  Trash2,
  Lock,
  Crown,
  Layers,
  SlidersHorizontal,
  Grid,
  Image as ImageIcon,
  ArrowRight,
  ArrowDown,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { WELCOME_VARIABLES } from "@/lib/template-variables";
import { VariableChips } from "@/components/modules/variable-chips";
import { ImageCropperModal } from "../branding/image-cropper-modal";
import {
  DEFAULT_WELCOME_CONFIG,
  DEFAULT_BANNER_LAYERS,
  type WelcomeBannerConfig,
  type CanvasLayer,
} from "./welcome-types";

interface BannerStudioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WelcomeBannerConfig;
  onSave: (config: WelcomeBannerConfig) => void;
  serverName?: string;
  currentPlan?: "FREE" | "PRO" | "ENTERPRISE";
}

const GRADIENT_PRESETS = [
  {
    name: "Deep Navy",
    value: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #020617 100%)",
    bg: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #020617 100%)",
  },
  {
    name: "Obsidian",
    value: "linear-gradient(135deg, #09090b 0%, #0f172a 50%, #000000 100%)",
    bg: "linear-gradient(135deg, #09090b 0%, #0f172a 50%, #000000 100%)",
  },
  {
    name: "Cyber Teal",
    value: "linear-gradient(135deg, #020617 0%, #042f2e 50%, #0f172a 100%)",
    bg: "linear-gradient(135deg, #020617 0%, #042f2e 50%, #0f172a 100%)",
  },
  {
    name: "Ember Dusk",
    value: "linear-gradient(135deg, #1c1917 0%, #451a03 50%, #000000 100%)",
    bg: "linear-gradient(135deg, #1c1917 0%, #451a03 50%, #000000 100%)",
  },
  {
    name: "Royal Violet",
    value: "linear-gradient(135deg, #09090b 0%, #3b0764 50%, #020617 100%)",
    bg: "linear-gradient(135deg, #09090b 0%, #3b0764 50%, #020617 100%)",
  },
  {
    name: "Emerald Abyss",
    value: "linear-gradient(135deg, #020617 0%, #064e3b 50%, #09090b 100%)",
    bg: "linear-gradient(135deg, #020617 0%, #064e3b 50%, #09090b 100%)",
  },
];

const FONT_OPTIONS = ["Inter", "Montserrat", "Poppins", "Outfit", "Space Grotesk"];

export function BannerStudioModal({
  open,
  onOpenChange,
  config: initialConfig,
  onSave,
  serverName = "Creator Realm",
  currentPlan = "FREE",
}: BannerStudioModalProps) {
  const [config, setConfig] = useState<WelcomeBannerConfig>(initialConfig);
  const [inspectorTab, setInspectorTab] = useState<"properties" | "wallpaper">("properties");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snapGrid, setSnapGrid] = useState<number>(0); // 0 = Free, 5 = 5px, 10 = 10px

  // Custom gradient state
  const [gradientMode, setGradientMode] = useState<"presets" | "custom">("presets");
  const [customStart, setCustomStart] = useState<string>(
    initialConfig.customGradientStart ?? "#1e1b4b",
  );
  const [customEnd, setCustomEnd] = useState<string>(initialConfig.customGradientEnd ?? "#020617");
  const [customMiddle, setCustomMiddle] = useState<string>(
    initialConfig.customGradientMiddle ?? "#0f172a",
  );
  const [useMiddle, setUseMiddle] = useState<boolean>(initialConfig.useMiddleColor ?? false);
  const [customAngle, setCustomAngle] = useState<number>(initialConfig.gradientAngle ?? 135);

  const stageContainerRef = useRef<HTMLDivElement>(null);
  const stageObserverRef = useRef<ResizeObserver | null>(null);
  const stageTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const [stageScale, setStageScale] = useState<number>(1.38);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPro = currentPlan === "PRO" || currentPlan === "ENTERPRISE";

  // Callback ref guarantees measurement as soon as DOM element mounts inside Radix Dialog portal
  const setStageContainer = useCallback((node: HTMLDivElement | null) => {
    stageTimeoutsRef.current.forEach(clearTimeout);
    stageTimeoutsRef.current = [];

    if (stageObserverRef.current) {
      stageObserverRef.current.disconnect();
      stageObserverRef.current = null;
    }

    stageContainerRef.current = node;

    if (!node) return;

    const measureAndUpdate = () => {
      const width = node.clientWidth;
      if (width > 0) {
        setStageScale(width / 700);
      }
    };

    // Immediate & animation-aware measurements
    measureAndUpdate();
    requestAnimationFrame(measureAndUpdate);
    stageTimeoutsRef.current.push(setTimeout(measureAndUpdate, 40));
    stageTimeoutsRef.current.push(setTimeout(measureAndUpdate, 150));
    stageTimeoutsRef.current.push(setTimeout(measureAndUpdate, 350));

    // Continuous resize tracking
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setStageScale(width / 700);
        }
      }
    });

    observer.observe(node);
    stageObserverRef.current = observer;
  }, []);

  // Interactive Image Cropper Modal state
  const [cropperState, setCropperState] = useState<{
    open: boolean;
    imageSrc: string | null;
    fileName: string;
    originalMimeType?: string;
  }>({
    open: false,
    imageSrc: null,
    fileName: "wallpaper.png",
  });

  // Sync state when dialog opens
  useEffect(() => {
    if (open) {
      const initialLayers =
        initialConfig.layers && initialConfig.layers.length > 0
          ? initialConfig.layers
          : DEFAULT_BANNER_LAYERS;

      setConfig({
        ...initialConfig,
        overlayOpacity: initialConfig.overlayOpacity ?? 0,
        layers: initialLayers,
      });

      setSelectedLayerId(initialLayers[0]?.id ?? null);
      if (initialConfig.customGradientStart) setCustomStart(initialConfig.customGradientStart);
      if (initialConfig.customGradientEnd) setCustomEnd(initialConfig.customGradientEnd);
      if (initialConfig.customGradientMiddle) setCustomMiddle(initialConfig.customGradientMiddle);
      if (typeof initialConfig.useMiddleColor === "boolean")
        setUseMiddle(initialConfig.useMiddleColor);
      if (typeof initialConfig.gradientAngle === "number")
        setCustomAngle(initialConfig.gradientAngle);
    }
  }, [open, initialConfig]);

  const selectedLayer = config.layers.find((l) => l.id === selectedLayerId) ?? null;

  // Pointer drag interaction for layers with clean Click vs Drag threshold
  const handlePointerDown = useCallback(
    (layerId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedLayerId(layerId);

      const currentScale = stageScale > 0 ? stageScale : 1;
      const startPointerX = e.clientX;
      const startPointerY = e.clientY;

      const targetLayer = config.layers.find((l) => l.id === layerId);
      if (!targetLayer) return;

      const initialX = targetLayer.x ?? 0;
      const initialY = targetLayer.y ?? 0;
      let hasDragged = false;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const rawDist = Math.hypot(
          moveEvent.clientX - startPointerX,
          moveEvent.clientY - startPointerY,
        );
        if (!hasDragged && rawDist < 3) {
          // Ignore micro-jitters so clicks remain pure selections
          return;
        }

        if (!hasDragged) {
          hasDragged = true;
          setIsDragging(true);
        }

        const dx = (moveEvent.clientX - startPointerX) / currentScale;
        const dy = (moveEvent.clientY - startPointerY) / currentScale;

        let rawX = Math.round(initialX + dx);
        let rawY = Math.round(initialY + dy);

        if (snapGrid > 0) {
          rawX = Math.round(rawX / snapGrid) * snapGrid;
          rawY = Math.round(rawY / snapGrid) * snapGrid;
        }

        const clampedX = Math.max(-330, Math.min(330, rawX));
        const clampedY = Math.max(-110, Math.min(110, rawY));

        setConfig((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === layerId ? { ...l, x: clampedX, y: clampedY } : l,
          ),
        }));
      };

      const onPointerUp = () => {
        setIsDragging(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [config.layers, snapGrid, stageScale],
  );

  // Nudge selected layer by given virtual pixel delta (e.g. keyboard arrows or UI buttons)
  const nudgeSelectedLayer = useCallback(
    (dx: number, dy: number) => {
      if (!selectedLayerId) return;
      setConfig((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === selectedLayerId
            ? {
                ...l,
                x: Math.max(-330, Math.min(330, (l.x ?? 0) + dx)),
                y: Math.max(-110, Math.min(110, (l.y ?? 0) + dy)),
              }
            : l,
        ),
      }));
    },
    [selectedLayerId],
  );

  // Keyboard navigation: Arrow keys to nudge (Shift = 10px), Escape to deselect, Delete to remove
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in form controls
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }

      if (!selectedLayerId) return;

      const step = e.shiftKey ? 10 : snapGrid > 0 ? snapGrid : 1;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeSelectedLayer(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeSelectedLayer(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeSelectedLayer(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeSelectedLayer(0, step);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedLayerId(null);
      } else if (e.key === "Delete") {
        e.preventDefault();
        handleDeleteLayer(selectedLayerId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedLayerId, snapGrid, nudgeSelectedLayer]);

  // Click on canvas background to deselect active layer
  const handleCanvasClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-canvas-layer]")) {
      setSelectedLayerId(null);
    }
  };

  // Update specific property of selected layer
  const updateSelectedLayer = (updates: Partial<CanvasLayer>) => {
    if (!selectedLayerId) return;
    setConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l)),
    }));
  };

  // Add a new Text layer
  const handleAddTextLayer = () => {
    const newId = `layer-text-${Date.now()}`;
    const newLayer: CanvasLayer = {
      id: newId,
      type: "text",
      label: `Text ${config.layers.filter((l) => l.type === "text").length + 1}`,
      text: "Welcome to our server!",
      fontFamily: "Inter",
      fontSize: 20,
      color: "#FFFFFF",
      align: "center",
      x: 0,
      y: 0,
    };
    setConfig((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
    }));
    setSelectedLayerId(newId);
    setInspectorTab("properties");
  };

  // Add Avatar layer
  const handleAddAvatarLayer = () => {
    const existing = config.layers.find((l) => l.type === "avatar");
    if (existing) {
      setSelectedLayerId(existing.id);
      return;
    }
    const newId = `layer-avatar-${Date.now()}`;
    const newLayer: CanvasLayer = {
      id: newId,
      type: "avatar",
      label: "Member Avatar",
      x: 0,
      y: -35,
      size: 84,
      shape: "circle",
      borderColor: "#5865F2",
      borderWidth: 3,
    };
    setConfig((prev) => ({
      ...prev,
      layers: [newLayer, ...prev.layers],
    }));
    setSelectedLayerId(newId);
    setInspectorTab("properties");
  };

  // Restore Default Layers if layers were cleared
  const handleRestoreDefaultLayers = () => {
    setConfig((prev) => ({
      ...prev,
      layers: DEFAULT_BANNER_LAYERS,
    }));
    setSelectedLayerId(DEFAULT_BANNER_LAYERS[0]?.id ?? null);
  };

  // Delete a layer
  const handleDeleteLayer = (layerId: string) => {
    setConfig((prev) => {
      const remaining = prev.layers.filter((l) => l.id !== layerId);
      if (selectedLayerId === layerId) {
        setSelectedLayerId(remaining[0]?.id ?? null);
      }
      return {
        ...prev,
        layers: remaining,
      };
    });
  };

  // Apply custom gradient changes live
  const updateCustomGradient = (
    start: string,
    end: string,
    middle: string,
    midEnabled: boolean,
    angle: number,
  ) => {
    setCustomStart(start);
    setCustomEnd(end);
    setCustomMiddle(middle);
    setUseMiddle(midEnabled);
    setCustomAngle(angle);

    const gradientCss = midEnabled
      ? `linear-gradient(${angle}deg, ${start} 0%, ${middle} 50%, ${end} 100%)`
      : `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`;

    setConfig((prev) => ({
      ...prev,
      bgType: "gradient",
      bgGradient: gradientCss,
      bgImageUrl: null,
      customGradientStart: start,
      customGradientEnd: end,
      customGradientMiddle: middle,
      useMiddleColor: midEnabled,
      gradientAngle: angle,
    }));
  };

  // Select Preset Gradient
  const handleSelectPreset = (presetValue: string) => {
    setConfig((prev) => ({
      ...prev,
      bgType: "gradient",
      bgGradient: presetValue,
      bgImageUrl: null,
    }));
  };

  // Handle image upload with Pro gating check & Cropper modal trigger
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isPro) {
      alert("Custom wallpaper images require the PRO plan.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image file must be under 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src === "string") {
        setCropperState({
          open: true,
          imageSrc: src,
          fileName: file.name,
          originalMimeType: file.type,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Apply cropped high-DPI image back to Welcome Banner
  const handleCropApply = (result: {
    dataUri: string;
    file: File;
    width: number;
    height: number;
    sizeBytes: number;
  }) => {
    setConfig((prev) => ({
      ...prev,
      bgType: "image",
      bgImageUrl: result.dataUri,
      bgImageFit: "cover",
      overlayOpacity: 0, // 100% Brightness - No dimming
    }));
    setCropperState((prev) => ({ ...prev, open: false, imageSrc: null }));
  };

  // Re-crop or reposition currently active wallpaper
  const handleOpenCropperForCurrent = () => {
    if (!config.bgImageUrl) return;
    setCropperState({
      open: true,
      imageSrc: config.bgImageUrl,
      fileName: "wallpaper.png",
      originalMimeType: "image/png",
    });
  };

  const handleReset = () => {
    setConfig(DEFAULT_WELCOME_CONFIG.bannerConfig);
    setSelectedLayerId(DEFAULT_BANNER_LAYERS[0]?.id ?? null);
  };

  const handleSave = () => {
    onSave(config);
    onOpenChange(false);
  };

  const hasAvatarLayer = config.layers.some((l) => l.type === "avatar");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-background border-border sm:max-h-[94vh] flex flex-col shadow-2xl">
        {/* Studio Header */}
        <DialogHeader className="px-6 py-3.5 border-b border-border bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <DialogTitle className="text-base font-bold text-foreground tracking-tight">
                Welcome Banner Studio
              </DialogTitle>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider font-semibold">
                CreatorCore Studio
              </Badge>
              {isPro ? (
                <Badge variant="default" className="text-[10px] uppercase font-mono tracking-wider gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Crown className="h-3 w-3" />
                  <span>PRO UNLOCKED</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-mono tracking-wider text-muted-foreground">
                  FREE TIER
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Drag layers freely on the stage, add or delete elements, and customize typography and avatars.
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Studio Body: Interactive Canvas Viewport + Split Control Decks */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* 1. Canvas Stage Viewport (700 x 260 Virtual Bounds) */}
          <div className="space-y-2">
            {/* Stage Toolbar */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground flex items-center gap-1.5">
                  <Move className="h-3.5 w-3.5 text-primary" />
                  <span>Canvas Stage</span>
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">700×260px</span>

                {selectedLayer && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {selectedLayer.label} · X: {selectedLayer.x}px, Y: {selectedLayer.y}px
                    </Badge>

                    {/* Quick Nudge Arrow Keys */}
                    <div className="flex items-center bg-muted/60 rounded-md border border-border p-0.5 gap-0.5" title="Nudge layer (or use keyboard arrows ↑ ↓ ← →)">
                      <button
                        type="button"
                        onClick={() => nudgeSelectedLayer(-1, 0)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-bold"
                        title="Nudge Left (ArrowLeft)"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeSelectedLayer(0, -1)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-bold"
                        title="Nudge Up (ArrowUp)"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeSelectedLayer(0, 1)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-bold"
                        title="Nudge Down (ArrowDown)"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeSelectedLayer(1, 0)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-bold"
                        title="Nudge Right (ArrowRight)"
                      >
                        →
                      </button>
                    </div>

                    <span className="text-[10px] text-muted-foreground hidden md:inline font-mono">
                      (Arrow keys to nudge)
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Snap Grid Toggle */}
                <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md border border-border">
                  <Grid className="h-3 w-3 text-muted-foreground ml-1" />
                  <span className="text-[10px] text-muted-foreground mr-1">Snap:</span>
                  {[0, 5, 10].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSnapGrid(val)}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                        snapGrid === val
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {val === 0 ? "Off" : `${val}px`}
                    </button>
                  ))}
                </div>

                {selectedLayer && (
                  <button
                    type="button"
                    onClick={() => updateSelectedLayer({ x: 0, y: selectedLayer.type === "avatar" ? -35 : 0 })}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Focus className="h-3 w-3" />
                    <span>Center Layer</span>
                  </button>
                )}
              </div>
            </div>

            {/* Virtual Canvas Stage Container */}
            <div
              ref={setStageContainer}
              onClick={handleCanvasClick}
              className="relative w-full aspect-[700/260] rounded-xl overflow-hidden border border-border/80 shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-zinc-950 select-none cursor-default group"
              style={{
                backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              {/* Virtual 700x260 Canvas Stage (Pixel-for-pixel WYSIWYG match with Discord) */}
              <div
                onClick={handleCanvasClick}
                style={{
                  width: "700px",
                  height: "260px",
                  transform: `scale(${stageScale > 0 ? stageScale : 1})`,
                  transformOrigin: "top left",
                }}
                className="absolute top-0 left-0 pointer-events-auto select-none flex items-center justify-center overflow-hidden"
              >
              {/* Wallpaper Background (100% Vibrant Brightness, No Dimming by default) */}
              {config.bgType === "image" && config.bgImageUrl ? (
                <div
                  className="absolute inset-0 transition-all"
                  style={{
                    backgroundImage: `url(${config.bgImageUrl})`,
                    backgroundSize:
                      config.bgImageFit === "contain"
                        ? "contain"
                        : config.bgImageFit === "fill"
                          ? "100% 100%"
                          : "cover",
                    backgroundPosition:
                      config.bgImagePosition === "top"
                        ? "center top"
                        : config.bgImagePosition === "bottom"
                          ? "center bottom"
                          : "center center",
                    backgroundRepeat: "no-repeat",
                  }}
                />
              ) : config.bgGradient?.startsWith("linear-gradient") ? (
                <div
                  className="absolute inset-0 transition-all"
                  style={{ background: config.bgGradient }}
                />
              ) : (
                <div className={`absolute inset-0 bg-linear-to-r ${config.bgGradient}`} />
              )}

              {/* Contrast Lighting Overlay (Only applied if user drags slider > 0) */}
              {config.overlayOpacity > 0 && (
                <div
                  className="absolute inset-0 bg-black pointer-events-none transition-opacity"
                  style={{ opacity: config.overlayOpacity }}
                />
              )}

              {/* Canvas Center Anchor & Interactive Drag Elements */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {config.layers.map((layer) => {
                  if (layer.type === "avatar") {
                    return (
                      <div
                        key={layer.id}
                        data-canvas-layer={layer.id}
                        onPointerDown={(e) => handlePointerDown(layer.id, e)}
                        style={{
                          transform: `translate(${layer.x}px, ${layer.y}px)`,
                          width: `${layer.size ?? 84}px`,
                          height: `${layer.size ?? 84}px`,
                          borderColor: layer.borderColor ?? "#5865F2",
                          borderWidth: `${layer.borderWidth ?? 3}px`,
                          borderStyle: "solid",
                        }}
                        className={`absolute overflow-hidden flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing shadow-2xl transition-all ${
                          layer.shape === "squircle" ? "rounded-2xl" : "rounded-full"
                        } ${
                          selectedLayerId === layer.id
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-black/90 shadow-primary/20"
                            : "hover:ring-2 hover:ring-white/40"
                        }`}
                      >
                        {/* Perfect Seamless Circular Avatar Inner - Guaranteed Zero Square Clipping */}
                        <div className="w-full h-full rounded-[inherit] overflow-hidden bg-gradient-to-b from-indigo-600/40 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center select-none">
                          <User className="w-1/2 h-1/2 text-white/90 drop-shadow-sm" />
                        </div>
                      </div>
                    );
                  }

                  if (layer.type === "text") {
                    return (
                      <div
                        key={layer.id}
                        data-canvas-layer={layer.id}
                        onPointerDown={(e) => handlePointerDown(layer.id, e)}
                        style={{
                          transform: `translate(${layer.x}px, ${layer.y}px)`,
                          fontSize: `${layer.fontSize ?? 20}px`,
                          color: layer.color ?? "#FFFFFF",
                          fontFamily: layer.fontFamily ?? "Inter",
                          textAlign: layer.align ?? "center",
                        }}
                        className={`absolute font-extrabold tracking-tight drop-shadow-md select-none pointer-events-auto cursor-grab active:cursor-grabbing px-2 py-0.5 rounded transition-all max-w-[90%] whitespace-nowrap ${
                          selectedLayerId === layer.id
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-black/90 bg-black/40 backdrop-blur-xs"
                            : "hover:ring-1 hover:ring-white/40 hover:bg-black/20"
                        }`}
                      >
                        {(layer.text ?? "")
                          .replace(/{server}/g, serverName)
                          .replace(/{user\.name}/g, "Alex")
                          .replace(/{memberCount}/g, "1,420")
                          .replace(/{user}/g, "@NewMember")}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>

              {/* End of inner 700x260 canvas */}
              </div>

              {/* Dynamic Drag feedback pill (on outer stage container) */}
              {isDragging && (
                <div className="absolute top-2.5 right-2.5 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono px-2.5 py-1 rounded-full pointer-events-none border border-white/10 shadow-lg flex items-center gap-1.5 animate-pulse z-10">
                  <Move className="h-3 w-3 text-primary" />
                  <span>Dragging {selectedLayer?.label ?? "element"}...</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. CreatorCore Studio Workbench: Split Layer Hierarchy & Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
            {/* Left Deck (Col 5): Layers Stack & Management */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground">Canvas Layers</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {config.layers.length}
                  </Badge>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTextLayer}
                    className="gap-1 text-[11px] h-7 px-2 border-border hover:bg-muted"
                  >
                    <Plus className="h-3 w-3 text-primary" />
                    <span>Text</span>
                  </Button>

                  {!hasAvatarLayer && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddAvatarLayer}
                      className="gap-1 text-[11px] h-7 px-2 border-border hover:bg-muted"
                    >
                      <Plus className="h-3 w-3 text-blue-400" />
                      <span>Avatar</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Layers Stack List */}
              <div className="space-y-1.5">
                {config.layers.map((layer) => {
                  const isSelected = selectedLayerId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      onClick={() => {
                        setSelectedLayerId(layer.id);
                        setInspectorTab("properties");
                      }}
                      className={`group flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40 shadow-xs"
                          : "border-border bg-muted/20 hover:border-foreground/30 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {layer.type === "avatar" ? (
                          <div className="p-1 rounded bg-blue-500/10 text-blue-400 shrink-0">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <div className="p-1 rounded bg-amber-500/10 text-amber-400 shrink-0">
                            <Type className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div className="truncate">
                          <span className="block truncate text-xs">{layer.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono block">
                            X: {layer.x}px · Y: {layer.y}px
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateSelectedLayer({ x: 0, y: layer.type === "avatar" ? -35 : 0 });
                          }}
                          title="Center element"
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Focus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLayer(layer.id);
                          }}
                          title="Delete layer"
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {config.layers.length === 0 && (
                  <div className="p-6 rounded-lg border border-dashed border-border text-center space-y-3">
                    <p className="text-xs text-muted-foreground">No layers on canvas.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddTextLayer}
                        className="text-xs h-7"
                      >
                        + Add Text
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddAvatarLayer}
                        className="text-xs h-7"
                      >
                        + Add Avatar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleRestoreDefaultLayers}
                        className="text-xs h-7 gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Restore Defaults</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Deck (Col 7): Live Inspector & Property Controls */}
            <div className="lg:col-span-7 space-y-3">
              {/* Deck Tabs */}
              <div className="flex border-b border-border gap-2">
                <button
                  type="button"
                  onClick={() => setInspectorTab("properties")}
                  className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === "properties"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Layer Properties</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("wallpaper")}
                  className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === "wallpaper"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Palette className="h-3.5 w-3.5" />
                  <span>Theme &amp; Wallpaper</span>
                </button>
              </div>

              {/* INSPECTOR TAB 1: Selected Layer Properties */}
              {inspectorTab === "properties" && (
                <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-4">
                  {selectedLayer ? (
                    <>
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-bold text-foreground">
                            {selectedLayer.label}
                          </Label>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {selectedLayer.type}
                          </Badge>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLayer(selectedLayer.id)}
                          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7 gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </Button>
                      </div>

                      {/* TEXT LAYER CONTROLS */}
                      {selectedLayer.type === "text" && (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Text Content</Label>
                            <Input
                              value={selectedLayer.text ?? ""}
                              onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                              placeholder="Welcome message..."
                              className="text-xs"
                            />
                            {/* Variable chips insertion */}
                            <VariableChips
                              variables={WELCOME_VARIABLES}
                              onInsert={(token) =>
                                updateSelectedLayer({
                                  text: (selectedLayer.text ?? "") + " " + token,
                                })
                              }
                              className="pt-1"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Font</Label>
                              <select
                                value={selectedLayer.fontFamily ?? "Inter"}
                                onChange={(e) =>
                                  updateSelectedLayer({ fontFamily: e.target.value })
                                }
                                className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                              >
                                {FONT_OPTIONS.map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Text Color</Label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="color"
                                  value={selectedLayer.color ?? "#FFFFFF"}
                                  onChange={(e) =>
                                    updateSelectedLayer({ color: e.target.value })
                                  }
                                  className="h-8 w-10 rounded border border-border bg-transparent cursor-pointer p-0.5"
                                />
                                <Input
                                  value={selectedLayer.color ?? "#FFFFFF"}
                                  onChange={(e) =>
                                    updateSelectedLayer({ color: e.target.value })
                                  }
                                  className="h-8 text-xs font-mono"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Size ({selectedLayer.fontSize ?? 20}px)
                              </Label>
                              <input
                                type="range"
                                min="12"
                                max="48"
                                step="1"
                                value={selectedLayer.fontSize ?? 20}
                                onChange={(e) =>
                                  updateSelectedLayer({ fontSize: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer mt-2"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <Label className="text-[11px] text-muted-foreground">Alignment</Label>
                            <div className="flex gap-1">
                              {(["left", "center", "right"] as const).map((align) => (
                                <Button
                                  key={align}
                                  type="button"
                                  variant={selectedLayer.align === align ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => updateSelectedLayer({ align })}
                                  className="h-7 px-2.5"
                                >
                                  {align === "left" && <AlignLeft className="h-3.5 w-3.5" />}
                                  {align === "center" && <AlignCenter className="h-3.5 w-3.5" />}
                                  {align === "right" && <AlignRight className="h-3.5 w-3.5" />}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {/* Precision Coordinate Sliders */}
                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-[11px] text-muted-foreground">X Offset</span>
                                <span className="font-mono text-[11px]">{selectedLayer.x}px</span>
                              </div>
                              <input
                                type="range"
                                min="-300"
                                max="300"
                                step="2"
                                value={selectedLayer.x}
                                onChange={(e) =>
                                  updateSelectedLayer({ x: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-[11px] text-muted-foreground">Y Offset</span>
                                <span className="font-mono text-[11px]">{selectedLayer.y}px</span>
                              </div>
                              <input
                                type="range"
                                min="-110"
                                max="110"
                                step="2"
                                value={selectedLayer.y}
                                onChange={(e) =>
                                  updateSelectedLayer({ y: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AVATAR LAYER CONTROLS */}
                      {selectedLayer.type === "avatar" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-xs">
                                <Label className="text-xs font-semibold">Avatar Size</Label>
                                <span className="text-muted-foreground font-mono text-[11px]">
                                  {selectedLayer.size ?? 84}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="40"
                                max="180"
                                step="2"
                                value={selectedLayer.size ?? 84}
                                onChange={(e) =>
                                  updateSelectedLayer({ size: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Shape</Label>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant={selectedLayer.shape !== "squircle" ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => updateSelectedLayer({ shape: "circle" })}
                                  className="text-xs flex-1 h-8"
                                >
                                  Circle (Full)
                                </Button>
                                <Button
                                  type="button"
                                  variant={selectedLayer.shape === "squircle" ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => updateSelectedLayer({ shape: "squircle" })}
                                  className="text-xs flex-1 h-8"
                                >
                                  Squircle
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Border Color</Label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={selectedLayer.borderColor ?? "#5865F2"}
                                  onChange={(e) =>
                                    updateSelectedLayer({ borderColor: e.target.value })
                                  }
                                  className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer p-0.5"
                                />
                                <Input
                                  value={selectedLayer.borderColor ?? "#5865F2"}
                                  onChange={(e) =>
                                    updateSelectedLayer({ borderColor: e.target.value })
                                  }
                                  className="text-xs font-mono h-8"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-xs">
                                <Label className="text-xs font-semibold">Border Width</Label>
                                <span className="text-muted-foreground font-mono text-[11px]">
                                  {selectedLayer.borderWidth ?? 3}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="8"
                                step="1"
                                value={selectedLayer.borderWidth ?? 3}
                                onChange={(e) =>
                                  updateSelectedLayer({ borderWidth: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Precision Coordinate Sliders */}
                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-[11px] text-muted-foreground">X Offset</span>
                                <span className="font-mono text-[11px]">{selectedLayer.x}px</span>
                              </div>
                              <input
                                type="range"
                                min="-300"
                                max="300"
                                step="2"
                                value={selectedLayer.x}
                                onChange={(e) =>
                                  updateSelectedLayer({ x: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-[11px] text-muted-foreground">Y Offset</span>
                                <span className="font-mono text-[11px]">{selectedLayer.y}px</span>
                              </div>
                              <input
                                type="range"
                                min="-110"
                                max="110"
                                step="2"
                                value={selectedLayer.y}
                                onChange={(e) =>
                                  updateSelectedLayer({ y: parseInt(e.target.value, 10) })
                                }
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground text-xs">
                      Select any layer from the left list or click directly on the canvas stage to configure properties.
                    </div>
                  )}
                </div>
              )}

              {/* INSPECTOR TAB 2: Themes & Wallpaper (Redesigned with Prominent Mode Selection & Manual Color Customizer) */}
              {inspectorTab === "wallpaper" && (
                <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-4">
                  {/* Primary Background Type Selector: Gradient vs Image Wallpaper */}
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-2 block">
                      Background Source
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Option 1: Gradient Colors */}
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            bgType: "gradient",
                          }))
                        }
                        className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                          config.bgType === "gradient"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                            : "border-border bg-muted/20 hover:border-foreground/30 hover:bg-muted/30"
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            config.bgType === "gradient"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Palette className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">
                              Gradient Colors
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[9px] text-emerald-500 border-emerald-500/30 px-1 py-0"
                            >
                              FREE
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                            Curated dark themes or custom color picker
                          </p>
                        </div>
                      </button>

                      {/* Option 2: Image Wallpaper */}
                      <button
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({
                            ...prev,
                            bgType: "image",
                          }));
                        }}
                        className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                          config.bgType === "image"
                            ? "border-amber-500/70 bg-amber-500/10 ring-1 ring-amber-500/40 shadow-xs"
                            : "border-border bg-muted/20 hover:border-foreground/30 hover:bg-muted/30"
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            config.bgType === "image"
                              ? "bg-amber-500 text-black font-bold"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">
                              Image Wallpaper
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[9px] font-bold text-amber-400 border-amber-500/40 px-1 py-0"
                            >
                              PRO
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                            Upload high-res custom server artwork
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* SECTION A: GRADIENT BUILDER (Active when bgType === "gradient") */}
                  {config.bgType === "gradient" && (
                    <div className="space-y-4 pt-1 border-t border-border">
                      {/* Sub-mode toggle: Preset Themes vs Manual Customizer */}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1.5 p-1 bg-muted/40 rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => setGradientMode("presets")}
                            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                              gradientMode === "presets"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Preset Themes (6)
                          </button>
                          <button
                            type="button"
                            onClick={() => setGradientMode("custom")}
                            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                              gradientMode === "custom"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Custom Color Picker
                          </button>
                        </div>

                        <span className="text-[11px] text-muted-foreground">
                          {gradientMode === "presets" ? "1-Click Styles" : "Manual RGB / Hex"}
                        </span>
                      </div>

                      {/* SUB-VIEW 1: Presets Swatches */}
                      {gradientMode === "presets" && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 animate-in fade-in duration-200">
                          {GRADIENT_PRESETS.map((preset) => {
                            const isSelected = config.bgGradient === preset.value;
                            return (
                              <button
                                key={preset.name}
                                type="button"
                                onClick={() => handleSelectPreset(preset.value)}
                                className={`group flex flex-col items-center gap-1.5 p-2 rounded-lg border text-left cursor-pointer transition-all ${
                                  isSelected
                                    ? "border-primary ring-1 ring-primary/40 bg-primary/10 shadow-xs"
                                    : "border-border hover:border-foreground/30 bg-muted/20"
                                }`}
                              >
                                <div
                                  className="w-full h-9 rounded-md border border-white/10 shadow-xs relative flex items-center justify-center"
                                  style={{ background: preset.bg }}
                                >
                                  {isSelected && (
                                    <div className="bg-black/60 rounded-full p-0.5 text-primary border border-white/20">
                                      <Check className="h-3 w-3" />
                                    </div>
                                  )}
                                </div>
                                <span className="text-[11px] font-medium text-foreground truncate w-full text-center">
                                  {preset.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* SUB-VIEW 2: Manual Custom Gradient Builder */}
                      {gradientMode === "custom" && (
                        <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-3 animate-in fade-in duration-200">
                          {/* Live Swatch Preview */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="font-semibold text-foreground">Live Gradient Swatch</span>
                              <span className="text-muted-foreground font-mono">{customAngle}° Direction</span>
                            </div>
                            <div
                              className="w-full h-9 rounded-md border border-white/20 shadow-inner"
                              style={{
                                background: useMiddle
                                  ? `linear-gradient(${customAngle}deg, ${customStart} 0%, ${customMiddle} 50%, ${customEnd} 100%)`
                                  : `linear-gradient(${customAngle}deg, ${customStart} 0%, ${customEnd} 100%)`,
                              }}
                            />
                          </div>

                          {/* Color Selectors Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {/* Color 1: Start Color */}
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Start Color</Label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={customStart}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      e.target.value,
                                      customEnd,
                                      customMiddle,
                                      useMiddle,
                                      customAngle,
                                    )
                                  }
                                  className="h-8 w-10 rounded border border-border bg-transparent cursor-pointer p-0.5"
                                />
                                <Input
                                  value={customStart}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      e.target.value,
                                      customEnd,
                                      customMiddle,
                                      useMiddle,
                                      customAngle,
                                    )
                                  }
                                  className="text-xs font-mono h-8"
                                />
                              </div>
                            </div>

                            {/* Color 2: End Color */}
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">End Color</Label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={customEnd}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      customStart,
                                      e.target.value,
                                      customMiddle,
                                      useMiddle,
                                      customAngle,
                                    )
                                  }
                                  className="h-8 w-10 rounded border border-border bg-transparent cursor-pointer p-0.5"
                                />
                                <Input
                                  value={customEnd}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      customStart,
                                      e.target.value,
                                      customMiddle,
                                      useMiddle,
                                      customAngle,
                                    )
                                  }
                                  className="text-xs font-mono h-8"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Optional Color 3: Middle Accent Color */}
                          <div className="pt-2 border-t border-border/60 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={useMiddle}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      customStart,
                                      customEnd,
                                      customMiddle,
                                      e.target.checked,
                                      customAngle,
                                    )
                                  }
                                  className="rounded border-border accent-primary"
                                />
                                <span>Add 3-Stop Accent Color (Middle)</span>
                              </label>

                              {useMiddle && (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  3-Stop Active
                                </Badge>
                              )}
                            </div>

                            {useMiddle && (
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="color"
                                  value={customMiddle}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      customStart,
                                      customEnd,
                                      e.target.value,
                                      true,
                                      customAngle,
                                    )
                                  }
                                  className="h-8 w-10 rounded border border-border bg-transparent cursor-pointer p-0.5"
                                />
                                <Input
                                  value={customMiddle}
                                  onChange={(e) =>
                                    updateCustomGradient(
                                      customStart,
                                      customEnd,
                                      e.target.value,
                                      true,
                                      customAngle,
                                    )
                                  }
                                  className="text-xs font-mono h-8 max-w-[140px]"
                                />
                                <span className="text-[11px] text-muted-foreground">
                                  Blends between start and end.
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Gradient Angle Buttons & Slider */}
                          <div className="pt-2 border-t border-border/60 space-y-2">
                            <Label className="text-[11px] text-muted-foreground block">
                              Gradient Direction Angle
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { label: "Diagonal", deg: 135, icon: ArrowDownRight },
                                { label: "Horizontal", deg: 90, icon: ArrowRight },
                                { label: "Vertical", deg: 180, icon: ArrowDown },
                                { label: "Angled", deg: 45, icon: ArrowUpRight },
                              ].map((item) => (
                                <Button
                                  key={item.deg}
                                  type="button"
                                  variant={customAngle === item.deg ? "default" : "outline"}
                                  size="sm"
                                  onClick={() =>
                                    updateCustomGradient(
                                      customStart,
                                      customEnd,
                                      customMiddle,
                                      useMiddle,
                                      item.deg,
                                    )
                                  }
                                  className="text-xs h-7 gap-1 px-2.5"
                                >
                                  <item.icon className="h-3 w-3" />
                                  <span>
                                    {item.label} ({item.deg}°)
                                  </span>
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SECTION B: CUSTOM IMAGE WALLPAPER (Active when bgType === "image") */}
                  {config.bgType === "image" && (
                    <div className="space-y-4 pt-1 border-t border-border animate-in fade-in duration-200">
                      {isPro ? (
                        <div className="space-y-3">
                          {config.bgImageUrl ? (
                            <div className="space-y-3">
                              <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className="w-16 h-10 rounded-md border border-border bg-cover bg-center shrink-0 shadow-xs"
                                    style={{ backgroundImage: `url(${config.bgImageUrl})` }}
                                  />
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold text-foreground block truncate">
                                      Custom Wallpaper Active
                                    </span>
                                    <span className="text-[11px] text-emerald-400 block font-mono">
                                      Displaying at 100% Brightness
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleOpenCropperForCurrent}
                                    className="text-xs h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 font-medium"
                                  >
                                    <Crop className="h-3.5 w-3.5" />
                                    <span>Crop / Reposition</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-xs h-8 gap-1"
                                  >
                                    <Upload className="h-3.5 w-3.5" />
                                    <span>Change</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setConfig((prev) => ({
                                        ...prev,
                                        bgType: "gradient",
                                        bgImageUrl: null,
                                      }))
                                    }
                                    className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </div>

                              {/* Image Fit & Position Controls */}
                              <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Image Fit (Crop / Scale)</Label>
                                    <div className="flex gap-1.5">
                                      {[
                                        { id: "cover", label: "Cover" },
                                        { id: "fill", label: "Fit 100% (No Crop)" },
                                        { id: "contain", label: "Contain" },
                                      ].map((opt) => (
                                        <Button
                                          key={opt.id}
                                          type="button"
                                          variant={
                                            (config.bgImageFit ?? "cover") === opt.id
                                              ? "default"
                                              : "outline"
                                          }
                                          size="sm"
                                          onClick={() =>
                                            setConfig((prev) => ({
                                              ...prev,
                                              bgImageFit: opt.id as "cover" | "contain" | "fill",
                                            }))
                                          }
                                          className="text-xs h-7 px-2 flex-1"
                                        >
                                          {opt.label}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Vertical Focus</Label>
                                    <div className="flex gap-1.5">
                                      {[
                                        { id: "top", label: "Top" },
                                        { id: "center", label: "Center" },
                                        { id: "bottom", label: "Bottom" },
                                      ].map((opt) => (
                                        <Button
                                          key={opt.id}
                                          type="button"
                                          variant={
                                            (config.bgImagePosition ?? "center") === opt.id
                                              ? "default"
                                              : "outline"
                                          }
                                          size="sm"
                                          onClick={() =>
                                            setConfig((prev) => ({
                                              ...prev,
                                              bgImagePosition: opt.id as "top" | "center" | "bottom",
                                            }))
                                          }
                                          className="text-xs h-7 px-2 flex-1"
                                        >
                                          {opt.label}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors text-center space-y-2">
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={handleImageUpload}
                                  className="hidden"
                                />
                                <div className="p-2.5 rounded-full bg-primary/10 text-primary w-fit mx-auto">
                                  <Upload className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-foreground">
                                    Upload Wallpaper Image
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Supports PNG, JPG, or WebP up to 5MB.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="text-xs h-8 gap-1.5"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  <span>Select Artwork File</span>
                                </Button>
                              </div>

                              {/* Recommended Size & Cropper Guidelines */}
                              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-1.5 text-muted-foreground">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                  <span>📐 Recommended Banner Resolution</span>
                                </span>
                                <p>
                                  Ideal resolution is <strong className="text-foreground">1024 × 380 px</strong> or{" "}
                                  <strong className="text-foreground">700 × 260 px</strong> (Aspect ratio: <strong className="text-foreground">~2.7 : 1</strong>).
                                </p>
                                <p className="text-[11px] text-muted-foreground/90">
                                  ✂️ <strong className="text-foreground">Interactive Image Cropper:</strong> When you pick any artwork or wallpaper, the crop tool opens automatically so you can zoom, pan, and frame your image perfectly!
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Free Tier Locked Notice */
                        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                                <Crown className="h-4 w-4" />
                                <span>Custom Wallpaper Requires PRO Plan</span>
                              </span>
                              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                                Uploading custom high-res background images is a PRO feature. All preset gradients, custom manual gradients, avatars, and text layers are 100% Free for everyone.
                              </p>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              alert(
                                "To upload custom wallpaper images, please upgrade to the PRO plan in Server Settings.",
                              )
                            }
                            className="gap-1.5 text-xs h-8 border-amber-500/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 font-semibold"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>Unlock Custom Wallpaper with PRO</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contrast Lighting Slider (Always available at bottom of tab) */}
                  <div className="space-y-1.5 pt-3 border-t border-border">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="text-xs font-semibold">Contrast Darkening</Label>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {Math.round(config.overlayOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.8"
                      step="0.05"
                      value={config.overlayOpacity}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, overlayOpacity: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Default is 0% (full vibrant brightness). Increase only if bright backgrounds make white text hard to read.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            className="text-xs gap-1.5 h-9 bg-primary text-primary-foreground font-semibold"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Apply to Welcome Card</span>
          </Button>
        </div>
      </DialogContent>

      {/* Interactive Image Cropper Modal */}
      <ImageCropperModal
        open={cropperState.open}
        imageSrc={cropperState.imageSrc}
        fileName={cropperState.fileName}
        originalMimeType={cropperState.originalMimeType}
        aspectRatio={700 / 260}
        title="Crop Welcome Wallpaper"
        targetWidth={1024}
        targetHeight={380}
        onApply={handleCropApply}
        onCancel={() => setCropperState((prev) => ({ ...prev, open: false, imageSrc: null }))}
      />
    </Dialog>
  );
}
