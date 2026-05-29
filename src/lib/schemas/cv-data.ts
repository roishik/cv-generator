// Canonical render-input schemas: CvData + ThemeTokens + TemplateId.
// PURE. No DB, no auth, no network. Shared by the live preview and the server PDF path.
// Schemas reproduced 1:1 from planning/04-master-plan.md §2–§3.
import { z } from "zod";

export const TemplateId = z.enum(["sidebar", "clean"]);
export type TemplateId = z.infer<typeof TemplateId>;

export const CvContact = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
});
export type CvContact = z.infer<typeof CvContact>;

export const CvHeader = z.object({
  name: z.string().min(1),
  title: z.string(), // role / positioning line (tailored)
  website: z.string().optional(),
  summary: z.string(), // mirrors top-level `summary` for render convenience
});
export type CvHeader = z.infer<typeof CvHeader>;

export const CvExperience = z.object({
  kbExperienceId: z.string().uuid(), // PROVENANCE → enforces truthfulness
  company: z.string(),
  role: z.string(), // "title" in the original
  period: z.string().optional(),
  location: z.string().optional(),
  bullets: z.array(z.string()).min(1), // SELECTED & REPHRASED subset of KB bullets_full
});
export type CvExperience = z.infer<typeof CvExperience>;

export const CvEducation = z.object({
  kbEducationId: z.string().uuid().optional(),
  institution: z.string(),
  degree: z.string().optional(),
  period: z.string().optional(),
  note: z.string().optional(),
});
export type CvEducation = z.infer<typeof CvEducation>;

export const CvSkills = z.object({
  professional: z.array(z.string()),
  soft: z.array(z.string()),
});
export type CvSkills = z.infer<typeof CvSkills>;

export const CvLanguage = z.object({
  name: z.string(),
  level: z.string(), // e.g. "Native", "Fluent", "Professional"
});
export type CvLanguage = z.infer<typeof CvLanguage>;

// Sidebar "Leadership & Impact" (Type 1 only).
export const CvLeadership = z.object({
  kbLeadershipId: z.string().uuid().optional(),
  name: z.string(),
  description: z.string(),
  url: z.string().optional(),
});
export type CvLeadership = z.infer<typeof CvLeadership>;

export const CvData = z.object({
  schemaVersion: z.literal(1),
  header: CvHeader,
  contact: CvContact,
  summary: z.string(), // canonical; header.summary mirrors it
  skills: CvSkills,
  experience: z.array(CvExperience),
  education: z.array(CvEducation),
  leadership: z.array(CvLeadership).default([]), // rendered by 'sidebar' only
  languages: z.array(CvLanguage).default([]), // rendered by 'clean' only
  photoUrl: z.string().optional(), // 'sidebar' circular photo; monogram fallback if absent
});
export type CvData = z.infer<typeof CvData>;

// ── ThemeTokens (§3) ────────────────────────────────────────────────────────
export const ThemeTokens = z.object({
  id: z.string(), // e.g. 'sidebar-default'
  templateId: TemplateId,
  page: z.object({
    widthPx: z.number().default(794), // A4 @96dpi
    heightPx: z.number().default(1123),
    safeBottomPx: z.number().default(12), // one-page bottom-margin guard
  }),
  font: z.object({
    family: z.string(), // 'Lato' | 'Source Sans 3'
    baseSizePt: z.number(), // body text
    scale: z.object({
      // multipliers off base for each role
      name: z.number(),
      title: z.number(),
      sectionHeader: z.number(),
      body: z.number(),
      small: z.number(),
    }),
    lineHeight: z.number(), // FIT-TUNABLE (last resort)
    letterSpacingEm: z.object({ title: z.number(), header: z.number() }),
  }),
  color: z.object({
    primary: z.string(), // sidebar navy #323B4C
    text: z.string(), // body
    accent: z.string(),
    onPrimary: z.string(), // white text on sidebar
    rule: z.string(), // dividers
    background: z.string(), // page background
  }),
  layout: z.object({
    sidebarWidthPx: z.number().nullish(), // sidebar only
    pagePaddingPx: z.object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    }),
    sectionGapPx: z.number(), // FIT-TUNABLE
    entryGapPx: z.number(), // FIT-TUNABLE
    bulletGapPx: z.number(), // FIT-TUNABLE
    skillGapPx: z.number(), // FIT-TUNABLE
  }),
  bullet: z.object({
    style: z.enum(["disc", "diamond", "none"]),
    color: z.string(),
  }),
});
export type ThemeTokens = z.infer<typeof ThemeTokens>;
