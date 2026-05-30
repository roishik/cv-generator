/**
 * Load a user's active knowledge base + baseline CvData from the DB.
 *
 * RLS-scoped: every query runs inside a `withUser(userId, …)` transaction handle
 * passed in by the caller, so a user can only ever read their own rows. This
 * module bridges the DB layer to the pure schemas, so it lives in lib/tailor
 * (an outer orchestrator), NOT in lib/schemas or lib/ai (which may not import db).
 */

import { and, asc, desc, eq } from "drizzle-orm";
import type { RlsDb } from "@/lib/db/rls";
import {
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
  cvDocuments,
} from "@/lib/db/schema";
import { KnowledgeBase, type KbAngle } from "@/lib/schemas/knowledge-base";
import { CvData } from "@/lib/schemas/cv-data";
import { sanitizeSkills } from "@/lib/ai/sanitize-skills";

export interface LoadedKnowledgeBase {
  knowledgeBaseId: string;
  version: number;
  knowledgeBase: KnowledgeBase;
}

/**
 * Load the user's latest knowledge-base version and reconstruct the canonical
 * KnowledgeBase object from its normalized rows.
 *
 * @throws if the user has no knowledge base.
 */
export async function loadKnowledgeBase(
  tx: RlsDb,
  userId: string,
): Promise<LoadedKnowledgeBase> {
  const [kb] = await tx
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.userId, userId))
    .orderBy(desc(knowledgeBases.version))
    .limit(1);

  if (!kb) {
    throw new Error(`tailor: user ${userId} has no knowledge base; run extraction first`);
  }

  const [exps, edus, skillRows] = await Promise.all([
    tx
      .select()
      .from(kbExperiences)
      .where(eq(kbExperiences.knowledgeBaseId, kb.id))
      .orderBy(asc(kbExperiences.ord)),
    tx
      .select()
      .from(kbEducation)
      .where(eq(kbEducation.knowledgeBaseId, kb.id))
      .orderBy(asc(kbEducation.ord)),
    tx
      .select()
      .from(kbSkills)
      .where(eq(kbSkills.knowledgeBaseId, kb.id))
      .orderBy(asc(kbSkills.ord)),
  ]);

  // Sanitize defensively so already-stored KBs (extracted before the guard
  // existed) don't render header-like junk such as a stray "Soft Skills" item.
  const { professional, soft } = sanitizeSkills({
    professional: skillRows
      .filter((s) => s.category === "professional")
      .map((s) => s.value),
    soft: skillRows.filter((s) => s.category === "soft").map((s) => s.value),
  });

  const header = (kb.header ?? {}) as Record<string, unknown>;
  const contact = (kb.contact ?? {}) as Record<string, unknown>;

  const knowledgeBase = KnowledgeBase.parse({
    narrative: kb.narrative ?? "",
    header: {
      name: (header["name"] as string) ?? "Candidate",
      title: (header["title"] as string) ?? "",
      ...(header["website"] ? { website: header["website"] } : {}),
      summaryLong: (header["summaryLong"] as string) ?? "",
    },
    contact,
    experiences: exps.map((e) => ({
      id: e.id,
      company: e.company,
      role: e.role,
      ...(e.period ? { period: e.period } : {}),
      ...(e.location ? { location: e.location } : {}),
      bulletsFull: (e.bulletsFull as string[]) ?? [],
      angles: ((e.angles as KbAngle[]) ?? []).map((a) => ({
        label: a.label,
        jdSignals: a.jdSignals ?? [],
        bulletIdxs: a.bulletIdxs ?? [],
      })),
      tags: (e.tags as string[]) ?? [],
    })),
    education: edus.map((ed) => ({
      id: ed.id,
      institution: ed.institution,
      ...(ed.degree ? { degree: ed.degree } : {}),
      ...(ed.period ? { period: ed.period } : {}),
      ...(ed.note ? { note: ed.note } : {}),
    })),
    leadership:
      (kb.leadership as
        | { id: string; name: string; description: string; url?: string; tags?: string[] }[]
        | null) ?? [],
    skills: { professional, soft },
    languages: (kb.languages as { name: string; level: string }[]) ?? [],
  });

  return { knowledgeBaseId: kb.id, version: kb.version, knowledgeBase };
}

/**
 * Load the user's baseline CvData (the immutable, pre-tailoring projection of
 * the KB). Returns undefined if no baseline document exists — the pipeline then
 * derives one deterministically from the KB.
 */
export async function loadBaselineCvData(
  tx: RlsDb,
  userId: string,
  knowledgeBaseId?: string,
): Promise<CvData | undefined> {
  const where = knowledgeBaseId
    ? and(
        eq(cvDocuments.userId, userId),
        eq(cvDocuments.kind, "baseline"),
        eq(cvDocuments.knowledgeBaseId, knowledgeBaseId),
      )
    : and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "baseline"));

  const [doc] = await tx
    .select()
    .from(cvDocuments)
    .where(where)
    .orderBy(desc(cvDocuments.version))
    .limit(1);

  if (!doc) return undefined;
  const parsed = CvData.safeParse(doc.cvData);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Deterministically project a KnowledgeBase into a baseline CvData (no LLM).
 * Used when no baseline document exists yet — selects all experiences and their
 * full bullets so the diff against the tailored output is meaningful.
 */
export function projectBaselineCvData(kb: KnowledgeBase): CvData {
  const summary = kb.header.summaryLong || kb.narrative || "";
  return CvData.parse({
    schemaVersion: 1 as const,
    header: {
      name: kb.header.name,
      title: kb.header.title || (kb.experiences[0]?.role ?? "Professional"),
      ...(kb.header.website ? { website: kb.header.website } : {}),
      summary,
    },
    contact: kb.contact,
    summary,
    skills: { professional: kb.skills.professional, soft: kb.skills.soft },
    experience: kb.experiences.map((e) => ({
      kbExperienceId: e.id,
      company: e.company,
      role: e.role,
      ...(e.period ? { period: e.period } : {}),
      ...(e.location ? { location: e.location } : {}),
      bullets: e.bulletsFull.length ? e.bulletsFull : [`Worked at ${e.company} as ${e.role}.`],
    })),
    education: kb.education.map((ed) => ({
      kbEducationId: ed.id,
      institution: ed.institution,
      ...(ed.degree ? { degree: ed.degree } : {}),
      ...(ed.period ? { period: ed.period } : {}),
      ...(ed.note ? { note: ed.note } : {}),
    })),
    leadership: kb.leadership.map((l) => ({
      kbLeadershipId: l.id,
      name: l.name,
      description: l.description,
      ...(l.url ? { url: l.url } : {}),
    })),
    languages: kb.languages.map((l) => ({ name: l.name, level: l.level })),
  });
}
