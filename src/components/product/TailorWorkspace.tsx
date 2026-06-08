"use client";

/**
 * TailorWorkspace — the heart of the product (spec §4.6).
 *
 * A single persistent split-pane: controls LEFT, an ALWAYS-LIVE true-A4 CV
 * preview RIGHT (the SAME render-engine components that drive the PDF → parity).
 *
 * Responsibilities:
 *  - JD paste + heuristic template recommendation + override
 *  - Generate (runTailoring) with a labeled progress checklist
 *  - Changes/diff panel with jump-links that highlight the preview (amber, never
 *    colour-alone) + a Baseline↔Tailored toggle
 *  - Inline editing of fields → reRenderDocument (deterministic, 0 LLM)
 *  - Truthfulness review (verifyTruthfulness flags) before download
 *  - One-page-fit gauge (fits / tight / needs-reduction assist — never clip)
 *  - Export PDF (getDownloadUrl)
 *
 * Responsive: split-pane ≥1280px; below that a tabbed single column
 * [ Job · Preview · Changes ] — the spec's mobile review/tailor companion.
 *
 * Keyboard: ⌘↵ Tailor · ⌘E Export · [ / ] cycle template · ⌘B baseline/tailored.
 */

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wand2,
  Download,
  RotateCcw,
  Loader2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CvPreview } from "@/components/product/CvPreview";
import { PreviewFrame } from "@/components/ui/cv-paper";
import { JdPasteBox } from "@/components/product/JdPasteBox";
import { GenerationProgress } from "@/components/product/GenerationProgress";
import { OnePageFitIndicator } from "@/components/product/OnePageFitIndicator";
import { TailorDiffPanel } from "@/components/product/TailorDiffPanel";
import { TruthfulnessReview } from "@/components/product/TruthfulnessReview";
import { StyleReview } from "@/components/product/StyleReview";
import { FitScore } from "@/components/product/FitScore";
import { readPath, writePath } from "@/lib/tailor/cv-path";
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";
import type { StructuredDiff, FieldDiff, DiffKind } from "@/lib/tailor/diff";
import type { TruthfulnessReport } from "@/lib/ai/truthfulness";
import { lintStyle } from "@/lib/ai/style-lint";
import type { CutSuggestion } from "@/lib/tailor/suggest-cuts";
import type { FitAssessment } from "@/lib/tailor/fit-score";
import {
  runTailoring,
  reRenderDocument,
  getDownloadUrl,
  recommendTemplateForJd,
  recomputeDiff,
  setProfilePhoto,
  getOriginalResume,
  renameVersion,
} from "@/app/(app)/tailor/actions";

export interface TailorWorkspaceInitial {
  /** Existing tailored doc id (workspace/[id]) or null for a fresh "new" entry. */
  cvDocumentId: string | null;
  hasKnowledgeBase: boolean;
  baseline: CvData | null;
  tailored: CvData | null;
  templateId: TemplateId;
  diff: StructuredDiff | null;
  truthfulness: TruthfulnessReport | null;
  warnings: string[];
  fitAssessment: FitAssessment | null;
  hasArtifact: boolean;
  artifactId: string | null;
  serverFits: boolean | null;
  label: string | null;
  /** Active AI provider line, e.g. "OpenAI · gpt-5.4" or "Mock · deterministic". */
  providerLabel: string;
}

type Tab = "job" | "preview" | "changes";

