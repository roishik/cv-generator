// LLM structured-output contracts (the two reasoning calls).
// PURE. No DB, no auth, no network.
//
// Each contract is exported BOTH as:
//   - a zod schema (server-side re-validation of provider output), and
//   - a hand-authored JSON Schema (fed to provider-native structured output /
//     tool-use) — reproduced 1:1 from planning/04-master-plan.md §4.
//
// The JSON Schemas are authored by hand (rather than generated) because each
// provider's structured-output dialect has subtle constraints (OpenAI strict
// mode requires every property to be `required` + `additionalProperties:false`,
// etc.) and the master plan pins the exact contract shape.
import { z } from "zod";

// ── Contract (a): extract_profile (resume text → profile / knowledge base) ──

export const ExtractAngle = z.object({
  label: z.string(),
  jdSignals: z.array(z.string()),
  bulletIdxs: z.array(z.number().int()).optional(),
});

export const ExtractExperience = z.object({
  company: z.string(),
  role: z.string(),
  period: z.string().optional(),
  location: z.string().optional(),
  bulletsFull: z.array(z.string()),
  tags: z.array(z.string()).optional(),
  angles: z.array(ExtractAngle).optional(),
});

export const ExtractionResult = z.object({
  header: z.object({
    name: z.string(),
    title: z.string().optional(),
    website: z.string().optional(),
    summaryLong: z.string().optional(),
  }),
  contact: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
  }),
  experiences: z.array(ExtractExperience),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().optional(),
      period: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  skills: z.object({
    professional: z.array(z.string()),
    soft: z.array(z.string()),
  }),
  leadership: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        url: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  languages: z
    .array(z.object({ name: z.string(), level: z.string() }))
    .optional(),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

/** JSON Schema for provider-native structured output — extraction (§4.1). */
export const EXTRACT_PROFILE_JSON_SCHEMA = {
  name: "extract_profile",
  description:
    "Extract a structured career knowledge base from raw resume text. Extract ONLY what the resume supports. Leave fields empty rather than inventing. Do not invent employers, titles, dates, metrics, or skills.",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["header", "contact", "experiences", "education", "skills"],
    properties: {
      header: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          website: { type: "string" },
          summaryLong: { type: "string" },
        },
      },
      contact: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: "string" },
          phone: { type: "string" },
          location: { type: "string" },
          linkedin: { type: "string" },
        },
      },
      experiences: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["company", "role", "bulletsFull"],
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            period: { type: "string" },
            location: { type: "string" },
            bulletsFull: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            angles: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "jdSignals"],
                properties: {
                  label: { type: "string" },
                  jdSignals: { type: "array", items: { type: "string" } },
                  bulletIdxs: { type: "array", items: { type: "integer" } },
                },
              },
            },
          },
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["institution"],
          properties: {
            institution: { type: "string" },
            degree: { type: "string" },
            period: { type: "string" },
            note: { type: "string" },
          },
        },
      },
      skills: {
        type: "object",
        additionalProperties: false,
        required: ["professional", "soft"],
        properties: {
          professional: { type: "array", items: { type: "string" } },
          soft: { type: "array", items: { type: "string" } },
        },
      },
      leadership: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            url: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
      languages: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "level"],
          properties: {
            name: { type: "string" },
            level: { type: "string" },
          },
        },
      },
    },
  },
} as const;

// ── Contract (b): tailor_cv ((KB + JD + templateId) → tailored CvData) ──

export const TailorRationaleItem = z.object({
  field: z.string(),
  change: z.string(),
  reason: z.string(),
  jdSignal: z.string().optional(),
});
export type TailorRationaleItem = z.infer<typeof TailorRationaleItem>;

/**
 * The cvData shape as returned BY THE LLM (string ids — provider structured
 * output cannot reliably emit uuid-format strings). It is normalized + hardened
 * into the canonical `CvData` (with schemaVersion, mirrored summary, defaults)
 * by the contract layer before render.
 */
export const TailorCvData = z.object({
  header: z.object({
    name: z.string(),
    title: z.string(),
    website: z.string().optional(),
    summary: z.string(),
  }),
  contact: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
  }),
  summary: z.string(),
  skills: z.object({
    professional: z.array(z.string()),
    soft: z.array(z.string()),
  }),
  experience: z.array(
    z.object({
      kbExperienceId: z.string(),
      company: z.string(),
      role: z.string(),
      period: z.string().optional(),
      location: z.string().optional(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      kbEducationId: z.string().optional(),
      institution: z.string(),
      degree: z.string().optional(),
      period: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  leadership: z
    .array(
      z.object({
        kbLeadershipId: z.string().optional(),
        name: z.string(),
        description: z.string(),
        url: z.string().optional(),
      }),
    )
    .optional(),
  languages: z
    .array(z.object({ name: z.string(), level: z.string() }))
    .optional(),
});
export type TailorCvData = z.infer<typeof TailorCvData>;

export const TailorResult = z.object({
  cvData: TailorCvData,
  rationale: z.array(TailorRationaleItem),
  templateSuggestion: z.enum(["sidebar", "clean"]),
  warnings: z.array(z.string()),
});
export type TailorResult = z.infer<typeof TailorResult>;

/** JSON Schema for provider-native structured output — tailoring (§4.2). */
export const TAILOR_CV_JSON_SCHEMA = {
  name: "tailor_cv",
  description:
    "Given the knowledge base (a SUPERSET of TRUE facts) and a job description, SELECT and REPHRASE existing material into a one-page-targeted CvData for the given templateId. Never add experience, employers, dates, metrics, or claims absent from the knowledge base. Each experience MUST echo back its kbExperienceId. If the JD requires something the candidate lacks, do not add it — add a string to `warnings`.",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cvData", "rationale", "templateSuggestion", "warnings"],
    properties: {
      cvData: {
        type: "object",
        additionalProperties: false,
        required: ["header", "contact", "summary", "skills", "experience", "education"],
        properties: {
          header: {
            type: "object",
            additionalProperties: false,
            required: ["name", "title", "summary"],
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              website: { type: "string" },
              summary: { type: "string" },
            },
          },
          contact: {
            type: "object",
            additionalProperties: false,
            properties: {
              email: { type: "string" },
              phone: { type: "string" },
              location: { type: "string" },
              linkedin: { type: "string" },
            },
          },
          summary: { type: "string" },
          skills: {
            type: "object",
            additionalProperties: false,
            required: ["professional", "soft"],
            properties: {
              professional: { type: "array", items: { type: "string" } },
              soft: { type: "array", items: { type: "string" } },
            },
          },
          experience: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kbExperienceId", "company", "role", "bullets"],
              properties: {
                kbExperienceId: { type: "string" },
                company: { type: "string" },
                role: { type: "string" },
                period: { type: "string" },
                location: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
              },
            },
          },
          education: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["institution"],
              properties: {
                kbEducationId: { type: "string" },
                institution: { type: "string" },
                degree: { type: "string" },
                period: { type: "string" },
                note: { type: "string" },
              },
            },
          },
          leadership: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description"],
              properties: {
                kbLeadershipId: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                url: { type: "string" },
              },
            },
          },
          languages: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "level"],
              properties: {
                name: { type: "string" },
                level: { type: "string" },
              },
            },
          },
        },
      },
      rationale: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "change", "reason"],
          properties: {
            field: { type: "string" },
            change: { type: "string" },
            reason: { type: "string" },
            jdSignal: { type: "string" },
          },
        },
      },
      templateSuggestion: { type: "string", enum: ["sidebar", "clean"] },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
} as const;
