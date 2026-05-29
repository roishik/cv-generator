/**
 * Editable knowledge-base shapes for the profile editor (M10 part 2).
 *
 * Kept OUT of the "use server" actions module: a server-action file may only
 * export async functions, so the zod schema + type live here and are imported
 * by both the server action and the client editor.
 */

import { z } from "zod";

export const EditableAngle = z.object({
  label: z.string(),
  jdSignals: z.array(z.string()),
});

export const EditableExperience = z.object({
  /** Existing kb_experiences.id (preserved) or undefined for a new row. */
  id: z.string().uuid().optional(),
  company: z.string().min(1, "Company is required"),
  role: z.string().min(1, "Role is required"),
  period: z.string().optional(),
  location: z.string().optional(),
  bulletsFull: z.array(z.string()),
  angles: z.array(EditableAngle).default([]),
  tags: z.array(z.string()).default([]),
});

export const EditableEducation = z.object({
  id: z.string().uuid().optional(),
  institution: z.string().min(1, "Institution is required"),
  degree: z.string().optional(),
  period: z.string().optional(),
  note: z.string().optional(),
});

export const EditableKnowledgeBase = z.object({
  narrative: z.string().default(""),
  header: z.object({
    name: z.string().min(1, "Name is required"),
    title: z.string().default(""),
    website: z.string().optional(),
    summaryLong: z.string().default(""),
  }),
  contact: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
  }),
  experiences: z.array(EditableExperience),
  education: z.array(EditableEducation),
  skills: z.object({
    professional: z.array(z.string()),
    soft: z.array(z.string()),
  }),
});
export type EditableKnowledgeBase = z.infer<typeof EditableKnowledgeBase>;
