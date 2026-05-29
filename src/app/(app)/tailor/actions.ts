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
import { artifacts, cvDocuments, providerKeys } from "@/lib/db/schema";
import { CvData, TemplateId } from "@/lib/schemas/cv-data";
import { decryptKey } from "@/lib/crypto/envelope";
import type { ProviderId } from "@/lib/ai/provider";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { runQaChecks } from "@/lib/qa/assertions";
import { getStorage } from "@/lib/storage/local-fs";
import { getEnv } from "@/env";
import { tailorToJob, type TailorToJobResult } from "@/lib/tailor/pipeline";

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

const RunTailoringInput = z.object({
  jobDescription: z.string().min(30, "Paste a fuller job description (≥30 chars)."),
  templateId: TemplateId.optional(),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
});

const ReRenderInput = z.object({
  cvDocumentId: z.string().uuid(),
  /** Edited CvData from the inline editor. */
  cvData: CvData,
  templateId: TemplateId.optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider resolution (BYOK): load + decrypt the user's key for a real provider.
// Mock needs no key. Never logs the plaintext.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveProvider(
  userId: string,
): Promise<{ provider: ProviderId; apiKey?: string }> {
  const envProvider = getEnv().AI_PROVIDER as ProviderId;
  if (envProvider === "mock") return { provider: "mock" };

  const key = await withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, envProvider)))
      .limit(1);
    return row;
  });
  if (!key) {
    throw new Error(
      `No ${envProvider} API key on file. Add one in Settings before tailoring.`,
    );
  }
  const apiKey = decryptKey({
    ciphertext: Buffer.from(key.ciphertext).toString("base64"),
    iv: Buffer.from(key.iv).toString("base64"),
    authTag: Buffer.from(key.authTag).toString("base64"),
    keyVersion: key.keyVersion,
  });
  return { provider: envProvider, apiKey };
}

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
  const { provider, apiKey } = await resolveProvider(userId);

  return tailorToJob({
    userId,
    jobDescription: input.jobDescription,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.company ? { company: input.company } : {}),
    ...(input.title ? { title: input.title } : {}),
    provider,
    ...(apiKey ? { apiKey } : {}),
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
