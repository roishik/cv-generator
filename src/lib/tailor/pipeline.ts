/**
 * End-to-end JD → tailored CV pipeline (Milestone M8 / M10).
 *
 * `tailorToJob({ userId, jobDescription, templateId? })` is the single RLS-scoped
 * orchestrator the workspace UI calls. It guarantees the determinism + cost
 * invariants from planning 04 §8:
 *
 *   - EXACTLY ONE tailoring LLM call (mock provider by default), and ZERO on a
 *     cache hit (identical kbVersion + JD + templateId reuses the stored row +
 *     artifact).
 *   - Everything else — template heuristic, render, one-page auto-fit, PDF, diff,
 *     truthfulness gate — is pure code.
 *   - The baseline document is preserved; the tailored CV is a NEW versioned
 *     cv_documents row.
 *   - The one-page guarantee is honoured: if the fit ladder is exhausted we
 *     return a structured "needs content reduction" signal and NEVER clip.
 *
 * Layering: this is an outer orchestrator that touches db + ai/factory + render +
 * pdf + storage, so it lives in lib/tailor (not lib/ai / lib/render-engine, which
 * the dependency-direction lint forbids from importing db/auth).
 */

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { RlsDb } from "@/lib/db/rls";
import { withUser } from "@/lib/db/rls";
import { artifacts, cvDocuments, jobDescriptions } from "@/lib/db/schema";
import { createProvider } from "@/lib/ai/factory";
import type { ProviderId, TokenUsage } from "@/lib/ai/provider";
import { tailorCv, type TailorCvOutput } from "@/lib/ai/pipeline";
import type { TruthfulnessReport } from "@/lib/ai/truthfulness";
import { lintStyle, type StyleReport } from "@/lib/ai/style-lint";
import { suggestCuts, type CutSuggestion } from "./suggest-cuts";
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";
import type { TailorRationaleItem } from "@/lib/schemas/llm-contracts";
import { assertUsageWithinCap } from "@/lib/ai/token-budget";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { runQaChecks, type QaReport } from "@/lib/qa/assertions";
import { defaultThemeFor } from "@/lib/render-engine/themes/registry";
import { getStorage } from "@/lib/storage/factory";
import { assertWithinRateLimit } from "@/lib/ratelimit";
import {
  providerModel,
  providerUsage,
  recordLlmUsageEvent,
} from "@/lib/usage/llm-usage";
import {
  loadBaselineCvData,
  loadKnowledgeBase,
  projectBaselineCvData,
} from "./kb-loader";
import { resolveTemplate } from "./template-heuristic";
import { jdHash, tailorCacheKey } from "./cache";
import { computeStructuredDiff, type StructuredDiff } from "./diff";

export interface TailorToJobInput {
  userId: string;
  jobDescription: string;
  /** Explicit template override; absent → deterministic heuristic. */
  templateId?: TemplateId;
  /** Provider override; defaults to env AI_PROVIDER (mock locally/CI). */
  provider?: ProviderId;
  /** Decrypted BYOK key for real providers (never logged). */
  apiKey?: string;
  /** Optional model override. */
  model?: string;
  /** BYOK vs managed-free audit marker (set by resolveProvider). */
  billingMode?: "mock" | "byok" | "managed-free";
  /** Managed-free per-request cap (max(default, 2x rolling avg)). */
  freeTokenCap?: number;
  /** Optional company/title metadata (auto-detected upstream from the JD). */
  company?: string;
  title?: string;
  /** Optional free-text user instructions (e.g. "drop bullet 3, emphasize X"). */
  instructions?: string;
  /** Test hook: a deterministic provider instead of the factory-built one. */
  providerOverride?: import("@/lib/ai/provider").LLMProvider;
}

export interface TailorToJobSuccess {
  ok: true;
  /** false when the fit ladder was exhausted (needs content reduction). */
  fits: boolean;
  /** Whether this run reused a cached document + artifact (0 LLM calls). */
  cacheHit: boolean;
  /** Whether the LLM call was actually made (false on cache hit). */
  llmCalled: boolean;
  cvDocumentId: string;
  version: number;
  jobDescriptionId: string;
  templateId: TemplateId;
  themeId: string;
  templateReason: string;
  cvData: CvData;
  rationale: TailorRationaleItem[];
  warnings: string[];
  diff: StructuredDiff;
  truthfulness: TruthfulnessReport;
  /** Deterministic writing-style review (warnings only; never blocks export). */
  style: StyleReport;
  /** Present when fits === true. */
  artifact?: {
    id: string;
    storagePath: string;
    byteSize: number;
    pageCount: number;
    qa: QaReport;
  };
  /** Present when fits === false — the structured "reduce content" signal. */
  needsReduction?: {
    reason: string;
    suggestion: string;
    /** Relevance-weighted, user-confirmable cut suggestions (finding 1.4). */
    cutSuggestions: CutSuggestion[];
  };
}