export function TailorWorkspace({ initial }: { initial: TailorWorkspaceInitial }) {
  const [jd, setJd] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [templateId, setTemplateId] = React.useState<TemplateId>(initial.templateId);
  const [recommendation, setRecommendation] = React.useState<{
    templateId: TemplateId;
    reason: string;
  } | null>(null);

  const [docId, setDocId] = React.useState<string | null>(initial.cvDocumentId);
  const [baseline, setBaseline] = React.useState<CvData | null>(initial.baseline);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const [tailored, setTailored] = React.useState<CvData | null>(initial.tailored);
  const [diff, setDiff] = React.useState<StructuredDiff | null>(initial.diff);
  const [truthfulness, setTruthfulness] = React.useState<TruthfulnessReport | null>(
    initial.truthfulness,
  );
  const [warnings, setWarnings] = React.useState<string[]>(initial.warnings);
  const [fitAssessment, setFitAssessment] = React.useState<FitAssessment | null>(
    initial.fitAssessment,
  );
  const [artifactId, setArtifactId] = React.useState<string | null>(initial.artifactId);
  const [serverFits, setServerFits] = React.useState<boolean | null>(initial.serverFits);
  const [needsReduction, setNeedsReduction] = React.useState<{
    reason: string;
    suggestion: string;
    cutSuggestions?: CutSuggestion[];
  } | null>(null);

  const [showChanges, setShowChanges] = React.useState(true);
  const [view, setView] = React.useState<"baseline" | "tailored">(
    initial.tailored ? "tailored" : "baseline",
  );
  const [focusPath, setFocusPath] = React.useState<string | null>(null);
  const [contentHeight, setContentHeight] = React.useState<number | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("job");

  // Inline-edit popover state.
  const [editPath, setEditPath] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");

  // Header title rename state.
  const [label, setLabel] = React.useState<string | null>(initial.label);
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");

  const commitRename = React.useCallback(async () => {
    const next = renameValue.trim();
    if (!docId || !next) {
      setRenaming(false);
      return;
    }
    try {
      await renameVersion(docId, next);
      setLabel(next);
      toast.success("Renamed.");
    } catch (e) {
      toast.error((e as Error).message ?? "Rename failed.");
    } finally {
      setRenaming(false);
    }
  }, [docId, renameValue]);

  const displayData = view === "tailored" && tailored ? tailored : baseline;

  // ── Heuristic recommendation as the user types (debounced, deterministic) ──
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      if (jd.trim().length < 30) {
        setRecommendation(null);
        return;
      }
      recommendTemplateForJd(jd)
        .then((r) => setRecommendation({ templateId: r.templateId, reason: r.reason }))
        .catch(() => setRecommendation(null));
    }, 400);
    return () => window.clearTimeout(id);
  }, [jd]);

  // ── Deterministic writing-style review (finding 1.3). lintStyle is a pure
  // function of cvData, so we recompute it client-side from the current tailored
  // data — always fresh, including after inline edits, with no server round-trip.
  const styleReport = React.useMemo(
    () => (tailored ? lintStyle(tailored) : null),
    [tailored],
  );

  // ── changedPaths for the preview overlay (from the diff) ──
  const changedPaths = React.useMemo(() => {
    const map: Record<string, "added" | "rewritten" | "removed" | "reordered"> = {};
    if (view !== "tailored" || !diff) return map;
    for (const e of diff.entries) {
      if (e.kind === "unchanged") continue;
      map[e.path] = e.kind as Exclude<DiffKind, "unchanged">;
    }
    return map;
  }, [diff, view]);

  // ── Generate ──
  // Generate when there's a real JD (≥30 chars) OR free-text instructions to act on.
  const canGenerate =
    initial.hasKnowledgeBase &&
    (jd.trim().length >= 30 || instructions.trim().length > 0) &&
    !generating;

  const handleGenerate = React.useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const res = await runTailoring({
        jobDescription: jd,
        templateId,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDocId(res.cvDocumentId);
      setTailored(res.cvData);
      setDiff(res.diff);
      setTruthfulness(res.truthfulness);
      setWarnings(res.warnings ?? []);
      setFitAssessment(res.fitAssessment ?? null);
      setTemplateId(res.templateId);
      setServerFits(res.fits);
      setNeedsReduction(res.needsReduction ?? null);
      setArtifactId(res.artifact?.id ?? null);
      setView("tailored");
      setTab("preview");
      if (res.fits) {
        toast.success("Tailored and fit to one page.");
      } else {
        toast.warning("Tailored — but it needs trimming to fit one page.");
      }
      // Reflect the doc in the URL without a full nav (so refresh/restore works).
      if (!initial.cvDocumentId) {
        window.history.replaceState(null, "", `/workspace/${res.cvDocumentId}`);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Tailoring failed.");
    } finally {
      setGenerating(false);
    }
  }, [canGenerate, jd, templateId, instructions, initial.cvDocumentId]);

  // ── Persist an inline edit → deterministic re-render (0 LLM) ──
  const persistEdit = React.useCallback(
    async (nextData: CvData) => {
      if (!docId) {
        // No tailored doc yet — keep the edit local only.
        setTailored(nextData);
        return;
      }
      setSaving(true);
      // Optimistic.
      setTailored(nextData);
      try {
        const res = await reRenderDocument({ cvDocumentId: docId, cvData: nextData, templateId });
        setServerFits(res.fits);
        setNeedsReduction(res.needsReduction ?? null);
        setArtifactId(res.artifact?.id ?? null);
        // Recompute the baseline↔edited diff deterministically. Per product
        // decision, we do NOT rerun truthfulness verification for manual edits.
        const d = await recomputeDiff(docId, nextData).catch(() => null);
        if (d) setDiff(d);
        setTruthfulness(null);
        if (res.fits) toast.success("Saved.", { duration: 2000 });
      } catch (e) {
        toast.error((e as Error).message ?? "Couldn't save that edit.");
      } finally {
        setSaving(false);
      }
    },
    [docId, templateId],
  );

  // ── Apply a new photo data URL to baseline + current view, persist, re-render ──
  const applyPhoto = React.useCallback(
    async (dataUrl: string) => {
      // Update local previews immediately (baseline is the source of truth).
      setBaseline((b) => (b ? { ...b, photoUrl: dataUrl } : b));
      const nextTailored = tailored ? { ...tailored, photoUrl: dataUrl } : null;
      if (nextTailored) setTailored(nextTailored);
      try {
        await setProfilePhoto({ dataUrl }); // persist on baseline (carry-forward source)
        // If a tailored doc exists, re-render its PDF so the export includes the photo.
        if (nextTailored && docId) await persistEdit(nextTailored);
        toast.success("Photo updated.");
      } catch (e) {
        toast.error((e as Error).message ?? "Couldn't save the photo.");
      }
    },
    [tailored, docId, persistEdit],
  );

  // ── Resize a picked image to a small square data URL (client-side, no upload server) ──
  const onPhotoFile = React.useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const SIZE = 360; // square, matches the circular crop
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          // center-crop to square, then scale down
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          void applyPhoto(dataUrl);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    },
    [applyPhoto],
  );

  // ── Click a field on the preview → open the inline editor (or photo picker) ──
  const handleFieldClick = React.useCallback(
    (path: string) => {
      if (path === "photoUrl") {
        photoInputRef.current?.click();
        return;
      }
      const data = view === "tailored" && tailored ? tailored : baseline;
      if (!data) return;
      const target = readPath(data, path);
      if (!target) return;
      setEditPath(path);
      setEditValue(target.value);
    },
    [view, tailored, baseline],
  );

  const commitEdit = React.useCallback(() => {
    if (!editPath) return;
    const data = view === "tailored" && tailored ? tailored : baseline;
    if (!data) return;
    const next = writePath(data, editPath, editValue);
    setEditPath(null);
    void persistEdit(next);
  }, [editPath, editValue, view, tailored, baseline, persistEdit]);

  // ── Export PDF ──
  const handleExport = React.useCallback(async () => {
    if (!artifactId) {
      toast.error("No PDF yet — generate or save an edit first.");
      return;
    }
    if (serverFits === false) {
      toast.error("Fix the one-page overflow before exporting.");
      return;
    }
    const blockingTruthErrors = (truthfulness?.flags ?? []).some((f) => f.severity === "error");
    if (blockingTruthErrors) {
      toast.error("Fix truthfulness errors before exporting this JD-generated version.");
      return;
    }
    setExporting(true);
    try {
      const { url } = await getDownloadUrl(artifactId);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(initial.label ?? "tailored-cv").replace(/\s+/g, "-")}.pdf`;
      a.click();
      toast.success("PDF ready.");
    } catch (e) {
      toast.error((e as Error).message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [artifactId, serverFits, initial.label, truthfulness]);

  // ── Auto-fit assist (re-render is the deterministic tighten ladder) ──
  const handleAutoFit = React.useCallback(async () => {
    if (!docId || !tailored) return;
    setSaving(true);
    try {
      const res = await reRenderDocument({ cvDocumentId: docId, cvData: tailored, templateId });
      setServerFits(res.fits);
      setNeedsReduction(res.needsReduction ?? null);
      setArtifactId(res.artifact?.id ?? null);
      if (res.fits) toast.success("Tightened spacing — now fits one page.");
      else toast.warning("Still over one page — trim a low-priority bullet.");
    } catch (e) {
      toast.error((e as Error).message ?? "Auto-fit failed.");
    } finally {
      setSaving(false);
    }
  }, [docId, tailored, templateId]);

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "Enter") {
        e.preventDefault();
        void handleGenerate();
      } else if (meta && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        void handleExport();
      } else if (meta && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        if (tailored) setView((v) => (v === "tailored" ? "baseline" : "tailored"));
      } else if (!meta && (e.key === "[" || e.key === "]")) {
        const tgt = e.target as HTMLElement;
        if (tgt.tagName === "TEXTAREA" || tgt.tagName === "INPUT") return;
        setTemplateId((t) => (t === "sidebar" ? "clean" : "sidebar"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleGenerate, handleExport, tailored]);

  const jump = React.useCallback((entry: FieldDiff) => {
    setView("tailored");
    setShowChanges(true);
    setFocusPath(entry.path);
    setTab("preview");
    window.setTimeout(() => setFocusPath(null), 1600);
  }, []);

  const jumpPath = React.useCallback((path: string) => {
    setView("tailored");
    setFocusPath(path);
    setTab("preview");
    window.setTimeout(() => setFocusPath(null), 1600);
  }, []);

  // ── Sub-render: the controls column ──
  const controls = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {!initial.hasKnowledgeBase && (
        <div className="rounded-md border border-[hsl(var(--ai))]/30 bg-[hsl(var(--ai-bg))]/60 p-3 text-[12px] text-[hsl(var(--ai))]">
          You need a profile before tailoring.{" "}
          <Link href="/onboarding" className="font-semibold underline">
            Upload a resume
          </Link>{" "}
          to build your knowledge base first.
        </div>
      )}

      <JdPasteBox
        value={jd}
        onChange={setJd}
        disabled={generating || !initial.hasKnowledgeBase}
        recommendation={recommendation}
      />

      {/* Free-text instructions to the AI (optional) */}
      <div className="space-y-1.5">
        <label
          htmlFor="tailor-instructions"
          className="text-xs font-medium tracking-[0.02em] text-foreground"
        >
          Instructions to the AI <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="tailor-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={generating || !initial.hasKnowledgeBase}
          rows={3}
          placeholder="e.g. Emphasize leadership; drop the 3rd bullet under Acme; keep it to 4 skills."
          className="resize-none text-[13px]"
        />
        <p className="text-[11px] text-muted-foreground">
          Tell the AI how to tailor — it still never invents facts outside your profile.
        </p>
      </div>

      {/* Template picker */}
      <fieldset className="space-y-2" disabled={generating}>
        <legend className="text-xs font-medium tracking-[0.02em] text-foreground">
          Template
        </legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Template">
          {(["sidebar", "clean"] as const).map((t) => {
            const selected = templateId === t;
            const recommended = recommendation?.templateId === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTemplateId(t)}
                className={cn(
                  "relative rounded-md border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                )}
              >
                <span className="block text-[12px] font-semibold text-foreground">
                  {t === "sidebar" ? "Type 1 · Sidebar" : "Type 2 · Clean"}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {t === "sidebar" ? "tech · product · startups" : "consulting · finance · formal"}
                </span>
                {recommended && !selected && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-[hsl(var(--ai-bg))] px-1.5 py-0.5 text-[9px] font-medium text-[hsl(var(--ai))]">
                    Suggested
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Generate / progress */}
      {generating ? (
        <GenerationProgress provider={initial.providerLabel} running={generating} />
      ) : (
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full"
          aria-keyshortcuts="Meta+Enter"
        >
          <Wand2 className="h-4 w-4" aria-hidden />
          {tailored ? "Tailor again" : "Tailor CV"}
        </Button>
      )}

      {/* JD↔CV fit estimate (deterministic, finding 2.1) */}
      {tailored && fitAssessment && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium tracking-[0.02em] text-foreground">Job fit</h3>
          <FitScore fit={fitAssessment} />
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-[hsl(var(--ai))]/30 bg-[hsl(var(--ai-bg))]/60 p-2.5 text-[11px] text-[hsl(var(--ai))]">
          <p className="mb-1 font-medium">Honest notes</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Truthfulness review */}
      {tailored && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium tracking-[0.02em] text-foreground">
            Truthfulness review
          </h3>
          <TruthfulnessReview report={truthfulness} onJump={jumpPath} />
        </div>
      )}

      {/* Writing-style review (deterministic, finding 1.3) */}
      {tailored && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium tracking-[0.02em] text-foreground">
            Writing style
          </h3>
          <StyleReview report={styleReport} onJump={jumpPath} />
        </div>
      )}

      {/* Changes panel */}
      {tailored && diff && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium tracking-[0.02em] text-foreground">Changes</h3>
          <TailorDiffPanel diff={diff} focusPath={focusPath} onJump={jump} />
        </div>
      )}
    </div>
  );

  // ── Sub-render: the preview column ──
  const preview = (
    <div className="flex h-full flex-col">
      {/* Preview toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          {/* Baseline ↔ Tailored toggle */}
          <div
            className="inline-flex rounded-md border border-border p-0.5"
            role="radiogroup"
            aria-label="Compare baseline and tailored"
          >
            {(["baseline", "tailored"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                disabled={v === "tailored" && !tailored}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                  view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "baseline" ? "Baseline" : "Tailored"}
              </button>
            ))}
          </div>

          {/* Show changes toggle */}
          {tailored && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showChanges}
                onChange={(e) => setShowChanges(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--ai))]"
              />
              Show changes
            </label>
          )}
          {saving && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={async () => {
              try {
                const o = await getOriginalResume();
                if (!o) {
                  toast("No original file — this profile was built from pasted text.");
                  return;
                }
                window.open(o.url, "_blank", "noopener,noreferrer");
              } catch {
                toast.error("Couldn't open the original résumé.");
              }
            }}
            className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View original
          </button>
          <span>Click any field to edit</span>
        </div>
      </div>

      {/* Hidden photo picker (triggered by clicking the sidebar photo) */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPhotoFile(f);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {/* Preview body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <PreviewFrame className="min-h-full">
          <div className="w-[794px] max-w-full">
            {displayData ? (
              <CvPreview
                data={displayData}
                templateId={templateId}
                showChanges={showChanges && view === "tailored"}
                changedPaths={changedPaths}
                focusPath={focusPath}
                onFieldClick={view === "tailored" || !tailored ? handleFieldClick : undefined}
                onMeasure={setContentHeight}
              />
            ) : (
              <div className="flex aspect-[794/1123] w-[794px] items-center justify-center bg-white text-[13px] text-gray-400">
                Your CV preview will appear here.
              </div>
            )}
          </div>
        </PreviewFrame>
      </div>

      {/* Fit gauge */}
      <div className="border-t border-border px-4 py-2.5">
        <OnePageFitIndicator
          contentHeightPx={contentHeight}
          serverFits={serverFits}
          needsReduction={needsReduction}
          autoFitting={saving}
          onAutoFit={handleAutoFit}
          onJumpToPath={jumpPath}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Workspace bar */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Link>
          </Button>
          {renaming ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="h-7 w-48 text-[13px]"
                aria-label="CV name"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void commitRename()}
                aria-label="Save name"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setRenaming(false)}
                aria-label="Cancel rename"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[13px] font-medium text-foreground">
                {label ?? "Untitled draft"}
              </span>
              {docId && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setRenameValue(label ?? "");
                    setRenaming(true);
                  }}
                  aria-label="Rename CV"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tailored && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setView("baseline");
                toast("Showing your untouched baseline.");
              }}
              title="View baseline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Baseline
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={exporting || !artifactId || serverFits === false}
            aria-keyshortcuts="Meta+E"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            Export PDF
          </Button>
        </div>
      </header>

      {/* Mobile tab bar (<1280) */}
      <div className="flex border-b border-border xl:hidden" role="tablist" aria-label="Workspace sections">
        {(["job", "preview", "changes"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-3 py-2 text-[12px] font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Desktop split-pane */}
      <div className="hidden min-h-0 flex-1 xl:flex">
        <div className="w-[420px] shrink-0 border-r border-border">{controls}</div>
        <div className="min-w-0 flex-1 bg-background">{preview}</div>
      </div>

      {/* Mobile single column */}
      <div className="min-h-0 flex-1 overflow-hidden xl:hidden">
        {tab === "job" && <div className="h-full overflow-y-auto">{controls}</div>}
        {tab === "preview" && <div className="h-full">{preview}</div>}
        {tab === "changes" && (
          <div className="h-full space-y-4 overflow-y-auto p-4">
            {tailored ? (
              <>
                <TruthfulnessReview report={truthfulness} onJump={jumpPath} />
                <StyleReview report={styleReport} onJump={jumpPath} />
                {diff && <TailorDiffPanel diff={diff} focusPath={focusPath} onJump={jump} />}
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Generate to see what changed.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Inline-edit dialog */}
      <Dialog open={editPath !== null} onOpenChange={(o) => !o && setEditPath(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editPath ? (readPath(displayData ?? ({} as CvData), editPath)?.label ?? "Edit field") : "Edit"}
            </DialogTitle>
          </DialogHeader>
          {editPath && readPath(displayData ?? ({} as CvData), editPath)?.isList && (
            <p className="-mt-2 text-[11px] text-muted-foreground">One item per line.</p>
          )}
          {editPath &&
          (readPath(displayData ?? ({} as CvData), editPath)?.multiline ||
            readPath(displayData ?? ({} as CvData), editPath)?.isList) ? (
            <Textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[120px]"
              aria-label="Field value"
            />
          ) : (
            <Input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
              }}
              aria-label="Field value"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditPath(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={commitEdit}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
