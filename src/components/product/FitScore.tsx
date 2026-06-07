"use client";

/**
 * FitScore — surfaces the deterministic JD↔CV fit estimate (FINDINGS.md 2.1).
 *
 * Reinforces the honesty wedge: we show the candidate's real fit (skills +
 * experience keyword coverage against their knowledge base) BEFORE/with
 * tailoring, with the matched signals as strengths and the missing ones as
 * gaps. It is a keyword-overlap ESTIMATE (labelled as such), never an LLM
 * judgment, and never blocks anything.
 */

import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FitAssessment } from "@/lib/tailor/fit-score";

export interface FitScoreProps {
  fit: FitAssessment | null;
}

/** Band → colour tokens (paired with the verdict text + score for AA). */
function tone(verdict: FitAssessment["verdict"]): { text: string; bar: string; chip: string } {
  switch (verdict) {
    case "Strong fit":
    case "Good fit":
      return { text: "text-spruce-700", bar: "bg-spruce-600", chip: "bg-spruce-100/70 text-spruce-700" };
    case "Moderate fit":
      return { text: "text-[hsl(var(--ai))]", bar: "bg-[hsl(var(--ai))]", chip: "bg-[hsl(var(--ai-bg))]/70 text-[hsl(var(--ai))]" };
    default:
      return { text: "text-destructive", bar: "bg-destructive", chip: "bg-destructive/10 text-destructive" };
  }
}

function Bar({ label, value, bar }: { label: string; value: number; bar: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(100, Math.max(2, value))}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function FitScore({ fit }: FitScoreProps) {
  if (!fit) return null;
  const t = tone(fit.verdict);

  return (
    <div className="space-y-2 rounded-md border border-border bg-card px-2.5 py-2" role="region" aria-label="Job fit estimate">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", t.text)}>
          <Target className="h-4 w-4 shrink-0" aria-hidden />
          {fit.verdict}
        </span>
        <span className={cn("text-[12px] font-semibold tabular-nums", t.text)}>{fit.overall}/100</span>
      </div>

      <div className="space-y-1">
        <Bar label="Skills" value={fit.skillsMatch} bar={t.bar} />
        <Bar label="Experience" value={fit.experienceMatch} bar={t.bar} />
      </div>

      {fit.strengths.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Strengths</p>
          <div className="flex flex-wrap gap-1">
            {fit.strengths.map((s) => (
              <span key={s} className={cn("rounded px-1.5 py-0.5 text-[10px]", t.chip)}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {fit.gaps.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Gaps to address</p>
          <div className="flex flex-wrap gap-1">
            {fit.gaps.map((g) => (
              <span key={g} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{g}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">Keyword-overlap estimate vs your profile.</p>
    </div>
  );
}
