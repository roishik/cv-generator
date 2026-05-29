"use client";

/**
 * TruthfulnessReview — surfaces the deterministic verifyTruthfulness flags
 * before download (spec §4.6 truthfulness guard / §5.6).
 *
 * - error-severity flags (provenance, new employer) are hard blocks: shown clay.
 * - warning-severity flags (novel skill, unverified metric) are non-blocking
 *   amber notes the user reviews. We never invent — these surface that honesty.
 * Each flag jump-links to the offending field on the preview.
 */

import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TruthfulnessReport, TruthFlag } from "@/lib/ai/truthfulness";

export interface TruthfulnessReviewProps {
  report: TruthfulnessReport | null;
  onJump?: (path: string) => void;
}

export function TruthfulnessReview({ report, onJump }: TruthfulnessReviewProps) {
  if (!report) return null;

  const errors = report.flags.filter((f) => f.severity === "error");
  const warnings = report.flags.filter((f) => f.severity === "warning");

  if (report.ok && warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-spruce-600/30 bg-spruce-100/50 px-2.5 py-2 text-[12px] text-spruce-700">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <span>Verified against your profile — nothing was invented.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="region" aria-label="Truthfulness review">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-destructive">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            {errors.length} fabrication{errors.length === 1 ? "" : "s"} blocked
          </p>
          <ul className="mt-1.5 space-y-1">
            {errors.map((f, i) => (
              <FlagRow key={i} flag={f} tone="destructive" onJump={onJump} />
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-[hsl(var(--ai))]/30 bg-[hsl(var(--ai-bg))]/60 p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-[hsl(var(--ai))]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {warnings.length} item{warnings.length === 1 ? "" : "s"} to review
          </p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((f, i) => (
              <FlagRow key={i} flag={f} tone="ai" onJump={onJump} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FlagRow({
  flag,
  tone,
  onJump,
}: {
  flag: TruthFlag;
  tone: "destructive" | "ai";
  onJump?: (path: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onJump?.(flag.path)}
        className={cn(
          "w-full rounded px-1.5 py-1 text-left text-[11px] leading-4 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tone === "destructive" ? "text-destructive" : "text-[hsl(var(--ai))]",
        )}
      >
        {flag.message}
      </button>
    </li>
  );
}
