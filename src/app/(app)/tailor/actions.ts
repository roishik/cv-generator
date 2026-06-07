"use server";

/**
 * Tailoring workspace server actions — the clean typed surface the workspace UI
 * (built next) calls. Every action is RLS-scoped via requireSession()+withUser.
 *
 *   runTailoring(input)        → JD → tailored versioned CV + PDF artifact (≤1 LLM call, cached)
 *   getTailoredVersion(id)     → fetch one tailored document (+ its artifact, if any)
 *   listTailoredVersions()     → list the user's tailored documents (newest first)
 *   reRenderDocument(input)    → re-render after inline edits — DETERMINISTIC, 0 LLM calls
 *   getDownloadUrl(artifactId) → mint a short-lived signed URL for the stored PDF
 *
 * The single LLM call lives in `tailorToJob` (lib/tailor/pipeline). Inline-edit
 * re-render and export are pure code → zero tokens (planning 04 §8).
 */

import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { withUser } from "@/lib/db/rls";
import { artifacts, cvDocuments, jobDescriptions, resumeUploads } from "@/lib/db/schema";
import { CvData, TemplateId } from "@/lib/schemas/cv-data";
import { resolveProvider } from "@/lib/providers/resolve-provider";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { runQaChecks } from "@/lib/qa/assertions";
import { getStorage } from "@/lib/storage/local-fs";
import { tailorToJob, type TailorToJobResult } from "@/lib/tailor/pipeline";
import {
  loadKnowledgeBase,
  loadBaselineCvData,
  projectBaselineCvData,
} from "@/lib/tailor/kb-loader";
import { recommendTemplate } from "@/lib/tailor/template-heuristic";
import { verifyTruthfulness, type TruthfulnessReport } from "@/lib/ai/truthfulness";
import { computeStructuredDiff, type StructuredDiff } from "@/lib/tailor/diff";

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

const RunTailoringInput = z
  .object({
    jobDescription: z.string().max(20000).optional(),
    templateId: TemplateId.optional(),
    company: z.string().max(200).optional(),
    title: z.string().max(200).optional(),
    instructions: z.string().max(4000).optional(),
  })
  .refine(
    (v) => (v.jobDescription?.trim().length ?? 0) >= 30 || !!v.instructions?.trim(),
    { message: "Provide a job description (≥30 chars) or instructions to the AI." },
  );

const ReRenderInput = z.object({
  cvDocumentId: z.string().uuid(),
  /** Edited CvData from the inline editor. */
  cvData: CvData,
  templateId: TemplateId.optional(),
});

// Provider resolution (BYOK) lives in a shared server helper so the onboarding
// extraction path and this tailoring path stay in lockstep. See
// lib/providers/resolve-provider.ts.

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run tailoring for the authenticated user. ≤1 LLM call; cached re-runs cost 0.
 */
export async function runTailoring(
  raw: z.input<typeof RunTailoringInput>,
): Promise<TailorToJobResult> {
  const userId = await requireSession();
  const input = RunTailoringInput.parse(raw);
  const { provider, apiKey, authMode, freeTokenCap } = await resolveProvider(userId, {
    purpose: "tailor",
    allowManaged: true,
  });

  return tailorToJob({
    userId,
    jobDescription: input.jobDescription ?? "",
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.company ? { company: input.company } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.instructions ? { instructions: input.instructions } : {}),
    provider,
    ...(apiKey ? { apiKey } : {}),
    billingMode: authMode,
    ...(freeTokenCap ? { freeTokenCap } : {}),
  });
}

export interface TailoredVersionView {
  id: string;
  kind: string;
  version: number;
  templateId: TemplateId;
  themeId: string;
  label: string | null;
  createdAt: string;
  cvData: CvData;
  rationale: unknown[];
  warnings: string[];
  diff: unknown;
  truthfulness: unknown;
  artifact: { id: string; byteSize: number; pageCount: number } | null;
}

