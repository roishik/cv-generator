"use client";

/**
 * GenerationProgress — the signature "labeled checklist" for a tailor run
 * (spec §4.6 / §7). NOT a spinner: each step fills from ⟳ → ✓ with a 1px
 * progress hairline, narrated honestly. The whole thing is an aria-live region
 * so screen readers announce each step.
 *
 * The pipeline server action is a single round-trip (it does the whole run
 * server-side), so we drive a deterministic, time-based step cadence on the
 * client purely for the *feel* of progress, then snap to complete when the
 * promise resolves. The model/provider + cost line make the AI honest.
 */

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Reading your profile",
  "Matching to the role",
  "Rewriting content",
  "Rendering the page",
  "Checking one-page fit",
] as const;

export interface GenerationProgressProps {
  /** Provider label, e.g. "Mock · deterministic" or "Claude". */
  provider: string;
  /** True while the run is in flight; false snaps all steps to done. */
  running: boolean;
}

export function GenerationProgress({ provider, running }: GenerationProgressProps) {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!running) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const r = window.setTimeout(() => setTick(STEPS.length - 1), 0);
      return () => window.clearTimeout(r);
    }
    // Reset, then advance steps — never reaching the final step until done.
    const reset = window.setTimeout(() => setTick(0), 0);
    const id = window.setInterval(() => {
      setTick((a) => Math.min(a + 1, STEPS.length - 1));
    }, 7000);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(id);
    };
  }, [running]);

  // When the run completes, all steps are done; otherwise follow the ticker.
  const active = running ? tick : STEPS.length;

  return (
    <div
      className="rounded-md border border-border bg-card p-3"
      role="status"
      aria-live="polite"
      aria-label="Tailoring progress"
    >
      <ol className="space-y-2">
        {STEPS.map((label, i) => {
          const done = i < active;
          const current = i === active && running;
          return (
            <li key={label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors",
                  done && "border-spruce-600 bg-spruce-600 text-white",
                  current && "border-[hsl(var(--ai))] text-[hsl(var(--ai))]",
                  !done && !current && "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? (
                  <Check className="h-2.5 w-2.5" />
                ) : current ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-[12px] leading-4",
                  done ? "text-foreground" : current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
                {current ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
        {provider} · 1 LLM call
      </p>
    </div>
  );
}
