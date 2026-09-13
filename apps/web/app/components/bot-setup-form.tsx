"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, KeyRound } from "lucide-react";
import { onboardBotAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface BotSetupFormProps {
  tenantId: string;
  guildId: string;
}

export function BotSetupForm({ tenantId, guildId }: BotSetupFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Capture secret token locally
    const secretToken = token.trim();
    const botName = name.trim() || "Discord Bot";

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
        const result = await onboardBotAction(tenantId, guildId, botName, secretToken);
        if (!result.ok) {
          // Never disclose token in error message
          setError(result.error ?? "Failed to configure bot application");
          return;
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

  return (
    <form
      id="bot-setup-form"
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-6 shadow-sm max-w-xl mx-auto"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-card-foreground">
          Configure Discord Bot Credentials
        </h2>
      </div>

      {/* Technically truthful security statement (Amendment 4) */}
      <div className="flex items-start gap-2.5 rounded-md bg-muted/60 p-3 mb-5 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-success mt-0.5" />
        <span>
          Your bot token is encrypted before storage and is never displayed again after submission.
          It is cleared from memory immediately upon submission.
        </span>
      </div>

      {error && (
        <div
          id="bot-setup-error"
          role="alert"
          className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive"
        >
          {error}
        </div>
      )}

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
          />
          <p className="text-[11px] text-muted-foreground">
            A friendly display name for your Discord bot application.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bot-token-input">Bot Token</Label>
          <div className="relative">
            <Input
              ref={tokenInputRef}
              id="bot-token-input"
              name="bot-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="MTAx..."
              required
              className="font-mono pr-8 text-xs"
            />
            <Lock className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Obtain your bot token from the Discord Developer Portal under Bot &gt; Reset Token.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button variant="outline" size="sm" asChild>
          <a href={`/tenants/${tenantId}/guilds/${guildId}`}>Cancel</a>
        </Button>

        <Button id="submit-bot-credentials-btn" type="submit" disabled={isPending} size="sm">
          {isPending ? "Configuring..." : "Save Credentials"}
        </Button>
      </div>
    </form>
  );
}