export type TailorToJobResult = TailorToJobSuccess;

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Run the full pipeline for a user. Opens its own RLS transaction unless one is
 * supplied (tests can pass a tx to avoid nesting).
 */
export async function tailorToJob(
  input: TailorToJobInput,
  existingTx?: RlsDb,
): Promise<TailorToJobResult> {
  if (!input.userId) throw new Error("tailorToJob: userId is required");
  const jd = (input.jobDescription ?? "").trim();
  const hasInstructions = !!input.instructions?.trim();
  // Allow a tailoring run with NO job description as long as the user gave
  // free-text instructions (e.g. "remove the MBA"). Otherwise require a real JD.
  if (jd.length < 30 && !hasInstructions) {
    throw new Error(
      "tailorToJob: provide a job description (≥30 chars) or instructions to tailor against",
    );
  }

  const run = (tx: RlsDb) => runInTx(tx, input, jd);
  return existingTx ? run(existingTx) : withUser(input.userId, run);
}

async function runInTx(
  tx: RlsDb,
  input: TailorToJobInput,
  jd: string,
): Promise<TailorToJobResult> {
  const { userId } = input;

  // 1) Load KB + baseline.
  const { knowledgeBaseId, version: kbVersion, knowledgeBase } = await loadKnowledgeBase(
    tx,
    userId,
  );
  const baseline =
    (await loadBaselineCvData(tx, userId, knowledgeBaseId)) ??
    projectBaselineCvData(knowledgeBase);

  // 2) Deterministic template selection (explicit override wins).
  const tpl = resolveTemplate(jd, input.templateId);
  const templateId = tpl.templateId;
  const themeId = defaultThemeFor(templateId).id;

  // 3) Persist (or reuse) the job_descriptions row.
  const jdSha = jdHash(jd);
  const jobDescriptionId = await upsertJobDescription(tx, userId, jd, jdSha, input);

  // 4) Cache lookup — identical (kbVersion + JD + templateId + instructions) ⇒ 0 LLM calls.
  const cacheKey = tailorCacheKey({
    kbVersion,
    jobDescription: jd,
    templateId,
    ...(input.instructions ? { instructions: input.instructions } : {}),
  });
  const [cached] = await tx
    .select()
    .from(cvDocuments)
    .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.tailorCacheKey, cacheKey)))
    .limit(1);

  if (cached) {
    const [artifact] = await tx
      .select()
      .from(artifacts)
      .where(eq(artifacts.cvDocumentId, cached.id))
      .limit(1);
    const diff = cached.diff as unknown as StructuredDiff;
    const truthfulness = cached.truthfulness as unknown as TruthfulnessReport;
    // Style is a pure function of cvData and is not persisted — recompute it on
    // the cache-hit path so the warning surface is identical to a fresh run.
    const style = lintStyle(cached.cvData as CvData);
    return {
      ok: true,
      fits: !!artifact,
      cacheHit: true,
      llmCalled: false,
      cvDocumentId: cached.id,
      version: cached.version,
      jobDescriptionId: cached.jobDescriptionId ?? jobDescriptionId,
      templateId: cached.templateId as TemplateId,
      themeId: cached.themeId,
      templateReason: tpl.reason,
      cvData: cached.cvData as CvData,
      rationale: (cached.rationale as TailorRationaleItem[]) ?? [],
      warnings: (cached.warnings as string[]) ?? [],
      diff: diff?.entries ? diff : { entries: [], summary: { added: 0, rewritten: 0, removed: 0, reordered: 0 } },
      truthfulness: truthfulness?.flags
        ? truthfulness
        : { ok: true, flags: [] },
      style,
      ...(artifact
        ? {
            artifact: {
              id: artifact.id,
              storagePath: artifact.storagePath,
              byteSize: artifact.byteSize,
              pageCount: artifact.pageCount,
              qa: artifact.qa as unknown as QaReport,
            },
          }
        : {
            needsReduction: {
              reason: "Cached tailoring could not fit one page.",
              suggestion: "Reduce content and re-run.",
              cutSuggestions: suggestCuts(cached.cvData as CvData, jd),
            },
          }),
    };
  }

  // 5) LLM tailoring call (with one bounded truthfulness-repair retry for JD runs).
  const hasRealJd = jd.length >= 30;
  assertWithinRateLimit({ kind: "llm", userId });
  const provider =
    input.providerOverride ??
    createProvider({
      provider: input.provider ?? "mock",
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
      ...(input.model ? { model: input.model } : {}),
    });

  const startedAt = Date.now();
  let attempts = 0;
  let totalUsage: TokenUsage | null = null;
  const collectUsage = () => {
    const usage = providerUsage(provider);
    if (!usage) return;
    if (!totalUsage) {
      totalUsage = { ...usage };
      return;
    }
    totalUsage.promptTokens += usage.promptTokens;
    totalUsage.completionTokens += usage.completionTokens;
    totalUsage.totalTokens += usage.totalTokens;
  };

  let tailored: TailorCvOutput;
  try {
    attempts += 1;
    tailored = await tailorCv(provider, {
      knowledgeBase,
      jobDescription: jd,
      templateId,
      baselineCvData: baseline,
      ...(input.instructions ? { instructions: input.instructions } : {}),
    });
    collectUsage();

    if (hasRealJd && !tailored.truthfulness.ok) {
      attempts += 1;
      tailored = await tailorCv(provider, {
        knowledgeBase,
        jobDescription: jd,
        templateId,
        baselineCvData: baseline,
        instructions: buildTruthfulnessRepairInstruction(
          input.instructions,
          tailored.truthfulness,
        ),
      });
      collectUsage();
    }

    if (!hasRealJd) {
      tailored.truthfulness = { ok: true, flags: [] };
    }

    if (hasRealJd && !tailored.truthfulness.ok) {
      throw new Error(
        "Tailoring blocked: unable to produce a truthful CV after retry. Try adjusting the JD or your profile context.",
      );
    }

    assertUsageWithinCap(
      "tailor",
      totalUsage,
      input.billingMode === "managed-free" ? input.freeTokenCap : undefined,
    );

    await recordLlmUsageEvent({
      userId,
      kind: "tailor",
      provider: provider.id,
      model: providerModel(provider),
      status: "ok",
      latencyMs: Date.now() - startedAt,
      usage: totalUsage,
      meta: {
        billing: input.billingMode ?? "unknown",
        attempts,
        hadTruthfulnessRetry: attempts > 1,
        freeTokenCap: input.freeTokenCap ?? null,
      },
    });
  } catch (e) {
    collectUsage();
    await recordLlmUsageEvent({
      userId,
      kind: "tailor",
      provider: provider.id,
      model: providerModel(provider),
      status: "error",
      latencyMs: Date.now() - startedAt,
      usage: totalUsage,
      meta: {
        billing: input.billingMode ?? "unknown",
        attempts,
        freeTokenCap: input.freeTokenCap ?? null,
        error: (e as Error).message,
      },
    });
    throw e;
  }

  // 6) Structured diff vs baseline (richer than the coarse pipeline diff).
  const diff = computeStructuredDiff(baseline, tailored.cvData);

  // 7) Render + one-page auto-fit. NEVER clip — exhaustion ⇒ structured signal.
  const pdfResult = await renderCvToPdf(tailored.cvData, templateId);

  // 8) Persist a NEW versioned cv_documents row (baseline preserved).
  const nextVersion = await nextTailoredVersion(tx, userId);
  const [doc] = await tx
    .insert(cvDocuments)
    .values({
      userId,
      kind: "tailored",
      parentId: null,
      version: nextVersion,
      templateId,
      themeId,
      knowledgeBaseId,
      kbVersion,
      jobDescriptionId,
      cvData: tailored.cvData as unknown as Record<string, unknown>,
      rationale: tailored.rationale as unknown as unknown[],
      warnings: tailored.warnings as unknown as unknown[],
      diff: diff as unknown as Record<string, unknown>,
      truthfulness: tailored.truthfulness as unknown as Record<string, unknown>,
      tailorCacheKey: cacheKey,
      label: `${tailored.cvData.header.name} – ${input.title ?? input.company ?? "Tailored"}`,
    })
    .returning({ id: cvDocuments.id, version: cvDocuments.version });

  const cvDocumentId = doc!.id;

  // 9) If the ladder was exhausted, return the structured reduction signal.
  if (!pdfResult.fits) {
    return {
      ok: true,
      fits: false,
      cacheHit: false,
      llmCalled: true,
      cvDocumentId,
      version: doc!.version,
      jobDescriptionId,
      templateId,
      themeId,
      templateReason: tpl.reason,
      cvData: tailored.cvData,
      rationale: tailored.rationale,
      warnings: tailored.warnings,
      diff,
      truthfulness: tailored.truthfulness,
      style: tailored.style,
      needsReduction: {
        reason: pdfResult.reason,
        suggestion: pdfResult.suggestion,
        cutSuggestions: suggestCuts(tailored.cvData, jd),
      },
    };
  }

  // 10) Store the PDF artifact + record it (RLS-scoped).
  const storage = getStorage();
  const storagePath = `artifacts/${userId}/${randomUUID()}.pdf`;
  await storage.put({ key: storagePath, data: pdfResult.pdf, mimeType: "application/pdf" });

  const qa = await runQaChecks({
    pdf: pdfResult.pdf,
    html: pdfResult.html,
    templateId,
    expectedText: tailored.cvData.header.name,
    contentHeightPx: pdfResult.contentHeightPx,
    pageHeightPx: pdfResult.theme.page.heightPx,
    safeBottomPx: pdfResult.theme.page.safeBottomPx,
  });

  const [artifact] = await tx
    .insert(artifacts)
    .values({
      userId,
      cvDocumentId,
      storagePath,
      byteSize: pdfResult.pdf.byteLength,
      sha256: sha256(pdfResult.pdf),
      pageCount: 1,
      qa: qa as unknown as Record<string, unknown>,
    })
    .returning({ id: artifacts.id });

  return {
    ok: true,
    fits: true,
    cacheHit: false,
    llmCalled: true,
    cvDocumentId,
    version: doc!.version,
    jobDescriptionId,
    templateId,
    themeId,
    templateReason: tpl.reason,
    cvData: tailored.cvData,
    rationale: tailored.rationale,
    warnings: tailored.warnings,
    diff,
    truthfulness: tailored.truthfulness,
    style: tailored.style,
    artifact: {
      id: artifact!.id,
      storagePath,
      byteSize: pdfResult.pdf.byteLength,
      pageCount: 1,
      qa,
    },
  };
}

