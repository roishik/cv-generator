"use client";

/**
 * JdPasteBox — the large focused JD input with a word/token estimate and an
 * inferred "Detected role / recommended template" chip (spec §4.6 step 1).
 */

import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateId } from "@/lib/schemas/cv-data";

export interface JdPasteBoxProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Heuristic recommendation, recomputed as the user types. */
  recommendation?: { templateId: TemplateId; reason: string } | null;
}

function estimate(text: string): { words: number; tokens: number } {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { words, tokens: Math.ceil(words * 1.3) };
}

export function JdPasteBox({ value, onChange, disabled, recommendation }: JdPasteBoxProps) {
  const { words, tokens } = estimate(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="jd-input">Job description</Label>
        <span className="font-mono text-[11px] text-muted-foreground">
          {words.toLocaleString()} words · ~{tokens.toLocaleString()} tokens
        </span>
      </div>
      <Textarea
        id="jd-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Paste a job description to tailor your CV to the role…"
        className="min-h-[160px] resize-y"
        aria-describedby="jd-hint"
      />
      {recommendation ? (
        <p
          id="jd-hint"
          className="flex items-start gap-1.5 rounded-md bg-[hsl(var(--ai-bg))]/60 px-2.5 py-1.5 text-[11px] text-[hsl(var(--ai))]"
        >
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            Recommended template:{" "}
            <strong className="font-semibold">
              {recommendation.templateId === "sidebar" ? "Type 1 · Sidebar" : "Type 2 · Clean"}
            </strong>
            . {recommendation.reason}
          </span>
        </p>
      ) : (
        <p id="jd-hint" className="text-[11px] text-muted-foreground">
          We infer a recommended template from the role; you can always override it.
        </p>
      )}
    </div>
  );
}
