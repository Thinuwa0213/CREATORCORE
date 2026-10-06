"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crop, ZoomIn, ZoomOut, RotateCcw, Check } from "lucide-react";

interface ImageCropperModalProps {
  open: boolean;
  imageSrc: string | null;
  fileName?: string | undefined;
  originalMimeType?: string | undefined;
  aspectRatio: number; // e.g. 1 for 1:1, 17/6 for 17:6
  title?: string;
  targetWidth?: number;
  targetHeight?: number;
  onApply: (result: {
    dataUri: string;
    file: File;
    width: number;
    height: number;
    sizeBytes: number;
  }) => void;
  onCancel: () => void;
}

export function ImageCropperModal({
  open,
  imageSrc,
  fileName = "image.png",
  originalMimeType,
  aspectRatio = 1,
  title = "Crop Image",
  targetWidth = 1024,
  targetHeight = 1024,
  onApply,
  onCancel,
}: ImageCropperModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initPanX: number; initPanY: number }>({
    startX: 0,
    startY: 0,
    initPanX: 0,
    initPanY: 0,
  });

  // Reset state when a new image or aspect ratio opens
  useEffect(() => {
    if (!open || !imageSrc) {
      setImgElement(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const img = new Image();
    // Only set crossOrigin if loading from external HTTP/HTTPS.
    // NEVER set crossOrigin on data: or blob: URIs as that marks the canvas tainted in Chromium!
    if (imageSrc.startsWith("http://") || imageSrc.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      setImgElement(img);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [open, imageSrc]);

  // Viewport and Crop Box Calculations
  const viewportWidth = 500;
  const viewportHeight = 310;

  let cropBoxWidth = 250;
  let cropBoxHeight = 250;

  if (aspectRatio >= 1) {
    cropBoxWidth = Math.min(440, viewportWidth - 40);
    cropBoxHeight = Math.round(cropBoxWidth / aspectRatio);
    if (cropBoxHeight > viewportHeight - 40) {
      cropBoxHeight = viewportHeight - 40;
      cropBoxWidth = Math.round(cropBoxHeight * aspectRatio);
    }
  } else {
    cropBoxHeight = Math.min(250, viewportHeight - 40);
    cropBoxWidth = Math.round(cropBoxHeight * aspectRatio);
  }

  const cropBoxLeft = (viewportWidth - cropBoxWidth) / 2;
  const cropBoxTop = (viewportHeight - cropBoxHeight) / 2;

  // Base scale calculation to cover crop box at zoom = 1
  const baseScale = imgElement
    ? Math.max(cropBoxWidth / imgElement.naturalWidth, cropBoxHeight / imgElement.naturalHeight)
    : 1;

  const currentScale = baseScale * zoom;
  const imgDisplayWidth = imgElement ? imgElement.naturalWidth * currentScale : 0;
  const imgDisplayHeight = imgElement ? imgElement.naturalHeight * currentScale : 0;

  // Clamping pan offsets to prevent empty space inside crop box
  const maxPanX = Math.max(0, (imgDisplayWidth - cropBoxWidth) / 2);
  const maxPanY = Math.max(0, (imgDisplayHeight - cropBoxHeight) / 2);

  const clampedPanX = Math.min(maxPanX, Math.max(-maxPanX, pan.x));
  const clampedPanY = Math.min(maxPanY, Math.max(-maxPanY, pan.y));

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPanX: clampedPanX,
      initPanY: clampedPanY,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setPan({
        x: dragStartRef.current.initPanX + dx,
        y: dragStartRef.current.initPanY + dy,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((prev) => Math.min(3.5, Math.max(1, prev + delta)));
  };

  // Reset to initial centered & fit state
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Apply Crop and generate high-DPI canvas
  const handleApply = () => {
    if (!imgElement) return;

    try {
      // Image top-left in canvas coordinate system
      const imgLeft = viewportWidth / 2 + clampedPanX - imgDisplayWidth / 2;
      const imgTop = viewportHeight / 2 + clampedPanY - imgDisplayHeight / 2;

      // Relative crop offset on displayed image
      const relX = cropBoxLeft - imgLeft;
      const relY = cropBoxTop - imgTop;

      // Map to natural image coordinates
      const sx = Math.max(0, relX / currentScale);
      const sy = Math.max(0, relY / currentScale);
      const sw = Math.min(imgElement.naturalWidth - sx, cropBoxWidth / currentScale);
      const sh = Math.min(imgElement.naturalHeight - sy, cropBoxHeight / currentScale);

      // Keep natural sharpness, avoid bloating small images with artificial upscaling,
      // and cap at targetWidth (1024 for avatar, 1360 for banner) for crisp display.
      const naturalCropWidth = Math.round(sw);
      const exportWidth = Math.min(targetWidth, Math.max(256, naturalCropWidth));
      const exportHeight = Math.round(exportWidth / aspectRatio);

      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Detect original format
      const isJpeg =
        originalMimeType === "image/jpeg" ||
        originalMimeType === "image/jpg" ||
        /\.(jpe?g)$/i.test(fileName || "") ||
        (imageSrc?.startsWith("data:image/jpeg") ?? false);

      const isWebp =
        originalMimeType === "image/webp" ||
        /\.webp$/i.test(fileName || "") ||
        (imageSrc?.startsWith("data:image/webp") ?? false);

      const isPng =
        originalMimeType === "image/png" ||
        /\.png$/i.test(fileName || "") ||
        (imageSrc?.startsWith("data:image/png") ?? false);

      // Default to JPEG for photographic uploads to keep file size compact (~80-160KB) without loss of visible quality.
      // Keep PNG for vector logos/transparent graphics.
      const exportMime = isPng ? "image/png" : isWebp ? "image/webp" : isJpeg ? "image/jpeg" : "image/jpeg";
      const exportQuality = exportMime === "image/jpeg" || exportMime === "image/webp" ? 0.90 : undefined;

      const ext = exportMime === "image/jpeg" ? ".jpg" : exportMime === "image/webp" ? ".webp" : ".png";
      const baseName = (fileName || "image").replace(/\.[^/.]+$/, "");
      const safeName = `${baseName}${ext}`;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (exportMime === "image/jpeg") {
        ctx.fillStyle = "#0d0e12";
        ctx.fillRect(0, 0, exportWidth, exportHeight);
      }
      ctx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, exportWidth, exportHeight);

      const applyWithDataUri = () => {
        const dataUri = canvas.toDataURL(exportMime, exportQuality);
        const base64Data = dataUri.split(",")[1] || "";
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const file = new File([bytes], safeName, { type: exportMime });
        onApply({
          dataUri,
          file,
          width: exportWidth,
          height: exportHeight,
          sizeBytes: bytes.byteLength,
        });
      };

      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              applyWithDataUri();
              return;
            }
            const file = new File([blob], safeName, { type: exportMime });
            const dataUri = canvas.toDataURL(exportMime, exportQuality);
            onApply({
              dataUri,
              file,
              width: exportWidth,
              height: exportHeight,
              sizeBytes: blob.size,
            });
          },
          exportMime,
          exportQuality,
        );
      } else {
        applyWithDataUri();
      }
    } catch (err) {
      console.error("Error cropping image:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden bg-card border-border/80 text-foreground shadow-2xl rounded-2xl z-[60]">
        <DialogHeader className="p-5 pb-4 border-b border-border/70 bg-card/60 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Crop className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
                <Badge variant="outline" className="text-[10px] font-mono font-medium border-border/80">
                  {aspectRatio === 1
                    ? "1:1 Square"
                    : Math.abs(aspectRatio - 700 / 260) < 0.1
                      ? "2.7:1 Banner"
                      : "17:6 Banner"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reposition and scale your image for the perfect fit.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Viewport Area */}
        <div className="p-5 flex flex-col items-center bg-muted/10">
          <div
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            style={{ width: viewportWidth, height: viewportHeight }}
            className="relative overflow-hidden rounded-xl border border-border/80 cursor-grab active:cursor-grabbing select-none shadow-inner"
          >
            {/* Subtle dark checkerboard background */}
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: "#0d0e12",
                backgroundImage: `
                  linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
                  linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.03) 75%),
                  linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.03) 75%)
                `,
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
              }}
            />

            {/* Render Image */}
            {imgElement && (
              <img
                src={imgElement.src}
                alt="Crop preview"
                draggable={false}
                style={{
                  position: "absolute",
                  left: `${viewportWidth / 2 + clampedPanX}px`,
                  top: `${viewportHeight / 2 + clampedPanY}px`,
                  width: `${imgDisplayWidth}px`,
                  height: `${imgDisplayHeight}px`,
                  transform: "translate(-50%, -50%)",
                  maxWidth: "none",
                  maxHeight: "none",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Dark Mask Overlay with CreatorCore styled crop border */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.72)`,
                left: `${cropBoxLeft}px`,
                top: `${cropBoxTop}px`,
                width: `${cropBoxWidth}px`,
                height: `${cropBoxHeight}px`,
                border: "2px solid rgba(255, 255, 255, 0.92)",
                borderRadius: aspectRatio === 1 ? "18px" : "12px",
              }}
            >
              {/* Rule-of-thirds grid guidelines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>
            </div>
          </div>

          {/* Controls Bar (Zoom Slider + Multiplier + Reset) */}
          <div className="w-full max-w-[480px] mt-4 flex items-center justify-between gap-3 p-2 rounded-xl border border-border/80 bg-card/80 backdrop-blur-xs">
            <div className="flex items-center gap-2.5 flex-1 px-1">
              <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="range"
                min="1"
                max="3.5"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
              <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-[11px] font-mono text-muted-foreground min-w-[32px] text-right">
                {zoom.toFixed(1)}x
              </span>
            </div>

            <div className="h-4 w-px bg-border" />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-5 bg-card border-t border-border flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Smart High-Quality Export &bull; Max {targetWidth}&times;{targetHeight}px (Optimized)
          </span>
          <div className="flex items-center gap-2.5 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-xs h-8 px-3.5"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="text-xs h-8 px-4 font-semibold gap-1.5 shadow-xs"
            >
              <Check className="h-3.5 w-3.5" />
              Apply Crop
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