/** Fetch a single tailored document (+ its artifact, if rendered). */
export async function getTailoredVersion(
  cvDocumentId: string,
): Promise<TailoredVersionView | null> {
  z.string().uuid().parse(cvDocumentId);
  const userId = await requireSession();
  return withUser(userId, async (tx) => {
    const [doc] = await tx
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, cvDocumentId)))
      .limit(1);
    if (!doc) return null;
    const [artifact] = await tx
      .select()
      .from(artifacts)
      .where(eq(artifacts.cvDocumentId, doc.id))
      .limit(1);
    return {
      id: doc.id,
      kind: doc.kind,
      version: doc.version,
      templateId: doc.templateId as TemplateId,
      themeId: doc.themeId,
      label: doc.label,
      createdAt: doc.createdAt.toISOString(),
      cvData: doc.cvData as CvData,
      rationale: (doc.rationale as unknown[]) ?? [],
      warnings: (doc.warnings as string[]) ?? [],
      diff: doc.diff,
      truthfulness: doc.truthfulness,
      artifact: artifact
        ? { id: artifact.id, byteSize: artifact.byteSize, pageCount: artifact.pageCount }
        : null,
    };
  });
}

/** List the user's tailored documents, newest first. */
export async function listTailoredVersions(): Promise<
  Array<{
    id: string;
    version: number;
    templateId: TemplateId;
    label: string | null;
    createdAt: string;
    hasArtifact: boolean;
  }>
> {
  const userId = await requireSession();
  return withUser(userId, async (tx) => {
    const docs = await tx
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "tailored")))
      .orderBy(desc(cvDocuments.createdAt));
    const result: Array<{
      id: string;
      version: number;
      templateId: TemplateId;
      label: string | null;
      createdAt: string;
      hasArtifact: boolean;
    }> = [];
    for (const d of docs) {
      const [a] = await tx
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.cvDocumentId, d.id))
        .limit(1);
      result.push({
        id: d.id,
        version: d.version,
        templateId: d.templateId as TemplateId,
        label: d.label,
        createdAt: d.createdAt.toISOString(),
        hasArtifact: !!a,
      });
    }
    return result;
  });
}

export interface VersionHistoryItem {
  id: string;
  parentId: string | null;
  version: number;
  templateId: TemplateId;
  label: string | null;
  jdTitle: string | null;
  jdCompany: string | null;
  createdAt: string;
  hasArtifact: boolean;
}

/**
 * Version history for the Documents page: every tailored document with its JD
 * title/company + parent link (for compare/restore lineage), newest first.
 */
export async function listVersionHistory(): Promise<VersionHistoryItem[]> {
  const userId = await requireSession();
  return withUser(userId, async (tx) => {
    const docs = await tx
      .select({
        id: cvDocuments.id,
        parentId: cvDocuments.parentId,
        version: cvDocuments.version,
        templateId: cvDocuments.templateId,
        label: cvDocuments.label,
        createdAt: cvDocuments.createdAt,
        jobDescriptionId: cvDocuments.jobDescriptionId,
      })
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "tailored")))
      .orderBy(desc(cvDocuments.createdAt));

    const out: VersionHistoryItem[] = [];
    for (const d of docs) {
      const [a] = await tx
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.cvDocumentId, d.id))
        .limit(1);
      let jdTitle: string | null = null;
      let jdCompany: string | null = null;
      if (d.jobDescriptionId) {
        const [jd] = await tx
          .select({ title: jobDescriptions.title, company: jobDescriptions.company })
          .from(jobDescriptions)
          .where(eq(jobDescriptions.id, d.jobDescriptionId))
          .limit(1);
        jdTitle = jd?.title ?? null;
        jdCompany = jd?.company ?? null;
      }
      out.push({
        id: d.id,
        parentId: d.parentId,
        version: d.version,
        templateId: d.templateId as TemplateId,
        label: d.label,
        jdTitle,
        jdCompany,
        createdAt: d.createdAt.toISOString(),
        hasArtifact: !!a,
      });
    }
    return out;
  });
}

export interface ReRenderResult {
  fits: boolean;
  cvDocumentId: string;
  needsReduction?: { reason: string; suggestion: string };
  artifact?: { id: string; byteSize: number; pageCount: number };
}

