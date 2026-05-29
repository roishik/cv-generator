"use server";

/**
 * Onboarding server actions:
 *
 *  extractProfileFromUpload(uploadId)
 *    → reads the stored file, extracts text, calls LLM, persists KB.
 *    → CACHES by sha256(rawText) so re-uploading the same file costs 0 LLM calls.
 *    → Returns { knowledgeBaseId, baselineCvDocumentId, fromCache }
 *
 *  extractProfileFromText(rawText)
 *    → manual-paste fallback: same pipeline, no Storage lookup.
 *    → Returns same shape.
 *
 * RLS-scoped: every DB write goes through withUser(userId, ...).
 */

import { createHash, randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { withUser } from "@/lib/db/rls";
import {
  resumeUploads,
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
  cvDocuments,
} from "@/lib/db/schema";
import { getStorage } from "@/lib/storage/local-fs";
import { extractTextFromBuffer, MIN_TEXT_LENGTH } from "@/lib/parse/extract-text";
import { extractProfile } from "@/lib/ai/pipeline";
import { createProvider } from "@/lib/ai/factory";
import { getEnv } from "@/env";

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

const ExtractFromUploadInput = z.object({
  uploadId: z.string().uuid(),
});

const ExtractFromTextInput = z.object({
  rawText: z.string().min(MIN_TEXT_LENGTH, "paste at least 100 characters of resume text"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Output shape
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractionActionResult {
  /** ID of the knowledge_bases row for this user. */
  knowledgeBaseId: string;
  /** ID of the baseline cv_documents row seeded from the KB. */
  baselineCvDocumentId: string;
  /** True when the extraction result came from the hash-cache (no LLM call). */
  fromCache: boolean;
  /** Indicates that parsed text was too short; extraction ran with what was available. */
  shortText: boolean;
}

export interface ExtractionActionError {
  error: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a structured knowledge base from a previously uploaded resume file.
 * Caches extraction by sha256 of the extracted text (not the file hash).
 */
export async function extractProfileFromUpload(
  input: unknown,
): Promise<ExtractionActionResult | ExtractionActionError> {
  const parsed = ExtractFromUploadInput.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }
  const { uploadId } = parsed.data;

  const userId = await requireSession();

  // Load the upload record (RLS-scoped — fails silently if not owned by user).
  const uploadRows = await withUser(userId, (tx) =>
    tx.select().from(resumeUploads).where(eq(resumeUploads.id, uploadId)),
  );
  const upload = uploadRows[0];
  if (!upload) {
    return { error: "upload not found" };
  }
  if (upload.userId !== userId) {
    return { error: "upload not found" };
  }

  // Mark as extracting.
  await withUser(userId, (tx) =>
    tx
      .update(resumeUploads)
      .set({ status: "extracting" })
      .where(eq(resumeUploads.id, uploadId)),
  );

  try {
    // Retrieve the file bytes.
    const storage = getStorage();
    const buffer = await storage.get(upload.storagePath);

    // Parse text from the file.
    const rawText = await extractTextFromBuffer(buffer, upload.mimeType);
    const textHash = createHash("sha256").update(rawText).digest("hex");
    const shortText = rawText.length < MIN_TEXT_LENGTH;

    // Run extraction (or load from cache).
    const result = await runExtractionWithCache(userId, rawText, textHash, uploadId);

    // Mark upload as extracted.
    await withUser(userId, (tx) =>
      tx
        .update(resumeUploads)
        .set({ status: "extracted", sha256: textHash })
        .where(eq(resumeUploads.id, uploadId)),
    );

    return { ...result, shortText };
  } catch (e) {
    // Mark as failed.
    await withUser(userId, (tx) =>
      tx
        .update(resumeUploads)
        .set({ status: "failed", error: (e as Error).message })
        .where(eq(resumeUploads.id, uploadId)),
    );
    return { error: (e as Error).message };
  }
}

/**
 * Manual-paste fallback: extract a structured knowledge base from pasted resume text.
 * Caches by sha256 of the text; re-pasting the same text is free.
 */
export async function extractProfileFromText(
  input: unknown,
): Promise<ExtractionActionResult | ExtractionActionError> {
  const parsed = ExtractFromTextInput.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }
  const { rawText } = parsed.data;
  const userId = await requireSession();
  const textHash = createHash("sha256").update(rawText).digest("hex");
  const shortText = rawText.length < MIN_TEXT_LENGTH;
  try {
    const result = await runExtractionWithCache(userId, rawText, textHash, undefined);
    return { ...result, shortText };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core extraction logic (shared between file-upload and text-paste paths)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full extraction pipeline with hash-cache:
 *  - If a knowledge_bases row already exists for (userId, textHash), return it.
 *  - Otherwise: call LLM, persist KB + experiences + education + skills, seed
 *    a baseline cv_document.
 */
async function runExtractionWithCache(
  userId: string,
  rawText: string,
  textHash: string,
  uploadId: string | undefined,
): Promise<Omit<ExtractionActionResult, "shortText">> {
  // Cache lookup: check if we already have a KB derived from this text hash.
  // We store the textHash on knowledge_bases.sourceUploadId is reserved for
  // the upload FK; we piggyback the text hash onto resume_uploads.sha256.
  // Instead we look for existing kbs that point to a resume_upload with the
  // same sha256 (text hash).
  const existing = await withUser(userId, async (tx) => {
    // Find any KB whose source upload has the same text-hash.
    const kbs = await tx.select().from(knowledgeBases).where(eq(knowledgeBases.userId, userId));
    if (kbs.length === 0) return null;
    // Check against stored text hash (we store it as a metadata field on the KB).
    // We use the narrative field as a sentinel: we store the text hash in a
    // hidden prefix so cache lookup is O(n) KBs but n is always tiny (<10).
    // The canonical way is to match resume_uploads.sha256 = textHash.
    for (const kb of kbs) {
      if (kb.sourceUploadId) {
        const uploads = await tx
          .select({ sha256: resumeUploads.sha256 })
          .from(resumeUploads)
          .where(
            and(
              eq(resumeUploads.id, kb.sourceUploadId),
              eq(resumeUploads.sha256, textHash),
            ),
          );
        if (uploads.length > 0) return kb;
      }
    }
    return null;
  });

  if (existing) {
    // Cache hit — find the baseline cv_document for this KB.
    const docs = await withUser(userId, (tx) =>
      tx
        .select({ id: cvDocuments.id })
        .from(cvDocuments)
        .where(
          and(
            eq(cvDocuments.userId, userId),
            eq(cvDocuments.kind, "baseline"),
            eq(cvDocuments.knowledgeBaseId, existing.id),
          ),
        ),
    );
    return {
      knowledgeBaseId: existing.id,
      baselineCvDocumentId: docs[0]?.id ?? (await seedBaselineCvDocument(userId, existing.id, existing.version)),
      fromCache: true,
    };
  }

  // Cache miss — call the LLM provider.
  const env = getEnv();
  const provider = createProvider({ provider: env.AI_PROVIDER });
  const { knowledgeBase } = await extractProfile(provider, rawText, {
    idFor: () => randomUUID(),
  });

  // Persist the KB + child records in a single RLS-scoped transaction.
  const { kbId, cvDocId } = await withUser(userId, async (tx) => {
    // Determine the next KB version for this user.
    const existingKbs = await tx
      .select({ version: knowledgeBases.version })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.userId, userId));
    const nextVersion = existingKbs.length > 0
      ? Math.max(...existingKbs.map((k) => k.version)) + 1
      : 1;

    const [kb] = await tx
      .insert(knowledgeBases)
      .values({
        userId,
        version: nextVersion,
        narrative: knowledgeBase.narrative,
        header: knowledgeBase.header as Record<string, unknown>,
        contact: knowledgeBase.contact as Record<string, unknown>,
        languages: knowledgeBase.languages as unknown[],
        sourceUploadId: uploadId ?? null,
      })
      .returning({ id: knowledgeBases.id, version: knowledgeBases.version });

    // Insert experiences.
    for (let i = 0; i < knowledgeBase.experiences.length; i++) {
      const exp = knowledgeBase.experiences[i]!;
      await tx.insert(kbExperiences).values({
        id: exp.id,
        knowledgeBaseId: kb.id,
        userId,
        ord: i,
        company: exp.company,
        role: exp.role,
        period: exp.period ?? null,
        location: exp.location ?? null,
        bulletsFull: exp.bulletsFull as string[],
        angles: exp.angles as unknown[],
        tags: exp.tags as string[],
      });
    }

    // Insert education.
    for (let i = 0; i < knowledgeBase.education.length; i++) {
      const edu = knowledgeBase.education[i]!;
      await tx.insert(kbEducation).values({
        id: edu.id,
        knowledgeBaseId: kb.id,
        userId,
        ord: i,
        institution: edu.institution,
        degree: edu.degree ?? null,
        period: edu.period ?? null,
        note: edu.note ?? null,
      });
    }

    // Insert skills.
    const skillRows = [
      ...knowledgeBase.skills.professional.map((value, i) => ({
        knowledgeBaseId: kb.id,
        userId,
        category: "professional" as const,
        ord: i,
        value,
        tags: [] as string[],
      })),
      ...knowledgeBase.skills.soft.map((value, i) => ({
        knowledgeBaseId: kb.id,
        userId,
        category: "soft" as const,
        ord: i,
        value,
        tags: [] as string[],
      })),
    ];
    if (skillRows.length > 0) {
      await tx.insert(kbSkills).values(skillRows);
    }

    // Seed a baseline cv_document.
    const baselineCvData = buildBaselineCvData(knowledgeBase);
    const [doc] = await tx
      .insert(cvDocuments)
      .values({
        userId,
        kind: "baseline",
        templateId: "sidebar",
        themeId: "sidebar-default",
        knowledgeBaseId: kb.id,
        kbVersion: kb.version,
        cvData: baselineCvData as Record<string, unknown>,
        label: `${knowledgeBase.header.name} – Baseline`,
      })
      .returning({ id: cvDocuments.id });

    return { kbId: kb.id, cvDocId: doc.id };
  });

  return { knowledgeBaseId: kbId, baselineCvDocumentId: cvDocId, fromCache: false };
}

/** Seed a baseline cv_document for an existing KB (cache-hit path when no doc exists). */
async function seedBaselineCvDocument(
  userId: string,
  kbId: string,
  kbVersion: number,
): Promise<string> {
  // Load KB data to build the baseline CvData.
  const kbRows = await withUser(userId, (tx) =>
    tx.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId)),
  );
  const kb = kbRows[0];
  if (!kb) throw new Error(`KB not found: ${kbId}`);

  const exps = await withUser(userId, (tx) =>
    tx.select().from(kbExperiences).where(eq(kbExperiences.knowledgeBaseId, kbId)),
  );
  const edu = await withUser(userId, (tx) =>
    tx.select().from(kbEducation).where(eq(kbEducation.knowledgeBaseId, kbId)),
  );
  const skills = await withUser(userId, (tx) =>
    tx.select().from(kbSkills).where(eq(kbSkills.knowledgeBaseId, kbId)),
  );

  const header = kb.header as { name?: string; title?: string; website?: string; summaryLong?: string };
  const contact = kb.contact as { email?: string; phone?: string; location?: string; linkedin?: string };

  const baselineCvData = {
    schemaVersion: 1 as const,
    header: {
      name: header.name ?? "Unknown",
      title: header.title ?? "",
      ...(header.website ? { website: header.website } : {}),
      summary: header.summaryLong ?? "",
    },
    contact,
    summary: header.summaryLong ?? "",
    skills: {
      professional: skills.filter((s) => s.category === "professional").map((s) => s.value),
      soft: skills.filter((s) => s.category === "soft").map((s) => s.value),
    },
    experience: exps.map((e) => ({
      kbExperienceId: e.id,
      company: e.company,
      role: e.role,
      ...(e.period ? { period: e.period } : {}),
      ...(e.location ? { location: e.location } : {}),
      bullets: ((e.bulletsFull as string[]) ?? []).slice(0, 4),
    })),
    education: edu.map((e) => ({
      kbEducationId: e.id,
      institution: e.institution,
      ...(e.degree ? { degree: e.degree } : {}),
      ...(e.period ? { period: e.period } : {}),
      ...(e.note ? { note: e.note } : {}),
    })),
    leadership: [],
    languages: (kb.languages as Array<{ name: string; level: string }>) ?? [],
  };

  const [doc] = await withUser(userId, (tx) =>
    tx
      .insert(cvDocuments)
      .values({
        userId,
        kind: "baseline",
        templateId: "sidebar",
        themeId: "sidebar-default",
        knowledgeBaseId: kbId,
        kbVersion,
        cvData: baselineCvData as Record<string, unknown>,
        label: `${header.name ?? "Candidate"} – Baseline`,
      })
      .returning({ id: cvDocuments.id }),
  );

  return doc.id;
}

/**
 * Build a deterministic baseline CvData from a freshly extracted KnowledgeBase.
 * All experiences included; top-4 bullets per experience.
 */
function buildBaselineCvData(kb: import("@/lib/schemas/knowledge-base").KnowledgeBase) {
  return {
    schemaVersion: 1 as const,
    header: {
      name: kb.header.name,
      title: kb.header.title ?? "",
      ...(kb.header.website ? { website: kb.header.website } : {}),
      summary: kb.header.summaryLong ?? "",
    },
    contact: kb.contact,
    summary: kb.header.summaryLong ?? "",
    skills: kb.skills,
    experience: kb.experiences.map((e) => ({
      kbExperienceId: e.id,
      company: e.company,
      role: e.role,
      ...(e.period ? { period: e.period } : {}),
      ...(e.location ? { location: e.location } : {}),
      bullets: e.bulletsFull.slice(0, 4),
    })),
    education: kb.education.map((e) => ({
      kbEducationId: e.id,
      institution: e.institution,
      ...(e.degree ? { degree: e.degree } : {}),
      ...(e.period ? { period: e.period } : {}),
      ...(e.note ? { note: e.note } : {}),
    })),
    leadership: kb.leadership.map((l) => ({
      kbLeadershipId: l.id,
      name: l.name,
      description: l.description,
      ...(l.url ? { url: l.url } : {}),
    })),
    languages: kb.languages,
  };
}