/** Insert or reuse the job_descriptions row for this (user, jd-hash). */
async function upsertJobDescription(
  tx: RlsDb,
  userId: string,
  jd: string,
  jdSha: string,
  input: TailorToJobInput,
): Promise<string> {
  const [existing] = await tx
    .select({ id: jobDescriptions.id })
    .from(jobDescriptions)
    .where(and(eq(jobDescriptions.userId, userId), eq(jobDescriptions.sha256, jdSha)))
    .limit(1);
  if (existing) return existing.id;

  const [row] = await tx
    .insert(jobDescriptions)
    .values({
      userId,
      ...(input.title ? { title: input.title } : {}),
      ...(input.company ? { company: input.company } : {}),
      // Keep a non-empty record even for instructions-only runs (no real JD).
      rawText: jd || "(no job description — tailored via instructions)",
      sha256: jdSha,
    })
    .returning({ id: jobDescriptions.id });
  return row!.id;
}

/** Compute the next tailored-document version for a user (monotonic per user). */
async function nextTailoredVersion(tx: RlsDb, userId: string): Promise<number> {
  const rows = await tx
    .select({ version: cvDocuments.version })
    .from(cvDocuments)
    .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "tailored")));
  const max = rows.reduce((m, r) => Math.max(m, r.version), 0);
  return max + 1;
}

function buildTruthfulnessRepairInstruction(
  existingInstruction: string | undefined,
  report: TruthfulnessReport,
): string {
  const errors = report.flags
    .filter((f) => f.severity === "error")
    .map((f) => `- ${f.path}: ${f.message}`)
    .slice(0, 12);
  const retry = [
    "RETRY MODE — STRICT TRUTHFULNESS REPAIR:",
    "It is acceptable if the candidate does NOT fully match every JD requirement.",
    "Do NOT force-fit missing years/skills. Prefer truthful partial-fit phrasing.",
    "Example: if JD asks 4 years and KB supports 3, keep 3 years and position it honestly.",
    "Keep every employer/company/period exactly as in the KB.",
    "Fix these truthfulness errors exactly:",
    ...errors,
  ].join("\n");
  return [existingInstruction?.trim() ?? "", retry].filter(Boolean).join("\n\n");
}