/**
 * Re-render a document after inline edits. DETERMINISTIC — never calls the LLM.
 * Persists the edited CvData onto the document, re-runs render+fit+PDF, and
 * replaces the artifact. Re-runs the truthfulness gate on the edited content so
 * a user edit that introduces a fabrication is still flagged.
 */
export async function reRenderDocument(
  raw: z.input<typeof ReRenderInput>,
): Promise<ReRenderResult> {
  const userId = await requireSession();
  const input = ReRenderInput.parse(raw);

  // Render outside the txn (Playwright is slow; keep the txn short).
  const doc = await withUser(userId, async (tx) => {
    const [d] = await tx
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, input.cvDocumentId)))
      .limit(1);
    return d;
  });
  if (!doc) throw new Error("Document not found");

  const templateId = (input.templateId ?? (doc.templateId as TemplateId));
  const pdf = await renderCvToPdf(input.cvData, templateId);

  if (!pdf.fits) {
    // Persist the edited data + cache-bust (it is no longer the cached output).
    await withUser(userId, async (tx) => {
      await tx
        .update(cvDocuments)
        .set({
          cvData: input.cvData as unknown as Record<string, unknown>,
          templateId,
          tailorCacheKey: null,
        })
        .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, input.cvDocumentId)));
    });
    return {
      fits: false,
      cvDocumentId: input.cvDocumentId,
      needsReduction: { reason: pdf.reason, suggestion: pdf.suggestion },
    };
  }

  const storage = getStorage();
  const storagePath = `artifacts/${userId}/${randomUUID()}.pdf`;
  await storage.put({ key: storagePath, data: pdf.pdf, mimeType: "application/pdf" });
  const qa = await runQaChecks({
    pdf: pdf.pdf,
    html: pdf.html,
    templateId,
    expectedText: input.cvData.header.name,
    contentHeightPx: pdf.contentHeightPx,
    pageHeightPx: pdf.theme.page.heightPx,
    safeBottomPx: pdf.theme.page.safeBottomPx,
  });

  const artifactId = await withUser(userId, async (tx) => {
    await tx
      .update(cvDocuments)
      .set({
        cvData: input.cvData as unknown as Record<string, unknown>,
        templateId,
        tailorCacheKey: null, // edited content is no longer the cached LLM output
      })
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, input.cvDocumentId)));

    // Replace any prior artifact for this document.
    await tx.delete(artifacts).where(eq(artifacts.cvDocumentId, input.cvDocumentId));
    const [a] = await tx
      .insert(artifacts)
      .values({
        userId,
        cvDocumentId: input.cvDocumentId,
        storagePath,
        byteSize: pdf.pdf.byteLength,
        sha256: createHash("sha256").update(pdf.pdf).digest("hex"),
        pageCount: 1,
        qa: qa as unknown as Record<string, unknown>,
      })
      .returning({ id: artifacts.id });
    return a!.id;
  });

  return {
    fits: true,
    cvDocumentId: input.cvDocumentId,
    artifact: { id: artifactId, byteSize: pdf.pdf.byteLength, pageCount: 1 },
  };
}

export interface WorkspaceBaseline {
  /** Whether the user has a knowledge base yet (false → must onboard first). */
  hasKnowledgeBase: boolean;
  /** The baseline (untailored) CvData, rendered as the always-on preview. */
  baseline: CvData | null;
  /** Default template (the user's KB-seeded default). */
  templateId: TemplateId;
}

/**
 * Load the workspace's "new tailor" entry state: the user's baseline CvData so
 * the preview is never blank, plus the default template. DETERMINISTIC, 0 LLM.
 */
export async function getWorkspaceBaseline(): Promise<WorkspaceBaseline> {
  const userId = await requireSession();
  return withUser(userId, async (tx) => {
    let kb;
    try {
      kb = await loadKnowledgeBase(tx, userId);
    } catch {
      return { hasKnowledgeBase: false, baseline: null, templateId: "sidebar" as TemplateId };
    }
    const baseline =
      (await loadBaselineCvData(tx, userId, kb.knowledgeBaseId)) ??
      projectBaselineCvData(kb.knowledgeBase);
    return {
      hasKnowledgeBase: true,
      baseline,
      templateId: "sidebar" as TemplateId,
    };
  });
}

