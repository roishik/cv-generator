/**
 * PURE mapping helpers for "Edit with AI" (LLM call #3). Kept out of the
 * "use server" actions file so they can be unit-tested without booting Next /
 * server-only modules.
 *
 *  toLlmKb       — EditableKnowledgeBase → KnowledgeBase (LLM input shape)
 *  fromExtraction — ExtractionResult (LLM output) → EditableKnowledgeBase,
 *                   preserving experience/education ids by name match so
 *                   provenance (kbExperienceId) survives a Save.
 */

import { randomUUID } from "node:crypto";
import { KnowledgeBase, type KnowledgeBaseForLLM } from "@/lib/schemas/knowledge-base";
import type { ExtractionResult } from "@/lib/schemas/llm-contracts";
import type { EditableKnowledgeBase as EditableKb } from "./schema";

/** Map the editable shape into the LLM-facing KnowledgeBase (ids synthetic for input). */
export function toLlmKb(e: EditableKb): KnowledgeBaseForLLM {
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
export function fromExtraction(result: ExtractionResult, prev: EditableKb): EditableKb {
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
