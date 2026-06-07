"use client";

/**
 * StyleReview — surfaces the deterministic lintStyle() flags (FINDINGS.md 1.3),
 * the writing-style sibling of TruthfulnessReview.
 *
 * Style flags are advisory only: clichés, em-dashes, weak/repeated openers are
 * quality nits, never correctness/honesty issues, so this panel NEVER blocks
 * export. A clean report renders a quiet "reads clean" confirmation. Each flag
 * jump-links to the offending field on the preview.
 */

import { PenLine, Sparkles } from "lucide-react";
import type { StyleReport } from "@/lib/ai/style-lint";

export interface StyleReviewProps {
  report: StyleReport | null;
  onJump?: (path: string) => void;
}

export function StyleReview({ report, onJump }: StyleReviewProps) {
  if (!report) return null;

  if (report.flags.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-spruce-600/30 bg-spruce-100/50 px-2.5 py-2 text-[12px] text-spruce-700">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <span>Reads clean — no clichés, em-dashes, or weak openers.</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-[hsl(var(--ai))]/30 bg-[hsl(var(--ai-bg))]/60 p-2.5"
      role="region"
      aria-label="Writing style review"
    >
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-[hsl(var(--ai))]">
        <PenLine className="h-4 w-4 shrink-0" aria-hidden />
        {report.flags.length} style note{report.flags.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {report.flags.map((f, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onJump?.(f.path)}
              className="w-full rounded px-1.5 py-1 text-left text-[11px] leading-4 text-[hsl(var(--ai))] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {f.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
