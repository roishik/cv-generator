"use client";

/**
 * OnboardingWizard — 3-step first-run flow.
 *
 * Step 1: Upload resume (drag-drop PDF/DOCX → /api/uploads) OR paste text fallback
 * Step 2: Extraction progress → review the extracted profile summary
 * Step 3: Add a provider key (or skip to use mock)
 *
 * Wired to the REAL backend: extractProfileFromUpload / extractProfileFromText.
 * In dev: AI_PROVIDER=mock gives deterministic output with zero real keys.
 */

import { useState, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Loader2,
  User,
  Briefcase,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { extractProfileFromUpload, extractProfileFromText } from "@/app/(app)/onboarding/actions";
import type { ExtractionActionResult } from "@/app/(app)/onboarding/actions";

// ─────────────────────────────────────────────────────────────────────────────
// Step rail
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Upload", description: "Your resume" },
  { label: "Review", description: "Extracted profile" },
  { label: "AI key", description: "Optional — skip for mock" },
];

function StepRail({ current }: { current: number }) {
  return (
    <nav aria-label="Onboarding progress" className="mb-10">
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((step, i) => {
          const state = i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li key={i} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-all duration-180",
                    state === "done" && "bg-spruce-600 text-white",
                    state === "active" && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2",
                    state === "pending" && "bg-muted text-muted-foreground",
                  )}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      state === "active" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-3 mb-4 h-px w-16 transition-colors duration-240",
                    i < current ? "bg-spruce-600" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Upload
// ─────────────────────────────────────────────────────────────────────────────

interface Step1Props {
  onExtracted: (result: ExtractionActionResult) => void;
}

function Step1Upload({ onExtracted }: Step1Props) {
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    setUploadStatus("uploading");

    // 1. Upload file.
    const formData = new FormData();
    formData.append("file", file);
    let uploadId: string;
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json() as Record<string, string>;
      if (!res.ok) {
        setUploadStatus("error");
        setErrorMsg(data.error ?? "Upload failed. Try a PDF or DOCX.");
        return;
      }
      uploadId = data.uploadId;
    } catch {
      setUploadStatus("error");
      setErrorMsg("Network error. Please try again.");
      return;
    }

    // 2. Extract profile.
    setUploadStatus("extracting");
    startTransition(async () => {
      const result = await extractProfileFromUpload({ uploadId });
      if ("error" in result) {
        setUploadStatus("error");
        setErrorMsg(result.error);
      } else {
        setUploadStatus("done");
        onExtracted(result);
      }
    });
  }, [onExtracted, startTransition]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handlePasteSubmit() {
    if (pasteText.trim().length < 100) {
      toast.error("Paste at least 100 characters of resume text.");
      return;
    }
    setUploadStatus("extracting");
    setErrorMsg(null);
    startTransition(async () => {
      const result = await extractProfileFromText({ rawText: pasteText });
      if ("error" in result) {
        setUploadStatus("error");
        setErrorMsg(result.error);
      } else {
        setUploadStatus("done");
        onExtracted(result);
      }
    });
  }

  const isLoading = uploadStatus === "uploading" || uploadStatus === "extracting" || isPending;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground">
          Drop your resume
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          We&apos;ll build a structured knowledge base from your real experience.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex justify-center">
        <div
          className="inline-flex gap-0.5 rounded-lg bg-muted p-1"
          role="tablist"
          aria-label="Input method"
        >
          {(["upload", "paste"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-4 py-1.5 text-[13px] font-medium transition-all duration-120",
                mode === m
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "upload" ? "File upload" : "Paste text"}
            </button>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      {mode === "upload" && (
        <div
          role="region"
          aria-label="File upload drop zone"
          className={cn(
            "group flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-all duration-180",
            dragOver
              ? "border-primary bg-spruce-100 dark:bg-[hsl(var(--accent))]"
              : "border-border bg-card hover:border-primary/50 hover:bg-secondary",
            isLoading && "pointer-events-none opacity-60",
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          tabIndex={0}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-[13px] font-medium text-foreground">
                {uploadStatus === "uploading" ? "Uploading…" : "Reading your experience…"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {uploadStatus === "extracting" && "Extracting your profile structure"}
              </p>
            </div>
          ) : (
            <>
              <Upload
                className={cn(
                  "h-8 w-8 transition-colors duration-120",
                  dragOver ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                )}
                aria-hidden
              />
              <div className="text-center">
                <p className="text-[14px] font-medium text-foreground">
                  Drag &amp; drop or click to upload
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  PDF or DOCX · up to 8 MB
                </p>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={handleFileInput}
            aria-label="Resume file"
            tabIndex={-1}
          />
        </div>
      )}

      {/* Paste zone */}
      {mode === "paste" && (
        <div className="space-y-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste the full text of your resume here…"
            className="min-h-[200px] w-full resize-y rounded-xl border border-border bg-card p-4 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isLoading}
            aria-label="Resume text"
          />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">
              {pasteText.length} characters
              {pasteText.length > 0 && pasteText.length < 100 && (
                <span className="ml-1 text-destructive">(need ≥100)</span>
              )}
            </span>
            <Button
              onClick={handlePasteSubmit}
              disabled={isLoading || pasteText.trim().length < 100}
              size="sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Extracting…
                </>
              ) : (
                <>
                  Extract profile
                  <ArrowRight className="ml-2 h-3.5 w-3.5" aria-hidden />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-[13px] text-destructive">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Profile Review
// ─────────────────────────────────────────────────────────────────────────────

interface Step2Props {
  result: ExtractionActionResult;
  onContinue: () => void;
}

function Step2Review({ result, onContinue }: Step2Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-spruce-100">
          <CheckCircle2 className="h-6 w-6 text-spruce-600" aria-hidden />
        </div>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground">
          Profile extracted
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {result.fromCache
            ? "Loaded from cache — no AI call needed."
            : "Your knowledge base has been built from your resume."}
          {result.shortText && (
            <span className="ml-1 text-ai">
              The text was short — some fields may need filling in.
            </span>
          )}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            icon: User,
            label: "Profile",
            description: "Name, title, contact, summary",
          },
          {
            icon: Briefcase,
            label: "Experience",
            description: "Roles, companies, bullets",
          },
          {
            icon: GraduationCap,
            label: "Education & Skills",
            description: "Degrees and skill groups",
          },
        ].map(({ icon: Icon, label, description }) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-spruce-100">
              <Icon className="h-3.5 w-3.5 text-spruce-600" aria-hidden />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{label}</p>
              <p className="text-[12px] text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-secondary/50 p-4">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Document ID:</span>{" "}
          <code className="font-mono text-[12px]">{result.knowledgeBaseId.slice(0, 8)}…</code>
          <span className="mx-2 text-border">·</span>
          <span className="font-medium text-foreground">Baseline CV:</span>{" "}
          <code className="font-mono text-[12px]">{result.baselineCvDocumentId.slice(0, 8)}…</code>
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          You can edit every field in your profile at any time from the Profile section.
        </p>
      </div>

      <Button onClick={onContinue} className="w-full" size="lg">
        Continue
        <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Provider key (optional)
// ─────────────────────────────────────────────────────────────────────────────

interface Step3Props {
  onFinish: () => void;
}

function Step3ApiKey({ onFinish }: Step3Props) {
  const router = useRouter();

  function goToSettings() {
    router.push("/settings");
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground">
          Bring your AI key
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Tailor uses your own AI API key. Keys are AES-256-GCM encrypted and
          never logged.
        </p>
      </div>

      {/* Mock notice */}
      <div className="rounded-lg border border-[hsl(var(--ai-bg))] bg-[hsl(var(--ai-bg))] p-4">
        <p className="text-[13px] font-medium text-ai">Running on mock provider</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Locally, tailoring works out of the box with{" "}
          <code className="font-mono text-[11px]">AI_PROVIDER=mock</code>. Add
          a real key to use Claude, GPT-4, or Gemini in production.
        </p>
      </div>

      {/* Provider logos placeholder */}
      <div className="flex items-center justify-center gap-4">
        {["Anthropic", "OpenAI", "Google"].map((name) => (
          <div
            key={name}
            className="flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-[12px] font-medium text-muted-foreground"
          >
            {name}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={goToSettings} className="w-full" size="lg">
          Add API key in Settings
          <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={onFinish}
        >
          Skip for now — use mock locally
        </Button>
      </div>

      <p className="text-center text-[12px] text-muted-foreground">
        You can always add a key later from{" "}
        <button
          onClick={goToSettings}
          className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Settings
        </button>
        .
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard
// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [extractionResult, setExtractionResult] = useState<ExtractionActionResult | null>(null);
  const router = useRouter();

  function handleExtracted(result: ExtractionActionResult) {
    setExtractionResult(result);
    setStep(1);
  }

  function handleReviewContinue() {
    setStep(2);
  }

  function handleFinish() {
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <StepRail current={step} />

        <div className="rounded-2xl border border-border bg-card p-8 shadow-md">
          {step === 0 && <Step1Upload onExtracted={handleExtracted} />}
          {step === 1 && extractionResult && (
            <Step2Review result={extractionResult} onContinue={handleReviewContinue} />
          )}
          {step === 2 && <Step3ApiKey onFinish={handleFinish} />}
        </div>

        {/* Skip */}
        {step === 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleFinish}
              className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip onboarding → go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
