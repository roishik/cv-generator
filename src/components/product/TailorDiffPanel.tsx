"use client";

/**
 * TailorDiffPanel — the left-rail "Changes" list (spec §4.6 step 3).
 *
 * Summarises every edit grouped by kind (added / rewritten / removed /
 * reordered) with jump-links that, when clicked, highlight the matching spot on
 * the live preview (the workspace passes the path to CvPreview.focusPath). Kind
 * is conveyed by an icon + label, never colour alone (WCAG AA).
 */

import { Plus, Pencil, Minus, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StructuredDiff, FieldDiff, DiffKind } from "@/lib/tailor/diff";

const KIND_META: Record<
  Exclude<DiffKind, "unchanged">,
  { label: string; icon: React.ReactNode; tone: string }
> = {
  added: {
    label: "Added",
    icon: <Plus className="h-3 w-3" aria-hidden />,
    tone: "text-[hsl(var(--ai))]",
  },
  rewritten: {
    label: "Rewritten",
    icon: <Pencil className="h-3 w-3" aria-hidden />,
    tone: "text-[hsl(var(--ai))]",
  },
  removed: {
    label: "Removed",
    icon: <Minus className="h-3 w-3" aria-hidden />,
    tone: "text-destructive",
  },
  reordered: {
    label: "Reordered",
    icon: <ArrowUpDown className="h-3 w-3" aria-hidden />,
    tone: "text-muted-foreground",
  },
};

function clamp(s: string | undefined, n = 80): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface TailorDiffPanelProps {
  diff: StructuredDiff;
  /** Currently focused path (highlighted in the list + preview). */
  focusPath?: string | null;
  /** Jump to a change → highlights it on the preview. */
  onJump?: (entry: FieldDiff) => void;
}

export function TailorDiffPanel({ diff, focusPath, onJump }: TailorDiffPanelProps) {
  const { entries, summary } = diff;

  if (entries.length === 0) {
    return (
      <p className="px-1 py-2 text-[12px] text-muted-foreground">
        No changes from your baseline yet. Generate or edit to see what changed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-1.5">
        {(["added", "rewritten", "removed", "reordered"] as const).map((k) =>
          summary[k] > 0 ? (
            <span
              key={k}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium",
                KIND_META[k].tone,
              )}
            >
              {KIND_META[k].icon}
              {summary[k]} {KIND_META[k].label.toLowerCase()}
            </span>
          ) : null,
        )}
      </div>

      <ul className="space-y-1" aria-label="List of changes">
        {entries.map((e, i) => {
          const meta = KIND_META[e.kind as Exclude<DiffKind, "unchanged">];
          if (!meta) return null;
          const isFocused = focusPath === e.path;
          return (
            <li key={`${e.path}-${i}`}>
              <button
                type="button"
                onClick={() => onJump?.(e)}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isFocused && "bg-[hsl(var(--ai-bg))]",
                )}
                aria-label={`${meta.label}: ${e.section}. Jump to this change on the preview.`}
              >
                <span className={cn("mt-0.5 shrink-0", meta.tone)}>{meta.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("text-[11px] font-medium", meta.tone)}>
                      {meta.label}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {e.section}
                    </span>
                  </span>
                  {(e.after || e.before) && (
                    <span className="mt-0.5 block text-[12px] leading-4 text-foreground">
                      {e.kind === "removed" ? (
                        <span className="line-through opacity-70">{clamp(e.before)}</span>
                      ) : (
                        clamp(e.after ?? e.before)
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
