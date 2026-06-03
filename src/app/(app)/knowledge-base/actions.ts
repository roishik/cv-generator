"use server";

/**
 * Knowledge-base editor server actions (M10 part 2).
 *
 *   getKnowledgeBase()  → load the user's active KB into the editable shape
 *   saveKnowledgeBase() → persist edited structured fields + per-experience
 *                         "angles" + freeform narrative, RLS-scoped.
 *
 * The KB is the durable source of truth (a SUPERSET of any one CV) the
 * truthfulness guardrail validates tailored output against. Editing it never
 * invents facts — it records what the candidate actually did. Saves rewrite the
 * normalized child rows (experiences/education/skills) for the latest KB
 * version; experience ids are preserved so existing tailored docs keep their
 * provenance links (kbExperienceId).
 */

import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { withUser } from "@/lib/db/rls";
import {
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
} from "@/lib/db/schema";
import { KbAngle, KnowledgeBase } from "@/lib/schemas/knowledge-base";
import { createProvider } from "@/lib/ai/factory";
import { resolveProvider } from "@/lib/providers/resolve-provider";
import type { ExtractionResult } from "@/lib/schemas/llm-contracts";
import { EditableKnowledgeBase, type EditableKnowledgeBase as EditableKb } from "./schema";

export interface LoadedEditableKb {
  hasKnowledgeBase: boolean;
  knowledgeBaseId: string | null;
  data: EditableKb | null;
}