export interface OriginalResumeInfo {
  url: string;
  filename: string;
  mimeType: string;
  uploadedAt: string;
}

/**
 * Return a short-lived signed URL to the user's most recent ORIGINAL uploaded
 * resume file (the raw PDF/DOCX), distinct from the extracted baseline CvData.
 * Returns null when the profile was built from pasted text (no file). RLS-scoped.
 */
export async function getOriginalResume(): Promise<OriginalResumeInfo | null> {
  const userId = await requireSession();
  const upload = await withUser(userId, async (tx) => {
    const [u] = await tx
      .select()
      .from(resumeUploads)
      .where(eq(resumeUploads.userId, userId))
      .orderBy(desc(resumeUploads.createdAt))
      .limit(1);
    return u;
  });
  if (!upload) return null;
  const { url } = await getStorage().getSignedUrl(upload.storagePath, 600);
  return {
    url,
    filename: upload.filename,
    mimeType: upload.mimeType,
    uploadedAt: upload.createdAt.toISOString(),
  };
}

const SetPhotoInput = z.object({
  /** Small image data URL (client-resized). Capped to keep cv_data lean. */
  dataUrl: z.string().min(1).max(3_000_000),
});

/**
 * Set the user's profile photo on their baseline CvData (the source of truth).
 * Every future tailored CV inherits it via the baseline carry-forward in
 * tailorCv, so the photo persists across tailoring + PDF export. RLS-scoped.
 */
export async function setProfilePhoto(
  raw: z.input<typeof SetPhotoInput>,
): Promise<{ ok: true }> {
  const userId = await requireSession();
  const { dataUrl } = SetPhotoInput.parse(raw);
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
    throw new Error("Photo must be a PNG, JPEG, or WebP image.");
  }
  await withUser(userId, async (tx) => {
    const [baseline] = await tx
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "baseline")))
      .orderBy(desc(cvDocuments.version))
      .limit(1);
    if (!baseline) {
      throw new Error("No baseline CV yet — upload a resume first.");
    }
    const data = CvData.parse(baseline.cvData);
    data.photoUrl = dataUrl;
    await tx
      .update(cvDocuments)
      .set({ cvData: data as unknown as Record<string, unknown> })
      .where(eq(cvDocuments.id, baseline.id));
  });
  return { ok: true };
}

/**
 * Deterministic template recommendation for a pasted JD (heuristic, 0 LLM).
 * Drives the "Detected role / recommended template" chips before generation.
 */
export async function recommendTemplateForJd(
  jobDescription: string,
): Promise<{ templateId: TemplateId; reason: string; signals: { clean: number; sidebar: number } }> {
  await requireSession();
  const rec = recommendTemplate(jobDescription ?? "");
  return { templateId: rec.templateId, reason: rec.reason, signals: rec.signals };
}

/**
 * Re-verify a tailored document's CvData against the user's knowledge base.
 * PURE deterministic guardrail — surfaces fabrication flags before download,
 * including ones introduced by inline edits (since reRenderDocument persists
 * edited content). Returns a fresh TruthfulnessReport.
 */
export async function verifyVersionTruthfulness(
  cvDocumentId: string,
  cvData: z.input<typeof CvData>,
): Promise<TruthfulnessReport> {
  z.string().uuid().parse(cvDocumentId);
  const userId = await requireSession();
  const parsed = CvData.parse(cvData);
  return withUser(userId, async (tx) => {
    const kb = await loadKnowledgeBase(tx, userId);
    return verifyTruthfulness(parsed, kb.knowledgeBase);
  });
}

/**
 * Recompute the structured baseline→edited diff for a version after inline
 * edits, so the Changes panel stays accurate. PURE, 0 LLM.
 */
