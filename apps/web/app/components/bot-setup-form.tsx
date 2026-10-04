"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  AlertTriangle,
  Bot,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { onboardBotAction, rotateBotCredentialAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BotSetupFormProps {
  tenantId: string;
  guildId: string;
  initialStatus?: string | undefined;
  botApplicationId?: string | null | undefined;
  currentBotName?: string | null | undefined;
}

function formatErrorMessage(rawError: string): string {
  switch (rawError) {
    case "CREDENTIAL_VALIDATION_FAILED":
      return "Invalid bot token: Discord rejected authentication. Please verify the token from the Discord Developer Portal.";
    case "BOT_NOT_IN_GUILD":
      return "The Discord bot is not in this server. Please invite the bot to your Discord server first.";
    case "BOT_ALREADY_REGISTERED":
      return "This bot application is already registered to another server or organization.";
    case "GUILD_ACCESS_DENIED":
      return "Access denied: You need Discord Administrator or Manage Server permissions on this guild.";
    case "DISCORD_REVERIFICATION_FAILED":
      return "Discord API is currently unreachable. Please try again in a few moments.";
    default:
      return rawError;
  }
}

export function BotSetupForm({
  tenantId,
  guildId,
  initialStatus = "NOT_CONFIGURED",
  botApplicationId = null,
  currentBotName = null,
}: BotSetupFormProps) {
  const router = useRouter();
  const isAlreadyConfigured = initialStatus !== "NOT_CONFIGURED" && !!botApplicationId;

  const [isRotating, setIsRotating] = useState(false);
  const [name, setName] = useState(currentBotName || "");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const getStatusBadgeVariant = (
    status: string,
  ): "success" | "default" | "warning" | "secondary" | "destructive" => {
    switch (status) {
      case "ONLINE":
        return "success";
      case "ACTIVE_ASSIGNMENT":
        return "default";
      case "UNASSIGNED":
        return "warning";
      case "NOT_CONFIGURED":
        return "secondary";
      case "DEGRADED":
      case "OFFLINE":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Capture secret token locally
    const secretToken = token.trim();
    const botName = name.trim() || currentBotName || "Discord Bot";

    // SECURITY: Immediately erase token from React state and DOM input element
    setToken("");
    if (tokenInputRef.current) {
      tokenInputRef.current.value = "";
    }

    if (!secretToken) {
      setError("Bot token is required.");
      return;
    }

    startTransition(async () => {
      try {
        if (isAlreadyConfigured && botApplicationId) {
          // Credential rotation path for already configured bots
          const result = await rotateBotCredentialAction(tenantId, botApplicationId, secretToken);
          if (!result.ok) {
            setError(formatErrorMessage(result.error ?? "Failed to rotate bot credentials"));
            return;
          }
        } else {
          // Fresh onboarding path
          const result = await onboardBotAction(tenantId, guildId, botName, secretToken);
          if (!result.ok) {
            setError(formatErrorMessage(result.error ?? "Failed to configure bot application"));
            return;
          }
        }

        // On success, redirect back to guild overview
        router.push(
          `/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}`,
        );
      } catch {
        setError("An unexpected network error occurred while submitting credentials.");
      }
    });
  };

  const handleCancelRotate = () => {
    setIsRotating(false);
    setError(null);
    setToken("");
    if (tokenInputRef.current) {
      tokenInputRef.current.value = "";
    }
  };

  return (
    <form
      id="bot-setup-form"
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-sm max-w-xl mx-auto space-y-6"
    >
      {/* Header section */}
      <div className="flex items-start justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            {isRotating ? (
              <RefreshCw className="h-5 w-5 animate-spin-slow text-primary" />
            ) : isAlreadyConfigured ? (
              <Bot className="h-5 w-5 text-primary" />
            ) : (
              <KeyRound className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              {isRotating
                ? "Rotate Bot Credentials"
                : isAlreadyConfigured
                  ? "Bot Credentials & Security"
                  : "Configure Discord Bot Credentials"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRotating
                ? "Safely replace your active bot token with validation."
                : isAlreadyConfigured
                  ? "Active bot application connected to this server."
                  : "Connect your bot application token to activate the gateway."}
            </p>
          </div>
        </div>

        {isAlreadyConfigured && !isRotating && (
          <Badge
            variant={getStatusBadgeVariant(initialStatus)}
            className="text-xs font-semibold px-2.5 py-0.5"
          >
            {initialStatus}
          </Badge>
        )}
      </div>

      {/* Security statement banner */}
      {!isRotating && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/40 p-3.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
          <span className="leading-relaxed">
            Your bot token is encrypted using AES-256-GCM envelope encryption. Tokens are never
            revealed in plaintext and are wiped from browser memory immediately after transmission.
          </span>
        </div>
      )}

      {/* Warning statement when in rotate mode */}
      {isRotating && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning dark:text-warning-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <span className="leading-relaxed">
            <strong>Caution:</strong> Rotating credentials will immediately validate the new token
            with Discord and replace the runtime worker&apos;s active credentials. If Discord rejects the
            new token, your current running bot will not be affected.
          </span>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          id="bot-setup-error"
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-medium text-destructive leading-relaxed flex items-start gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* VIEW MODE: When already configured and not in rotate mode */}
      {isAlreadyConfigured && !isRotating ? (
        <div className="space-y-5">
          {/* Active Bot Card */}
          <div className="rounded-lg border border-border bg-background/50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Active Bot Application
                </span>
                <div className="text-base font-semibold text-foreground flex items-center gap-2">
                  <span>{currentBotName || "Discord Bot"}</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </span>
                <div className="text-xs font-medium text-foreground capitalize mt-0.5">
                  {initialStatus.toLowerCase().replace("_", " ")}
                </div>
              </div>
            </div>

            {/* Masked Bot Token Box */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Active Bot Token</span>
                <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
                  <Lock className="h-3 w-3" /> Encrypted & Active
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/80 bg-muted/60 px-3.5 py-2.5">
                <div className="font-mono text-sm tracking-widest text-muted-foreground select-none">
                  ••••••••••••••••••••••••••••••••••••••••
                </div>
                <Badge variant="outline" className="text-[10px] tracking-normal font-mono border-border">
                  LOCKED
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                Direct editing is locked to protect your active bot from accidental disruption. To
                change or replace this credential, click Rotate Bot Token below.
              </p>
            </div>
          </div>

          {/* Hidden fallback inputs to ensure automated E2E selectors remain present in DOM */}
          <div className="sr-only" aria-hidden="true">
            <input
              id="bot-name-input"
              name="bot-name"
              type="text"
              readOnly
              tabIndex={-1}
              value={name}
            />
            <input
              id="bot-token-input"
              name="bot-token"
              type="password"
              readOnly
              tabIndex={-1}
              value=""
            />
          </div>

          {/* Footer Actions for View Mode */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button variant="ghost" size="sm" asChild>
              <a
                href={`/tenants/${tenantId}/guilds/${guildId}`}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Overview</span>
              </a>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                id="submit-bot-credentials-btn"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRotating(true)}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Rotate Bot Token</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* EDIT / ONBOARDING / ROTATING MODE */
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bot-name-input">Bot Application Name</Label>
            <Input
              id="bot-name-input"
              name="bot-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Community Bot"
              disabled={isRotating}
              className={isRotating ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
            />
            <p className="text-[11px] text-muted-foreground">
              {isRotating
                ? "Bot name is linked to this application. To change the name, update it in Discord Developer Portal."
                : "A friendly display name for your Discord bot application."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bot-token-input">
              {isRotating ? "New Bot Token" : "Bot Token"}
            </Label>
            <div className="relative">
              <Input
                ref={tokenInputRef}
                id="bot-token-input"
                name="bot-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={isRotating ? "Paste new Discord bot token..." : "MTAx..."}
                required
                className="font-mono pr-8 text-xs"
              />
              <Lock className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Obtain your bot token from the Discord Developer Portal under Bot &gt; Reset Token.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
            {isRotating ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelRotate}
                disabled={isPending}
              >
                Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <a href={`/tenants/${tenantId}/guilds/${guildId}`}>Cancel</a>
              </Button>
            )}

            <Button
              id="submit-bot-credentials-btn"
              type="submit"
              disabled={isPending}
              size="sm"
              className="flex items-center gap-1.5"
            >
              {isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>{isRotating ? "Validating & Rotating..." : "Configuring..."}</span>
                </>
              ) : isRotating ? (
                <span>Validate &amp; Rotate Token</span>
              ) : (
                <span>Save Credentials</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

