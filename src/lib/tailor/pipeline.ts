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
import type { ProviderId } from "@/lib/ai/provider";
import { tailorCv } from "@/lib/ai/pipeline";
import type { TruthfulnessReport } from "@/lib/ai/truthfulness";
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";
import type { TailorRationaleItem } from "@/lib/schemas/llm-contracts";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { runQaChecks, type QaReport } from "@/lib/qa/assertions";
import { defaultThemeFor } from "@/lib/render-engine/themes/registry";
import { getStorage } from "@/lib/storage/local-fs";
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
  /** Optional company/title metadata (auto-detected upstream from the JD). */
  company?: string;
  title?: string;
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
  /** Present when fits === true. */
  artifact?: {
    id: string;
    storagePath: string;
    byteSize: number;
    pageCount: number;
    qa: QaReport;
  };
  /** Present when fits === false — the structured "reduce content" signal. */
  needsReduction?: { reason: string; suggestion: string };
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
  const jd = input.jobDescription?.trim();
  if (!jd || jd.length < 30) {
    throw new Error("tailorToJob: jobDescription is empty or too short to tailor against");
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

  // 4) Cache lookup — identical (kbVersion + JD + templateId) ⇒ 0 LLM calls.
  const cacheKey = tailorCacheKey({ kbVersion, jobDescription: jd, templateId });
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
            },
          }),
    };
  }

  // 5) THE single LLM call (mock by default). Truthfulness gate runs inside.
  const provider =
    input.providerOverride ??
    createProvider({
      provider: input.provider ?? "mock",
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
      ...(input.model ? { model: input.model } : {}),
    });

  const tailored = await tailorCv(provider, {
    knowledgeBase,
    jobDescription: jd,
    templateId,
    baselineCvData: baseline,
  });

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
      needsReduction: { reason: pdfResult.reason, suggestion: pdfResult.suggestion },
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
      rawText: jd,
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
