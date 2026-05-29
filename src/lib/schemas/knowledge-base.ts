// Knowledge Base schemas (the SUPERSET of TRUE facts about a candidate) +
// the LLM-facing projection (KnowledgeBaseForLLM).
// PURE. No DB, no auth, no network. Reproduced from planning/03-architecture.md §5.3
// and planning/04-master-plan.md §4.
import { z } from "zod";

/** An "angle" the model proposes for an experience: a JD-signal-matched lens. */
export const KbAngle = z.object({
  label: z.string(),
  jdSignals: z.array(z.string()),
  bulletIdxs: z.array(z.number().int()).default([]),
});
export type KbAngle = z.infer<typeof KbAngle>;

export const KbExperience = z.object({
  id: z.string().uuid(), // kb_experiences.id — echoed back as kbExperienceId
  company: z.string(),
  role: z.string(),
  period: z.string().optional(),
  location: z.string().optional(),
  bulletsFull: z.array(z.string()), // the superset the model SELECTS from
  angles: z.array(KbAngle).default([]),
  tags: z.array(z.string()).default([]),
});
export type KbExperience = z.infer<typeof KbExperience>;

export const KbEducation = z.object({
  id: z.string().uuid(),
  institution: z.string(),
  degree: z.string().optional(),
  period: z.string().optional(),
  note: z.string().optional(),
});
export type KbEducation = z.infer<typeof KbEducation>;

export const KbLeadership = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  url: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type KbLeadership = z.infer<typeof KbLeadership>;

export const KbLanguage = z.object({
  name: z.string(),
  level: z.string(),
});
export type KbLanguage = z.infer<typeof KbLanguage>;

export const KbHeader = z.object({
  name: z.string().min(1),
  title: z.string().default(""),
  website: z.string().optional(),
  summaryLong: z.string().default(""),
});
export type KbHeader = z.infer<typeof KbHeader>;

export const KbContact = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
});
export type KbContact = z.infer<typeof KbContact>;

export const KbSkills = z.object({
  professional: z.array(z.string()).default([]),
  soft: z.array(z.string()).default([]),
});
export type KbSkills = z.infer<typeof KbSkills>;

/**
 * The full Knowledge Base persisted per user. This is the single source of
 * truth that the tailoring guardrail validates output against.
 */
export const KnowledgeBase = z.object({
  narrative: z.string().default(""),
  header: KbHeader,
  contact: KbContact.default({}),
  experiences: z.array(KbExperience).default([]),
  education: z.array(KbEducation).default([]),
  leadership: z.array(KbLeadership).default([]),
  skills: KbSkills.default({ professional: [], soft: [] }),
  languages: z.array(KbLanguage).default([]),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBase>;

/**
 * The projection passed to the tailoring LLM call. Identical-shaped to
 * KnowledgeBase here; the boundary exists so the DB layer can omit
 * fields/PII before they ever reach a provider if needed later.
 */
export const KnowledgeBaseForLLM = KnowledgeBase;
export type KnowledgeBaseForLLM = z.infer<typeof KnowledgeBaseForLLM>;
