"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { upgradePlanAction, cancelPlanAction } from "@/app/actions";
import {
  Check,
  Crown,
  Sparkles,
  ShieldCheck,
  Server,
  Radio,
  Bot,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface BillingViewProps {
  tenantId: string;
  currentPlan: "FREE" | "PRO" | "ENTERPRISE";
  subscription: {
    id?: string;
    status?: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  } | null;
}

export function BillingView({ tenantId, currentPlan: initialPlan, subscription }: BillingViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [activePlan, setActivePlan] = useState<"FREE" | "PRO" | "ENTERPRISE">(initialPlan);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const handlePlanChange = (targetPlan: "FREE" | "PRO" | "ENTERPRISE") => {
    setProcessingPlan(targetPlan);
    setFeedback(null);

    startTransition(async () => {
      try {
        if (targetPlan === "FREE") {
          const res = await cancelPlanAction(tenantId);
          if (res.ok) {
            setActivePlan("FREE");
            setFeedback({ type: "success", message: "Plan downgraded to Free Starter." });
            router.refresh();
          } else {
            setFeedback({ type: "error", message: res.error ?? "Failed to downgrade plan." });
          }
        } else {
          const res = await upgradePlanAction(tenantId, targetPlan, interval);
          if (res.ok) {
            setActivePlan(targetPlan);
            setFeedback({
              type: "success",
              message: `Successfully upgraded to ${targetPlan === "PRO" ? "Creator Pro" : "Studio Enterprise"}!`,
            });
            router.refresh();
          } else {
            setFeedback({ type: "error", message: res.error ?? "Failed to upgrade plan." });
          }
        }
      } catch (err) {
        setFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "An unexpected error occurred.",
        });
      } finally {
        setProcessingPlan(null);
      }
    });
  };

  const proPrice = interval === "year" ? "$6.58" : "$9.99";
  const enterprisePrice = interval === "year" ? "$20.75" : "$29.99";

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <span>Billing & Subscriptions</span>
            <Badge variant={activePlan === "PRO" ? "default" : activePlan === "ENTERPRISE" ? "default" : "secondary"}>
              {activePlan}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your subscription tiers, usage entitlements, and white-label bot features.
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href="/guilds">&larr; Server Selection</a>
        </Button>
      </div>

      {/* Status Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg border text-sm ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Current Subscription Status Card */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Active Subscription Overview
            </span>
            <Badge variant="outline" className="text-xs">
              Status: {subscription?.status ?? "ACTIVE"}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            {activePlan === "FREE"
              ? "You are currently on the Free Starter tier. Upgrade to unlock full white-label custom bots."
              : `Active Plan: ${activePlan === "PRO" ? "Creator Pro" : "Studio Enterprise"}. High-availability priority runtime.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="rounded-lg bg-muted/50 p-3 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Server className="h-3.5 w-3.5" />
                <span>Connected Guilds</span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {activePlan === "FREE" ? "1 Guild Limit" : activePlan === "PRO" ? "Up to 3 Guilds" : "Unlimited Guilds"}
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Bot className="h-3.5 w-3.5" />
                <span>Custom Bot Token</span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {activePlan === "FREE" ? "Disabled (Default Bot)" : "Unlocked (100% White-Label)"}
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 border border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Radio className="h-3.5 w-3.5" />
                <span>Stream Live Alerts</span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {activePlan === "FREE" ? "1 Streamer (Twitch)" : "Unlimited (Twitch, YouTube, Kick)"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interval Switcher */}
      <div className="flex flex-col items-center justify-center gap-3 pt-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              interval === "month"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly Billing
          </button>

          <button
            type="button"
            onClick={() => setInterval("year")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              interval === "year"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Annual Billing</span>
            <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600 text-white hover:bg-emerald-600">
              Save 20%
            </Badge>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Prices in USD. Cancel or change anytime.</p>
      </div>

      {/* Pricing Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* FREE STARTER */}
        <Card className={`flex flex-col justify-between border-border ${activePlan === "FREE" ? "ring-2 ring-primary/40" : ""}`}>
          <CardHeader>
            <div className="flex items-center justify-between mb-1">
              <CardTitle className="text-lg font-bold">Starter</CardTitle>
              {activePlan === "FREE" && <Badge variant="secondary">Current Plan</Badge>}
            </div>
            <CardDescription className="text-xs">For small communities testing the waters.</CardDescription>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-foreground">$0</span>
              <span className="text-xs text-muted-foreground ml-1">/ month</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-2">
            <Separator />
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>1 Connected Discord Server</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Standard Welcome Messages</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Basic XP Leveling (Default Card)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>1 Twitch Stream Notification</span>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <span className="h-4 w-4 shrink-0 flex items-center justify-center font-bold">-</span>
                <span className="line-through">Custom Bot Avatar & Name</span>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <span className="h-4 w-4 shrink-0 flex items-center justify-center font-bold">-</span>
                <span className="line-through">Custom Canvas Rank Cards</span>
              </li>
            </ul>
          </CardContent>

          <CardFooter className="pt-2">
            {activePlan === "FREE" ? (
              <Button disabled variant="outline" className="w-full text-xs">
                Active Tier
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full text-xs"
                disabled={isPending}
                onClick={() => handlePlanChange("FREE")}
              >
                {processingPlan === "FREE" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Downgrade to Free"}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* CREATOR PRO (FEATURED) */}
        <Card className={`relative flex flex-col justify-between border-primary shadow-lg bg-card ${activePlan === "PRO" ? "ring-2 ring-primary" : ""}`}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span>Most Popular</span>
          </div>

          <CardHeader className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <CardTitle className="text-lg font-bold flex items-center gap-1.5">
                <Crown className="h-5 w-5 text-amber-500" />
                <span>Creator Pro</span>
              </CardTitle>
              {activePlan === "PRO" && <Badge variant="default">Current Plan</Badge>}
            </div>
            <CardDescription className="text-xs">
              For streamers, creators, and esports communities.
            </CardDescription>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-foreground">{proPrice}</span>
              <span className="text-xs text-muted-foreground ml-1">
                / month {interval === "year" ? "(billed annually)" : ""}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-2">
            <Separator />
            <ul className="space-y-2.5 text-xs text-foreground">
              <li className="flex items-center gap-2 font-medium text-primary">
                <Check className="h-4 w-4 shrink-0" />
                <span>100% White-Label Branded Bot</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Up to 3 Connected Servers</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Custom Canvas Rank Cards & Multipliers</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Unlimited Twitch, YouTube & Kick Alerts</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Unlimited Button & Dropdown Roles</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Advanced Anti-Raid & Phishing Shield</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>99.9% High-Availability Worker SLA</span>
              </li>
            </ul>
          </CardContent>

          <CardFooter className="pt-2">
            {activePlan === "PRO" ? (
              <Button disabled className="w-full text-xs">
                Current Plan
              </Button>
            ) : (
              <Button
                className="w-full text-xs font-bold gap-2 shadow-sm"
                disabled={isPending}
                onClick={() => handlePlanChange("PRO")}
              >
                {processingPlan === "PRO" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Upgrade to Creator Pro</span>
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* ENTERPRISE / STUDIO */}
        <Card className={`flex flex-col justify-between border-border ${activePlan === "ENTERPRISE" ? "ring-2 ring-primary/40" : ""}`}>
          <CardHeader>
            <div className="flex items-center justify-between mb-1">
              <CardTitle className="text-lg font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-purple-500" />
                <span>Studio Enterprise</span>
              </CardTitle>
              {activePlan === "ENTERPRISE" && <Badge variant="default">Current Plan</Badge>}
            </div>
            <CardDescription className="text-xs">
              For esports organizations and large gaming studios.
            </CardDescription>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-foreground">{enterprisePrice}</span>
              <span className="text-xs text-muted-foreground ml-1">
                / month {interval === "year" ? "(billed annually)" : ""}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-2">
            <Separator />
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2 font-medium text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Everything in Creator Pro</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Unlimited Guild Connections</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Multiple Custom Branded Bots</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Dedicated Worker Process Isolation</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>Staff Roles & Granular RBAC</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>90-Day Full Audit Logs Export</span>
              </li>
            </ul>
          </CardContent>

          <CardFooter className="pt-2">
            {activePlan === "ENTERPRISE" ? (
              <Button disabled className="w-full text-xs">
                Current Plan
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full text-xs"
                disabled={isPending}
                onClick={() => handlePlanChange("ENTERPRISE")}
              >
                {processingPlan === "ENTERPRISE" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Upgrade to Studio"
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