export async function recomputeDiff(
  cvDocumentId: string,
  editedCvData: z.input<typeof CvData>,
): Promise<StructuredDiff> {
  z.string().uuid().parse(cvDocumentId);
  const userId = await requireSession();
  const edited = CvData.parse(editedCvData);
  return withUser(userId, async (tx) => {
    const kb = await loadKnowledgeBase(tx, userId);
    const baseline =
      (await loadBaselineCvData(tx, userId, kb.knowledgeBaseId)) ??
      projectBaselineCvData(kb.knowledgeBase);
    return computeStructuredDiff(baseline, edited);
  });
}

/** Rename a tailored document's label. RLS-scoped. */
export async function renameVersion(
  cvDocumentId: string,
  label: string,
): Promise<{ ok: boolean }> {
  z.string().uuid().parse(cvDocumentId);
  const clean = z.string().min(1).max(200).parse(label.trim());
  const userId = await requireSession();
  await withUser(userId, (tx) =>
    tx
      .update(cvDocuments)
      .set({ label: clean })
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, cvDocumentId))),
  );
  return { ok: true };
}

/** Delete a tailored document (and its artifact via cascade). RLS-scoped. */
export async function deleteVersion(cvDocumentId: string): Promise<{ ok: boolean }> {
  z.string().uuid().parse(cvDocumentId);
  const userId = await requireSession();
  await withUser(userId, (tx) =>
    tx
      .delete(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, cvDocumentId))),
  );
  return { ok: true };
}

/**
 * Restore an older version as a NEW version (non-destructive). Copies the
 * document's CvData + template into a fresh tailored row and renders it.
 */
export async function restoreVersion(
  cvDocumentId: string,
): Promise<{ ok: boolean; newId: string }> {
  z.string().uuid().parse(cvDocumentId);
  const userId = await requireSession();

  const src = await withUser(userId, async (tx) => {
    const [d] = await tx
      .select()
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.id, cvDocumentId)))
      .limit(1);
    return d;
  });
  if (!src) throw new Error("Version not found");

  const cvData = CvData.parse(src.cvData);
  const templateId = src.templateId as TemplateId;

  // Compute next version number.
  const nextVersion = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({ version: cvDocuments.version })
      .from(cvDocuments)
      .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "tailored")));
    return rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
  });

  const newId = await withUser(userId, async (tx) => {
    const [doc] = await tx
      .insert(cvDocuments)
      .values({
        userId,
        kind: "tailored",
        parentId: src.id,
        version: nextVersion,
        templateId,
        themeId: src.themeId,
        knowledgeBaseId: src.knowledgeBaseId,
        kbVersion: src.kbVersion,
        jobDescriptionId: src.jobDescriptionId,
        cvData: src.cvData as Record<string, unknown>,
        rationale: src.rationale as unknown[],
        warnings: src.warnings as unknown[],
        diff: src.diff as Record<string, unknown>,
        truthfulness: src.truthfulness as Record<string, unknown>,
        tailorCacheKey: null,
        label: `${src.label ?? "Tailored"} (restored v${src.version})`,
      })
      .returning({ id: cvDocuments.id });
    return doc!.id;
  });

  // Render a fresh artifact for the restored version (best-effort).
  try {
    await reRenderDocument({ cvDocumentId: newId, cvData, templateId });
  } catch {
    // Render failure is non-fatal — the version still exists and can be re-rendered.
  }

  return { ok: true, newId };
}

/**
 * Mint a short-lived signed URL to download a stored PDF artifact. Ownership is
 * enforced by the RLS-scoped lookup (a user can only resolve their own artifact)
 * AND by the userId-prefixed storage key.
 */
export async function getDownloadUrl(
  artifactId: string,
): Promise<{ url: string; expiresAt: number }> {
  z.string().uuid().parse(artifactId);
  const userId = await requireSession();
  const artifact = await withUser(userId, async (tx) => {
    const [a] = await tx
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.userId, userId), eq(artifacts.id, artifactId)))
      .limit(1);
    return a;
  });
  if (!artifact) throw new Error("Artifact not found");
  return getStorage().getSignedUrl(artifact.storagePath, 300);
}
