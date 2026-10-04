"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles } from "lucide-react";

interface PaywallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureTitle: string;
  featureDescription: string;
  tenantId: string;
}

const PRO_BENEFITS = [
  "100% White-Label Branded Discord Bot",
  "Custom Canvas Rank Cards & Leveling Multipliers",
  "Unlimited Twitch, YouTube & Kick Live Alerts",
  "Unlimited Button & Dropdown Role Menus",
  "Advanced Raid Shield & Anti-Spam Moderation",
  "99.9% High-Availability Priority Worker SLA",
];

export function PaywallDialog({
  open,
  onOpenChange,
  featureTitle,
  featureDescription,
  tenantId,
}: PaywallDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center sm:text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Crown className="h-6 w-6" />
          </div>

          <div className="flex items-center justify-center gap-2 mb-1">
            <DialogTitle className="text-xl font-bold tracking-tight">
              Unlock with Creator Pro
            </DialogTitle>
            <Badge variant="default" className="text-[10px] font-bold">
              PRO
            </Badge>
          </div>

          <DialogDescription className="text-sm text-muted-foreground">
            <strong>{featureTitle}</strong> is a Creator Pro feature. {featureDescription}
          </DialogDescription>
        </DialogHeader>

        {/* Pro Value Stack */}
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 my-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
            Included in Creator Pro ($9.99/mo):
          </p>
          {PRO_BENEFITS.map((benefit, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" />
              </div>
              <span className="text-foreground/90">{benefit}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2 pt-2">
          <Button asChild className="w-full gap-2 shadow-sm font-semibold">
            <a href={`/tenants/${tenantId}/billing`}>
              <Sparkles className="h-4 w-4" />
              <span>View Plans & Upgrade</span>
            </a>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full text-xs text-muted-foreground"
          >
            Continue with Free Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
