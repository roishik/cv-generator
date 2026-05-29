"use client";

/**
 * OnePageFitIndicator — the always-visible one-page-fit gauge (spec §4.6 / §5.5).
 *
 * Bands: fits (≤92%, spruce) · tight (92–100%, amber) · overflow (>100%, clay).
 * When the authoritative server render reports it could NOT fit the one-page
 * ladder, the state becomes `needs-reduction` with an Auto-fit assist action —
 * we NEVER silently clip. Colour is always paired with a label + icon (AA).
 */

import { CheckCircle2, AlertTriangle, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

const A4_H = 1123;

export type FitState = "fits" | "tight" | "overflow" | "needs-reduction";

export interface OnePageFitProps {
  /** Live measured content height (px @ A4 scale) from the preview. */
  contentHeightPx: number | null;
  /** Authoritative server signal: false → ladder exhausted, needs reduction. */
  serverFits?: boolean | null;
  /** The server's reduction reason/suggestion when serverFits === false. */
  needsReduction?: { reason: string; suggestion: string } | null;
  /** Whether an auto-fit run is in flight. */
  autoFitting?: boolean;
  /** Auto-fit handler (tighten→trim). Shown only in the needs-reduction state. */
  onAutoFit?: () => void;
}

function deriveState(pct: number, serverFits?: boolean | null): FitState {
  if (serverFits === false) return "needs-reduction";
  if (pct > 100) return "overflow";
  if (pct >= 92) return "tight";
  return "fits";
}

export function OnePageFitIndicator({
  contentHeightPx,
  serverFits,
  needsReduction,
  autoFitting,
  onAutoFit,
}: OnePageFitProps) {
  const pct =
    contentHeightPx != null ? Math.round((contentHeightPx / A4_H) * 100) : 0;
  const state = deriveState(pct, serverFits);
  const fillPct = Math.min(100, Math.max(4, pct));

  const meta: Record<
    FitState,
    { label: string; tone: string; bar: string; icon: React.ReactNode }
  > = {
    fits: {
      label: "Fits one page",
      tone: "text-spruce-700",
      bar: "bg-spruce-600",
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
    },
    tight: {
      label: "Tight — kept all content",
      tone: "text-[hsl(var(--ai))]",
      bar: "bg-[hsl(var(--ai))]",
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
    },
    overflow: {
      label: "Over one page",
      tone: "text-destructive",
      bar: "bg-destructive",
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
    },
    "needs-reduction": {
      label: "Needs content reduction",
      tone: "text-destructive",
      bar: "bg-destructive",
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
    },
  };
  const m = meta[state];

  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        {/* gauge */}
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
          aria-hidden
        >
          <div
            className={cn("h-full rounded-full transition-all duration-180", m.bar)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", m.tone)}>
          {m.icon}
          {contentHeightPx != null ? `${pct}%` : "—"} · {m.label}
        </span>
      </div>

      {state === "needs-reduction" && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
          <p className="text-[11px] leading-4 text-destructive">
            {needsReduction?.reason ?? "We couldn't fit this on one page."}{" "}
            <span className="text-muted-foreground">
              {needsReduction?.suggestion ?? "Trim a low-priority bullet, then re-render."}
            </span>
          </p>
          {onAutoFit && (
            <button
              type="button"
              onClick={onAutoFit}
              disabled={autoFitting}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
            >
              <Scissors className="h-3 w-3" aria-hidden />
              {autoFitting ? "Auto-fitting…" : "Auto-fit"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