/** Load the user's latest KB into the editable shape. */
export async function getKnowledgeBase(): Promise<LoadedEditableKb> {
  const userId = await requireSession();
  return withUser(userId, async (tx) => {
    const [kb] = await tx
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.userId, userId))
      .orderBy(desc(knowledgeBases.version))
      .limit(1);
    if (!kb) return { hasKnowledgeBase: false, knowledgeBaseId: null, data: null };

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

    const header = (kb.header ?? {}) as Record<string, unknown>;
    const contact = (kb.contact ?? {}) as Record<string, unknown>;

    const data: EditableKb = {
      narrative: kb.narrative ?? "",
      header: {
        name: (header["name"] as string) ?? "",
        title: (header["title"] as string) ?? "",
        website: (header["website"] as string) ?? undefined,
        summaryLong: (header["summaryLong"] as string) ?? "",
      },
      contact: {
        email: (contact["email"] as string) ?? undefined,
        phone: (contact["phone"] as string) ?? undefined,
        location: (contact["location"] as string) ?? undefined,
        linkedin: (contact["linkedin"] as string) ?? undefined,
      },
      experiences: exps.map((e) => ({
        id: e.id,
        company: e.company,
        role: e.role,
        period: e.period ?? undefined,
        location: e.location ?? undefined,
        bulletsFull: (e.bulletsFull as string[]) ?? [],
        angles: ((e.angles as KbAngle[]) ?? []).map((a) => ({
          label: a.label,
          jdSignals: a.jdSignals ?? [],
        })),
        tags: (e.tags as string[]) ?? [],
      })),
      education: edus.map((ed) => ({
        id: ed.id,
        institution: ed.institution,
        degree: ed.degree ?? undefined,
        period: ed.period ?? undefined,
        note: ed.note ?? undefined,
      })),
      skills: {
        professional: skillRows.filter((s) => s.category === "professional").map((s) => s.value),
        soft: skillRows.filter((s) => s.category === "soft").map((s) => s.value),
      },
    };

    return { hasKnowledgeBase: true, knowledgeBaseId: kb.id, data };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit with AI (LLM call #3): natural-language edit of the profile.
// The result is RETURNED to the client to review; it is NOT saved here — the
// user applies it to the form and clicks Save (saveKnowledgeBase) to persist.
// ─────────────────────────────────────────────────────────────────────────────

const EditWithAiInput = z.object({
  current: EditableKnowledgeBase,
  instruction: z.string().min(1, "Describe the change").max(2000),
});

export interface EditWithAiResult {
  ok: boolean;
  data?: EditableKb;
  error?: string;
}

/** Map the editable shape into the LLM-facing KnowledgeBase (ids are synthetic for input). */
function toLlmKb(e: EditableKb) {
  return KnowledgeBase.parse({
    narrative: e.narrative,
    header: e.header,
    contact: e.contact,
    experiences: e.experiences.map((x) => ({
      id: x.id ?? randomUUID(),
      company: x.company,
      role: x.role,
      ...(x.period ? { period: x.period } : {}),
      ...(x.location ? { location: x.location } : {}),
      bulletsFull: x.bulletsFull,
      angles: x.angles,
      tags: x.tags,
    })),
    education: e.education.map((x) => ({
      id: x.id ?? randomUUID(),
      institution: x.institution,
      ...(x.degree ? { degree: x.degree } : {}),
      ...(x.period ? { period: x.period } : {}),
      ...(x.note ? { note: x.note } : {}),
    })),
    leadership: [],
    skills: e.skills,
    languages: [],
  });
}

const norm = (s: string) => s.trim().toLowerCase();

/** Map the LLM's ExtractionResult back to the editable shape, preserving ids by match. */
function fromExtraction(result: ExtractionResult, prev: EditableKb): EditableKb {
  const usedExp = new Set<number>();
  const usedEdu = new Set<number>();
  return {
    narrative: prev.narrative,
    header: {
      name: result.header.name,
      title: result.header.title ?? "",
      ...(result.header.website ? { website: result.header.website } : {}),
      summaryLong: result.header.summaryLong ?? prev.header.summaryLong,
    },
    contact: {
      email: result.contact.email,
      phone: result.contact.phone,
      location: result.contact.location,
      linkedin: result.contact.linkedin,
    },
    experiences: result.experiences.map((x) => {
      // Preserve an existing id when the company matches a not-yet-claimed prior row.
      const idx = prev.experiences.findIndex(
        (p, i) => !usedExp.has(i) && norm(p.company) === norm(x.company),
      );
      let id: string | undefined;
      if (idx >= 0) {
        usedExp.add(idx);
        id = prev.experiences[idx]!.id;
      }
      return {
        ...(id ? { id } : {}),
        company: x.company,
        role: x.role,
        period: x.period,
        location: x.location,
        bulletsFull: x.bulletsFull,
        angles: (x.angles ?? []).map((a) => ({ label: a.label, jdSignals: a.jdSignals })),
        tags: x.tags ?? [],
      };
    }),
    education: result.education.map((x) => {
      const idx = prev.education.findIndex(
        (p, i) => !usedEdu.has(i) && norm(p.institution) === norm(x.institution),
      );
      let id: string | undefined;
      if (idx >= 0) {
        usedEdu.add(idx);
        id = prev.education[idx]!.id;
      }
      return {
        ...(id ? { id } : {}),
        institution: x.institution,
        degree: x.degree,
        period: x.period,
        note: x.note,
      };
    }),
    skills: { professional: result.skills.professional, soft: result.skills.soft },
  };
}

/**
 * Edit the profile with a natural-language instruction (LLM call #3).
 * Returns the updated editable KB for the client to review + Save. RLS-scoped
 * only for resolving the user's BYOK key; no DB writes happen here.
 */
export async function editProfileWithAi(raw: unknown): Promise<EditWithAiResult> {
  const parsed = EditWithAiInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const userId = await requireSession();
  try {
    const { provider, apiKey } = await resolveProvider(userId);
    const adapter = createProvider({ provider, ...(apiKey ? { apiKey } : {}) });
    const result = await adapter.editProfile({
      currentKb: toLlmKb(parsed.data.current),
      instruction: parsed.data.instruction,
    });
    return { ok: true, data: fromExtraction(result, parsed.data.current) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SaveKbResult {
  ok: boolean;
  error?: string;
}

/**
 * Persist the edited KB onto the user's latest KB version (in place). Rewrites
 * the normalized experience/education/skill rows. Experience ids that the
 * client sends back are preserved so provenance links survive.
 */
export async function saveKnowledgeBase(raw: unknown): Promise<SaveKbResult> {
  const parsed = EditableKnowledgeBase.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;
  const userId = await requireSession();

  try {
    await withUser(userId, async (tx) => {
      const [kb] = await tx
        .select({ id: knowledgeBases.id })
        .from(knowledgeBases)
        .where(eq(knowledgeBases.userId, userId))
        .orderBy(desc(knowledgeBases.version))
        .limit(1);
      if (!kb) throw new Error("No knowledge base to update — upload a resume first.");

      // Update top-level KB fields.
      await tx
        .update(knowledgeBases)
        .set({
          narrative: input.narrative,
          header: input.header as Record<string, unknown>,
          contact: input.contact as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBases.id, kb.id));

      // Rewrite normalized children (experiences/education/skills).
      await tx.delete(kbExperiences).where(eq(kbExperiences.knowledgeBaseId, kb.id));
      await tx.delete(kbEducation).where(eq(kbEducation.knowledgeBaseId, kb.id));
      await tx.delete(kbSkills).where(eq(kbSkills.knowledgeBaseId, kb.id));

      for (let i = 0; i < input.experiences.length; i++) {
        const e = input.experiences[i]!;
        await tx.insert(kbExperiences).values({
          ...(e.id ? { id: e.id } : {}),
          knowledgeBaseId: kb.id,
          userId,
          ord: i,
          company: e.company,
          role: e.role,
          period: e.period ?? null,
          location: e.location ?? null,
          bulletsFull: e.bulletsFull.filter((b) => b.trim()) as string[],
          angles: e.angles.filter((a) => a.label.trim()) as unknown[],
          tags: e.tags.filter((t) => t.trim()) as string[],
        });
      }

      for (let i = 0; i < input.education.length; i++) {
        const ed = input.education[i]!;
        await tx.insert(kbEducation).values({
          ...(ed.id ? { id: ed.id } : {}),
          knowledgeBaseId: kb.id,
          userId,
          ord: i,
          institution: ed.institution,
          degree: ed.degree ?? null,
          period: ed.period ?? null,
          note: ed.note ?? null,
        });
      }

      const skillRows = [
        ...input.skills.professional
          .filter((v) => v.trim())
          .map((value, i) => ({
            knowledgeBaseId: kb.id,
            userId,
            category: "professional" as const,
            ord: i,
            value,
            tags: [] as string[],
          })),
        ...input.skills.soft
          .filter((v) => v.trim())
          .map((value, i) => ({
            knowledgeBaseId: kb.id,
            userId,
            category: "soft" as const,
            ord: i,
            value,
            tags: [] as string[],
          })),
      ];
      if (skillRows.length > 0) await tx.insert(kbSkills).values(skillRows);
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
