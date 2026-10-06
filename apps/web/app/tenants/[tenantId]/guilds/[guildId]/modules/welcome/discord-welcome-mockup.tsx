"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Users,
  User,
  Bell,
  Sparkles,
  Hash,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import type { WelcomeBannerConfig } from "./welcome-types";

interface DiscordWelcomeMockupProps {
  botName?: string;
  botAvatarUrl?: string | null;
  serverName?: string;
  channelName: string;
  messageText: string;
  sendDm: boolean;
  customCanvasCard: boolean;
  rulesGate: boolean;
  bannerConfig: WelcomeBannerConfig;
  onOpenStudio?: () => void;
}

export function DiscordWelcomeMockup({
  botName = "CreatorBot",
  botAvatarUrl,
  serverName = "Creator Realm",
  channelName,
  messageText,
  sendDm,
  customCanvasCard,
  rulesGate,
  bannerConfig,
  onOpenStudio,
}: DiscordWelcomeMockupProps) {
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);

  useEffect(() => {
    const updateScale = () => {
      if (cardContainerRef.current) {
        const width = cardContainerRef.current.clientWidth;
        if (width > 0) {
          setScale(width / 700);
        }
      }
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (cardContainerRef.current) {
      observer.observe(cardContainerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Render message with rich tokens and Markdown bolding
  const renderFormattedMessage = (rawText: string) => {
    if (!rawText) {
      return <span className="text-zinc-500 italic">No welcome message configured...</span>;
    }

    let text = rawText
      .replace(/{user}/g, `<span class="bg-[#5865F2]/20 text-[#858df3] font-medium px-1 rounded hover:bg-[#5865F2] hover:text-white cursor-pointer transition-colors">@NewMember</span>`)
      .replace(/{user\.name}/g, `<strong>Alex</strong>`)
      .replace(/{server}/g, `<strong>${serverName}</strong>`)
      .replace(/{memberCount}/g, `<strong>1,420</strong>`)
      .replace(/{channel}/g, `<span class="bg-[#35373c] text-[#a4a9b2] px-1 rounded font-medium">${channelName}</span>`);

    text = text.replace(/\*\*(.*?)\*\*/g, `<strong>$1</strong>`);

    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#313338] shadow-2xl overflow-hidden flex flex-col">
      {/* Top Bar - Discord Channel Bar Header */}
      <div className="bg-[#2B2D31] px-4 py-2.5 flex items-center justify-between border-b border-zinc-800/60 select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Hash className="h-4 w-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200">
            {channelName ? channelName.replace(/^#/, "") : "welcome-and-rules"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          <Users className="w-3.5 h-3.5" />
          <span>Discord Live Preview</span>
        </div>
      </div>

      {/* Main Chat Box */}
      <div className="p-4 sm:p-5 space-y-4 text-left">
        {sendDm && (
          <div className="flex items-center gap-2 text-xs text-zinc-300 bg-[#2B2D31] px-3 py-2 rounded-lg border border-zinc-700/40">
            <Bell className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>This message will also be sent as a private Direct Message (DM).</span>
          </div>
        )}

        <div className="flex items-start gap-3.5">
          {/* Bot Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#1e1f22] overflow-hidden flex items-center justify-center font-bold text-xs text-white border border-white/5">
              {botAvatarUrl ? (
                <img
                  src={botAvatarUrl}
                  alt={botName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold">
                  {botName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#313338] flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block" />
            </div>
          </div>

          {/* Message Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Author info line */}
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-white hover:underline cursor-pointer">
                {botName}
              </span>
              <span className="bg-[#5865F2] text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider">
                BOT
              </span>
              <span className="text-[11px] text-zinc-400">Today at 12:00 PM</span>
            </div>

            {/* Message Body */}
            <div className="text-[14px] text-[#dbdee1] leading-relaxed wrap-break-word">
              {renderFormattedMessage(messageText)}
            </div>

            {/* Dynamic Canvas Card Attachment (1:1 Scaled from Studio Canvas) */}
            {customCanvasCard && (
              <div
                ref={cardContainerRef}
                className="mt-2.5 w-full max-w-md aspect-[2.7/1] rounded-xl overflow-hidden border border-zinc-700/60 shadow-md relative bg-zinc-950"
              >
                <div
                  style={{
                    width: "700px",
                    height: "260px",
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                  className="absolute top-0 left-0 pointer-events-none select-none flex items-center justify-center overflow-hidden"
                >
                  {/* Background Wallpaper (Pure Brightness, No Dimming) */}
                  {bannerConfig.bgType === "image" && bannerConfig.bgImageUrl ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url(${bannerConfig.bgImageUrl})`,
                        backgroundSize:
                          bannerConfig.bgImageFit === "contain"
                            ? "contain"
                            : bannerConfig.bgImageFit === "fill"
                              ? "100% 100%"
                              : "cover",
                        backgroundPosition:
                          bannerConfig.bgImagePosition === "top"
                            ? "center top"
                            : bannerConfig.bgImagePosition === "bottom"
                              ? "center bottom"
                              : "center center",
                        backgroundRepeat: "no-repeat",
                      }}
                    />
                  ) : bannerConfig.bgGradient?.startsWith("linear-gradient") ? (
                    <div
                      className="absolute inset-0"
                      style={{ background: bannerConfig.bgGradient }}
                    />
                  ) : (
                    <div className={`absolute inset-0 bg-linear-to-r ${bannerConfig.bgGradient}`} />
                  )}

                  {/* Contrast Overlay (Only if configured) */}
                  {bannerConfig.overlayOpacity > 0 && (
                    <div
                      className="absolute inset-0 bg-black"
                      style={{ opacity: bannerConfig.overlayOpacity }}
                    />
                  )}

                  {/* Dynamic Canvas Card Attachment (1:1 Scaled from Studio Canvas) */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {bannerConfig.layers && bannerConfig.layers.length > 0 ? (
                      bannerConfig.layers.map((layer) => {
                        if (layer.type === "avatar") {
                          return (
                            <div
                              key={layer.id}
                              style={{
                                transform: `translate(${layer.x ?? 0}px, ${layer.y ?? 0}px)`,
                                width: `${layer.size ?? 84}px`,
                                height: `${layer.size ?? 84}px`,
                                borderColor: layer.borderColor ?? "#5865F2",
                                borderWidth: `${layer.borderWidth ?? 3}px`,
                                borderStyle: "solid",
                              }}
                              className={`absolute flex items-center justify-center shadow-xl overflow-hidden ${
                                layer.shape === "squircle" ? "rounded-2xl" : "rounded-full"
                              }`}
                            >
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
                              style={{
                                transform: `translate(${layer.x ?? 0}px, ${layer.y ?? 0}px)`,
                                fontSize: `${layer.fontSize ?? 20}px`,
                                color: layer.color ?? "#FFFFFF",
                                fontFamily: layer.fontFamily ?? "Inter",
                                textAlign: layer.align ?? "center",
                              }}
                              className="absolute font-extrabold tracking-tight drop-shadow-md px-2 py-0.5 max-w-[90%] whitespace-nowrap"
                            >
                              {(layer.text ?? "")
                                .replace(/{server}/g, serverName)
                                .replace(/{user\.name}/g, "Alex")
                                .replace(/{memberCount}/g, "1,420")
                                .replace(/{user}/g, "@NewMember")
                                .replace(/{channel}/g, channelName)}
                            </div>
                          );
                        }

                        return null;
                      })
                    ) : (
                      /* Legacy Fallback if layers array is empty */
                      <>
                        {bannerConfig.avatar?.enabled !== false && (
                          <div
                            style={{
                              transform: `translate(${bannerConfig.avatar?.x ?? 0}px, ${bannerConfig.avatar?.y ?? -35}px)`,
                              width: `${bannerConfig.avatar?.size ?? 84}px`,
                              height: `${bannerConfig.avatar?.size ?? 84}px`,
                              borderColor: bannerConfig.avatar?.borderColor ?? "#5865F2",
                              borderWidth: `${bannerConfig.avatar?.borderWidth ?? 3}px`,
                              borderStyle: "solid",
                            }}
                            className={`absolute flex items-center justify-center shadow-xl overflow-hidden ${
                              bannerConfig.avatar?.rounded === "lg" ? "rounded-2xl" : "rounded-full"
                            }`}
                          >
                            <div className="w-full h-full rounded-[inherit] overflow-hidden bg-zinc-800 flex items-center justify-center text-white font-bold text-base select-none">
                              CC
                            </div>
                          </div>
                        )}
                        {bannerConfig.heading?.enabled !== false && (
                          <div
                            style={{
                              transform: `translate(${bannerConfig.heading?.x ?? 0}px, ${bannerConfig.heading?.y ?? 30}px)`,
                              fontSize: `${bannerConfig.heading?.fontSize ?? 26}px`,
                              color: bannerConfig.heading?.color ?? "#FFFFFF",
                              fontFamily: bannerConfig.heading?.fontFamily ?? "Inter",
                              textAlign: bannerConfig.heading?.align ?? "center",
                            }}
                            className="absolute font-extrabold tracking-tight drop-shadow-md px-2 py-0.5 max-w-[90%] whitespace-nowrap"
                          >
                            {(bannerConfig.heading?.text ?? "WELCOME TO THE SERVER")
                              .replace(/{server}/g, serverName)
                              .replace(/{user\.name}/g, "Alex")}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Rules Screening Button Mockup */}
            {rulesGate && (
              <div className="pt-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#248046] hover:bg-[#1a6334] text-white text-xs font-semibold shadow-xs cursor-default"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Verify & Unlock Server</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Helper bar */}
      {customCanvasCard && onOpenStudio && (
        <div className="px-4 py-2.5 bg-[#2B2D31]/80 border-t border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Dynamic Canvas Card is Active</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenStudio}
            className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 h-7 px-2 gap-1"
          >
            <span>Open Studio</span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
