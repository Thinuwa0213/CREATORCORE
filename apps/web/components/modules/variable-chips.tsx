"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import type { TemplateVariable } from "@/lib/template-variables";

interface VariableChipsProps {
  variables: TemplateVariable[];
  onInsert: (token: string) => void;
  className?: string;
}

export function VariableChips({ variables, onInsert, className = "" }: VariableChipsProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>Click to insert standardized variables:</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <button
            key={v.token}
            type="button"
            onClick={() => onInsert(v.token)}
            title={`${v.label}: ${v.description} (e.g. ${v.example})`}
            className="group inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 hover:bg-primary/10 hover:border-primary/40 px-2 py-0.5 text-[11px] font-mono font-medium text-foreground transition-colors cursor-pointer shadow-2xs active:scale-95"
          >
            <span className="text-primary group-hover:text-primary font-semibold">{v.token}</span>
            <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
              ({v.label})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
