"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  ExternalLink,
  ShieldCheck,
  Bot,
  KeyRound,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Server,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import { connectGuildAction, onboardBotAction } from "../actions";

export interface BotOnboardingModalProps {
  guild: {
    id: string;
    name: string;
    connected: boolean;
    tenantId?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BotOnboardingModal({
  guild,
  open,
  onOpenChange,
}: BotOnboardingModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [botName, setBotName] = useState(`${guild.name} Bot`);
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [hasInvited, setHasInvited] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Discord Snowflake validation (17 to 20 digits)
  const isValidClientId = /^[0-9]{17,20}$/.test(clientId.trim());

  // Auto-generated Discord Bot Invite URL with Administrator permissions (8)
  const inviteUrl = isValidClientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId.trim()}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}&disable_guild_select=true`
    : null;

  const handleCopyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanToken = token.trim();
    const cleanName = botName.trim() || `${guild.name} Bot`;

    if (!cleanToken) {
      setError("Please provide your Discord Bot Secret Token.");
      return;
    }

    if (!isValidClientId) {
      setError("Please enter a valid Discord Application / Client ID (17-20 digits).");
      return;
    }

    if (!hasInvited) {
      setError(`Please click "Add Bot to ${guild.name}" first to invite the bot to your Discord server.`);
      return;
    }

    startTransition(async () => {
      try {
        let activeTenantId = guild.tenantId;

        // 1. If guild is not yet connected in CreatorCore, connect it first
        if (!guild.connected || !activeTenantId) {
          const connectRes = await connectGuildAction(guild.id);
          if (!connectRes.ok || !connectRes.tenantId) {
            setError(connectRes.error ?? "Failed to connect Discord server");
            return;
          }
          activeTenantId = connectRes.tenantId;
        }

        // 2. Onboard and envelope-encrypt the bot token
        const onboardRes = await onboardBotAction(
          activeTenantId,
          guild.id,
          cleanName,
          cleanToken,
        );

        if (!onboardRes.ok) {
          setError(
            onboardRes.error === "BOT_NOT_IN_GUILD"
              ? `The bot has not joined "${guild.name}" yet! Please click "Add Bot to ${guild.name}" above, complete authorization on Discord, and try again.`
              : onboardRes.error === "CREDENTIAL_VALIDATION_FAILED"
                ? "Invalid bot token! Discord rejected this token. Please check and try again."
                : onboardRes.error === "BOT_ALREADY_REGISTERED"
                  ? "This Discord bot is already registered to another server in CreatorCore."
                  : (onboardRes.error ?? "Failed to configure bot application"),
          );
          return;
        }

        // Clear token from memory
        setToken("");

        // 3. Success: Close modal and redirect to guild overview dashboard
        onOpenChange(false);
        router.push(`/tenants/${activeTenantId}/guilds/${guild.id}`);
        router.refresh();
      } catch {
        setError("An unexpected network error occurred. Please verify your connection.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[92vh] overflow-y-auto p-0 gap-0 border-border bg-card">
        {/* Modal Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Connect Bot to {guild.name}
              </DialogTitle>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              ID: {guild.id}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Follow this guide to set up your Discord application and invite the bot with Administrator permissions.
          </DialogDescription>
          {/* Stepper Tabs */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/60">
            <div
              className={`flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                step === 1
                  ? "bg-primary text-primary-foreground font-semibold"
                  : step > 1
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setStep(1)}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/20 text-[10px]">
                1
              </span>
              <span>Create App</span>
            </div>

            <div
              className={`flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                step === 2
                  ? "bg-primary text-primary-foreground font-semibold"
                  : step > 2
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setStep(2)}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/20 text-[10px]">
                2
              </span>
              <span>Bot & Intents</span>
            </div>

            <div
              className={`flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                step === 3
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setStep(3)}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/20 text-[10px]">
                3
              </span>
              <span>Invite & Connect</span>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-6">
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CREATE APPLICATION */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-sm flex items-center gap-2 text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Discord Developer Portal</span>
                  </div>
                  <Button size="sm" variant="default" asChild className="gap-1.5 text-xs">
                    <a
                      href="https://discord.com/developers/applications"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>Open Portal</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Discord does not allow external websites to automatically create bots on your account. You must create the application in Discord&apos;s Developer Portal.
                </p>
              </div>

              <div className="space-y-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-foreground">
                    1
                  </span>
                  <div className="space-y-0.5">
                    <strong className="text-foreground font-semibold block">
                      Click &ldquo;New Application&rdquo;
                    </strong>
                    <span>In the top-right of the Discord Applications dashboard, click the blue button.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-foreground">
                    2
                  </span>
                  <div className="space-y-0.5">
                    <strong className="text-foreground font-semibold block">
                      Set a Name & Accept Terms
                    </strong>
                    <span>Enter your bot name (e.g. &ldquo;{guild.name} Bot&rdquo;) and agree to Discord ToS.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-foreground">
                    3
                  </span>
                  <div className="space-y-0.5">
                    <strong className="text-foreground font-semibold block">
                      Copy the Application ID (Client ID)
                    </strong>
                    <span>
                      Under <strong>General Information</strong>, locate the <strong>Application ID</strong> and copy it. You will paste this in Step 3.
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button size="sm" onClick={() => setStep(2)} className="gap-1.5">
                  <span>Next: Configure Bot & Intents</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: BOT & INTENTS */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <span>Configure Privileged Gateway Intents</span>
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  On the left menu of your Discord Application, click the <strong>&ldquo;Bot&rdquo;</strong> tab. Scroll down to the <strong>Privileged Gateway Intents</strong> section and toggle all 3 switches to <strong>ON</strong>:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="rounded-md border border-border/80 bg-card p-2.5 text-center">
                    <Badge variant="default" className="text-[10px] mb-1">
                      Required
                    </Badge>
                    <p className="font-semibold text-xs text-foreground">Presence Intent</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Member activities</p>
                  </div>

                  <div className="rounded-md border border-border/80 bg-card p-2.5 text-center">
                    <Badge variant="default" className="text-[10px] mb-1">
                      Required
                    </Badge>
                    <p className="font-semibold text-xs text-foreground">Server Members</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Roles & welcomes</p>
                  </div>

                  <div className="rounded-md border border-border/80 bg-card p-2.5 text-center">
                    <Badge variant="default" className="text-[10px] mb-1">
                      Required
                    </Badge>
                    <p className="font-semibold text-xs text-foreground">Message Content</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Commands & chat</p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground italic">
                  * Don&apos;t forget to click the green <strong>&ldquo;Save Changes&rdquo;</strong> button at the bottom of the Discord page.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Lock className="h-4 w-4 text-primary" />
                  <span>Copy your Bot Token</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  In that same <strong>Bot</strong> tab, click <strong>&ldquo;Reset Token&rdquo;</strong> under your bot username, confirm, and copy the secret token string.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <Button size="sm" variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
                <Button size="sm" onClick={() => setStep(3)} className="gap-1.5">
                  <span>Next: Invite & Connect</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: INVITE & CONNECT */}
          {step === 3 && (
            <form onSubmit={handleCompleteSetup} className="space-y-4">
              <div className="space-y-3">
                {/* Bot Display Name */}
                <div className="space-y-1">
                  <Label htmlFor="onboarding-bot-name" className="text-xs">
                    Bot Display Name
                  </Label>
                  <Input
                    id="onboarding-bot-name"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="e.g. My Server Bot"
                    className="text-xs h-9"
                  />
                </div>

                {/* Client / Application ID */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="onboarding-client-id" className="text-xs">
                      Discord Application / Client ID
                    </Label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      From General Information
                    </span>
                  </div>
                  <Input
                    id="onboarding-client-id"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value.trim());
                      setHasInvited(false);
                    }}
                    placeholder="e.g. 1214608095410397236"
                    className="text-xs font-mono h-9"
                    required
                  />
                </div>

                {/* Dynamic Invite Bot Section */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Server className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-xs text-foreground">
                        Invite Bot to &ldquo;{guild.name}&rdquo;
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      Permission: 8 (Administrator)
                    </Badge>
                  </div>

                  {isValidClientId ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Click the button below to authorize and add this bot into <strong>{guild.name}</strong> with full Administrator permissions:
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
                          asChild
                        >
                          <a
                            href={inviteUrl ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setHasInvited(true)}
                          >
                            <Bot className="h-4 w-4" />
                            <span>Add Bot to {guild.name}</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyInviteLink}
                          className="text-xs gap-1"
                          title="Copy Invite Link"
                        >
                          {copiedLink ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedLink ? "Copied" : "Copy"}</span>
                        </Button>
                      </div>

                      {hasInvited ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 pt-1 font-medium">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span>Invite link opened! Make sure you authorized the bot in Discord.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 pt-1 font-medium">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                          <span>Click &ldquo;Add Bot to {guild.name}&rdquo; above before completing setup.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Enter your 17-20 digit Application / Client ID above to generate your one-click invite link.
                    </p>
                  )}
                </div>

                {/* Bot Token */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="onboarding-bot-token" className="text-xs">
                      Bot Secret Token
                    </Label>
                    <span className="text-[11px] text-muted-foreground">From Bot &gt; Reset Token</span>
                  </div>
                  <div className="relative">
                    <Input
                      id="onboarding-bot-token"
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="MTAx..."
                      className="text-xs font-mono pr-16 h-9"
                      required
                    />
                    <div className="absolute right-1 top-1 flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Security Guarantee Note */}
                <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                  <span>
                    Your token is encrypted using AES-256-GCM envelope encryption before storage and is never displayed again.
                  </span>
                </div>
              </div>

              {/* Form Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-border">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={isPending}
                  className="gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>

                <Button
                  id="submit-bot-onboarding-btn"
                  type="submit"
                  size="sm"
                  disabled={isPending || !token.trim() || !isValidClientId || !hasInvited}
                  title={!hasInvited ? "Please invite the bot to your server first" : ""}
                  className="gap-1.5 font-semibold"
                >
                  {isPending ? (
                    "Connecting & Encrypting..."
                  ) : (
                    <>
                      <span>Complete Setup</span>
                      <CheckCircle2 className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
