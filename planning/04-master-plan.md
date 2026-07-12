# 04 — Master Build Plan (Authoritative)

> Status: **LOCKED.** This document reconciles `00-current-system-analysis.md`, `01-product-spec.md`, `02-ux-design-spec.md`, and `03-architecture.md` into a single authoritative build plan. Where the source specs conflict — most importantly around the local-host infrastructure — this document is the tiebreaker. Every downstream milestone agent builds from **this** file. If an earlier doc disagrees with anything here, **this doc wins**.
>
> Guiding invariant (carried verbatim from the analysis): **design + layout + render + PDF + one-page-fit = pure deterministic code. The LLM is used for exactly two reasoning calls (extraction, tailoring) and nothing else.** Truthfulness is code-enforced: the model selects and rephrases from the knowledge base; it never invents experience.

---

## 1. Locked decisions & conflict resolutions

### 1.1 The locked stack (final)

| Concern | Locked choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router, latest stable)** + **TypeScript (strict)** | Node runtime only (`export const runtime = 'nodejs'`); never Edge — the PDF path needs Chromium + fs + `crypto`. |
| Styling | **Tailwind CSS + shadcn/ui** (Radix primitives) + CSS variables | Tokens from `02-ux-design-spec.md` §2 (Editorial Studio). |
| ORM / DB access | **Drizzle ORM** over **plain PostgreSQL** | Drizzle schema is the single source of DDL; Drizzle Kit generates migrations. RLS policies & roles are authored in raw SQL migrations alongside. |
| Database runtime | **Postgres via Docker Compose** (this machine) | **No Supabase, no Supabase CLI.** A `docker-compose.yml` runs a single `postgres:16` service. |
| App DB role | Non-superuser **`app_user`** role (no `BYPASSRLS`) + a privileged migration/owner role | RLS enforced at the DB layer; see §1.2. |
| RLS identity | Transaction-local GUC **`SET LOCAL app.user_id`** read by `app_uid()` | Auth.js owns identity; we drive RLS from our own verified session, not a Supabase JWT. |
| File storage | **Local filesystem** behind a **`Storage` interface** | `LocalFsStorage` adapter for now; a `SupabaseStorage`/S3 adapter can be added later without touching callers. |
| Auth | **Auth.js v5** (Google OAuth) + a **dev-login shim** (Credentials provider) | Dev shim signs in a seeded dev user with no Google creds; hard-disabled in production. DB sessions (not JWT). |
| Auth adapter | **Drizzle adapter** (`@auth/drizzle-adapter`) | Replaces `@auth/pg-adapter` from doc 03 — we use Drizzle everywhere. |
| PDF + e2e | **Playwright** (headless Chromium) | One engine for both server PDF rendering and e2e tests. Persistent browser + small page pool. |
| Validation | **zod** | At every boundary (action args, handler bodies, multipart fields, LLM outputs) and for env. |
| AI layer | Provider-agnostic **BYOK**: Anthropic / OpenAI / Google + a deterministic **mock provider** | Mock is selected by `AI_PROVIDER=mock` or when no user key exists in dev; CI always uses mock. |
| Tests | **vitest** (unit/integration) + **Playwright** (e2e) | |
| Package manager | **pnpm** | |
| Deployment | **None.** Local-host only for this build. | Deploy notes are documented as a non-blocking TODO (see §7 M12). |

### 1.2 Conflict resolutions (explicit, with rationale)

The three specs largely agree on **product** and **UX**; the conflicts are concentrated in **infrastructure** (doc 03 assumed Supabase) and **naming**. Each is resolved below.

| # | Conflict | Sources | Resolution | Rationale |
|---|---|---|---|---|
| C1 | **Database: Supabase (CLI + hosted) vs plain Postgres** | 03 §3, §10 say "Supabase Postgres", `supabase start`, `supabase db reset`. Task constraint mandates plain Postgres via Docker Compose, no Supabase CLI. | **Plain Postgres 16 via Docker Compose.** A `docker-compose.yml` runs `postgres:16`. Migrations applied by Drizzle Kit + raw-SQL RLS migrations via a `db:migrate` script. No `supabase` binary anywhere. | Task constraint is explicit and machine-scoped. The RLS *design* in doc 03 (denormalized `user_id`, `app_uid()` GUC, non-BYPASSRLS role) is **fully preserved** — it never actually depended on Supabase, only on Postgres RLS. |
| C2 | **ORM: doc 03 wrote raw SQL DDL & `@auth/pg-adapter`** | 03 §3.1–3.2 | **Drizzle ORM** is the source of truth for table DDL; **`@auth/drizzle-adapter`** for Auth.js. Raw SQL is used only for RLS policies, roles, GUC function, and `gen_random_uuid()`/extension setup (things Drizzle does not model). | Task locks Drizzle. Drizzle gives typed queries and migration generation; RLS is orthogonal and authored in companion SQL migrations. The schema/column shapes from doc 03 are reproduced 1:1 in Drizzle. |
| C3 | **File storage: Supabase Storage (S3) vs local filesystem** | 03 §1.1, §3, §3.3 (buckets `uploads/`, `artifacts/`, signed URLs) | **`LocalFsStorage`** adapter writing to a gitignored `storage/` dir, behind a `Storage` interface (`put`, `get`, `getSignedUrl`, `delete`). The "signed URL" becomes a short-lived **HMAC-signed local download token** served by `/api/artifacts/[id]` and `/api/files/[token]`. A `SupabaseStorage`/S3 adapter is a future drop-in. | Task constraint. The architecture's "metadata in Postgres, blob in storage, ownership-checked signed access" contract is preserved; only the adapter implementation changes. Object keys keep the `{userId}/...` namespace as defense-in-depth. |
| C4 | **Auth without Google creds locally** | 01 §3a (Google only); 03 §10 mentions a dev shim | **Dev-login shim is a first-class, required deliverable** (Auth.js Credentials provider, enabled only when `AUTH_DEV_LOGIN=true && NODE_ENV!=='production'`). Google OAuth remains the production path but its env vars are **optional locally**. | Lets the whole app run on this machine with zero Google setup. |
| C5 | **No provider keys locally** | 01 BYOK-from-minute-one; 03 §9 mock provider | **Mock provider is required and is the default** (`AI_PROVIDER=mock`). The full pipeline (extract → tailor → render → PDF → QA) runs end-to-end with no real key and deterministic output. Real keys are entered per-user in the UI for real use. | Local + CI must run with zero spend and deterministic output. |
| C6 | **Product name: "Lapel" vs "Tailor"** | 02 §1.1 recommends "Lapel"; 01 and README use "Tailor" | **Ship name = "Tailor"** (matches README + product spec). "Lapel" is recorded as a candidate rebrand but is **not** adopted for v1. The action verb is **"tailor"**. The UX *art direction* ("Editorial Studio", Fraunces+Inter, paper/ink/spruce/amber) from doc 02 is adopted in full regardless of name. | README is already public with "Tailor"; the product spec (01) is the authority on product identity; doc 02's naming section was explicitly a recommendation, not a decision. Avoids a public rename churn. |
| C7 | **Session strategy** | 03 §3.1 database sessions | **Database sessions** (Drizzle adapter, `session.strategy='database'`). | Server-side revocation + the session row is where RLS identity is read from. Kept as-is. |
| C8 | **Monorepo vs single app** | 03 §2 single app | **Single Next.js app** with strict internal `lib/` boundaries enforced by an ESLint dependency-direction rule. No pnpm workspace. | Kept as-is; pnpm is the package manager but not used for workspaces. |
| C9 | **WCAG version** | 01 §6 says 2.1 AA; 02 §6.3 says 2.2 AA | **WCAG 2.2 AA** (superset). | The stricter target subsumes the looser one. |
| C10 | **Auto-fit ladder & one-page guarantee** | 00 §5, 01 M11, 02 §5.5, 03 §4.4 all agree | Adopt doc 03's deterministic ladder verbatim (tighten bulletGap → entryGap → sectionGap → skillGap → lineHeight; never silently clip; remove `overflow:hidden`; export gated on fit). | Unanimous across specs. |
| C11 | **PDF engine** | 00 used Puppeteer; 02/03 say Playwright | **Playwright headless Chromium** (same engine as Puppeteer's Chromium → pixel parity), persistent browser + page pool. | Unanimous in the newer specs; one engine for PDF + e2e. |
| C12 | **Photo (Type 1) / languages (Type 2) / leadership (Type 1)** | 02 §5.2–5.4 and 03 §4.2 | `CvData` carries optional `photoUrl` (rendered by sidebar only), `leadership[]` (sidebar only), `languages[]` (clean only). Graceful monogram fallback when no photo. | Generalizes the schema for any user; matches both template designs. |

### 1.3 Non-negotiable product principles (carried forward)

1. **Deterministic-first.** Parse, structure, layout, render, PDF, one-page-fit = pure code. LLM only for content relevance/rewriting (exactly 2 call types).
2. **Truthfulness.** Never fabricate. The LLM selects/rephrases from the KB; a deterministic provenance check (every `kbExperienceId` must trace to a real KB row) gates output.
3. **Design fidelity.** Two designs reproduced 1:1; generic (no personal data baked into templates); pixel-accurate A4 PDF.
4. **BYOK, multi-provider.** Anthropic/OpenAI/Google; keys envelope-encrypted (AES-256-GCM), never logged, `last4` only in UI.
5. **Per-user isolation** enforced in Postgres RLS (denormalized `user_id`, non-BYPASSRLS `app_user`, transaction-local `app.user_id`), not just app code.
6. **One-page guarantee** via deterministic auto-fit (tighten tokens → only then propose content trims), never a silent clip.
7. **Productized, not scrappy.** Clean SaaS UX, onboarding, document/version management.

---

## 2. Canonical `CvData` schema (TypeScript) + JSON example

The render input. Generalized from the original `cv-data.json` so it fits **any** user. Optional `photoUrl` + `leadership[]` are Type-1 (sidebar) concerns; `languages[]` is a Type-2 (clean) concern. The renderer ignores fields a given template does not use, so a single `CvData` can drive either template.

```typescript
// lib/schemas/cv-data.ts
import { z } from 'zod';

export const TemplateId = z.enum(['sidebar', 'clean']);
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
  title: z.string(),              // role / positioning line (tailored)
  website: z.string().optional(),
  summary: z.string(),           // mirrors top-level `summary` for render convenience
});
export type CvHeader = z.infer<typeof CvHeader>;

export const CvExperience = z.object({
  kbExperienceId: z.string().uuid(),  // PROVENANCE → enforces truthfulness
  company: z.string(),
  role: z.string(),                    // "title" in the original
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
  level: z.string(),            // e.g. "Native", "Fluent", "Professional"
});
export type CvLanguage = z.infer<typeof CvLanguage>;

// Sidebar "Leadership & Impact" (Type 1 only). Generalizes the original
// projects/leadership block: a named item with a description and optional URL.
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
  summary: z.string(),                              // canonical; header.summary mirrors it
  skills: CvSkills,
  experience: z.array(CvExperience),
  education: z.array(CvEducation),
  leadership: z.array(CvLeadership).default([]),    // rendered by 'sidebar' only
  languages: z.array(CvLanguage).default([]),       // rendered by 'clean' only
  photoUrl: z.string().optional(),                  // 'sidebar' circular photo; monogram fallback if absent
});
export type CvData = z.infer<typeof CvData>;
```

### JSON example (generalized — a fictional user, exercises every optional field)

```json
{
  "schemaVersion": 1,
  "header": {
    "name": "Dana Whitfield",
    "title": "Senior Product Manager · AI Platforms",
    "website": "danawhitfield.dev",
    "summary": "Product leader with 9 years building 0→1 ML-powered products. Shipped a developer platform to 40k MAU and led a 12-person cross-functional team."
  },
  "contact": {
    "email": "dana@example.com",
    "phone": "+1 415 555 0142",
    "location": "San Francisco, CA",
    "linkedin": "linkedin.com/in/danawhitfield"
  },
  "summary": "Product leader with 9 years building 0→1 ML-powered products. Shipped a developer platform to 40k MAU and led a 12-person cross-functional team.",
  "skills": {
    "professional": ["Product Strategy", "ML/AI Products", "Roadmapping", "SQL", "A/B Testing", "Developer Platforms"],
    "soft": ["Cross-functional leadership", "Stakeholder alignment", "Mentoring"]
  },
  "experience": [
    {
      "kbExperienceId": "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      "company": "Northstar AI",
      "role": "Senior Product Manager",
      "period": "2021 — Present",
      "location": "San Francisco, CA",
      "bullets": [
        "Led the 0→1 launch of an LLM developer platform, growing to 40,000 monthly active developers in 14 months.",
        "Defined the API roadmap with eng leadership; cut time-to-first-call from 30 min to under 5.",
        "Ran weekly experiments that lifted activation 22% and retention 11%."
      ]
    },
    {
      "kbExperienceId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "company": "Mapline",
      "role": "Product Manager",
      "period": "2017 — 2021",
      "location": "Remote",
      "bullets": [
        "Owned the geospatial analytics suite used by 300+ enterprise customers.",
        "Shipped a self-serve onboarding flow that reduced sales-assist tickets 35%."
      ]
    }
  ],
  "education": [
    {
      "kbEducationId": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      "institution": "University of Washington",
      "degree": "B.S. Computer Science",
      "period": "2012 — 2016",
      "note": "Minor in Statistics"
    }
  ],
  "leadership": [
    {
      "kbLeadershipId": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      "name": "PM Mentorship Circle",
      "description": "Founded and ran a 30-person mentorship program for early-career PMs.",
      "url": "pmcircle.org"
    }
  ],
  "languages": [
    { "name": "English", "level": "Native" },
    { "name": "Spanish", "level": "Professional" }
  ],
  "photoUrl": "files/abc123/photo.jpg"
}
```

> **Type-by-type rendering:** `sidebar` renders `photoUrl` (or monogram), `leadership[]`, both skill groups, and the timeline experience. `clean` ignores `photoUrl` and `leadership[]`, renders `languages[]` and inline `·`-joined skills. The same `CvData` object is valid for both.

---

## 3. Canonical `ThemeTokens` schema (TypeScript) + JSON example

Every value the two designs hardcode (catalogued in the original `cv-analysis.json`) is a token. Each template ships a **default theme**; the fit loop produces **bounded overrides of spacing/line-height only**.

```typescript
// lib/schemas/cv-data.ts (cont.)
export const ThemeTokens = z.object({
  id: z.string(),                         // e.g. 'sidebar-default'
  templateId: TemplateId,
  page: z.object({
    widthPx: z.number().default(794),     // A4 @96dpi
    heightPx: z.number().default(1123),
    safeBottomPx: z.number().default(12), // one-page bottom-margin guard
  }),
  font: z.object({
    family: z.string(),                   // 'Lato' | 'Source Sans 3'
    baseSizePt: z.number(),               // body text
    scale: z.object({                     // multipliers off base for each role
      name: z.number(),
      title: z.number(),
      sectionHeader: z.number(),
      body: z.number(),
      small: z.number(),
    }),
    lineHeight: z.number(),               // FIT-TUNABLE (last resort)
    letterSpacingEm: z.object({ title: z.number(), header: z.number() }),
  }),
  color: z.object({
    primary: z.string(),                  // sidebar navy #323B4C
    text: z.string(),                     // body #737373 (sidebar) / #111 (clean)
    accent: z.string(),
    onPrimary: z.string(),                // white text on sidebar
    rule: z.string(),                     // dividers
    background: z.string(),               // page background #FFFFFF
  }),
  layout: z.object({                      // ALL fit-tunable within [min,max] ladder
    sidebarWidthPx: z.number().optional(),// sidebar only
    pagePaddingPx: z.object({
      top: z.number(), right: z.number(), bottom: z.number(), left: z.number(),
    }),
    sectionGapPx: z.number(),             // FIT-TUNABLE
    entryGapPx: z.number(),               // FIT-TUNABLE
    bulletGapPx: z.number(),              // FIT-TUNABLE
    skillGapPx: z.number(),               // FIT-TUNABLE
  }),
  bullet: z.object({
    style: z.enum(['disc', 'diamond', 'none']),
    color: z.string(),
  }),
});
export type ThemeTokens = z.infer<typeof ThemeTokens>;
```

### JSON example — `sidebar-default` (reproduces `cv-main.html` / Type 1)

```json
{
  "id": "sidebar-default",
  "templateId": "sidebar",
  "page": { "widthPx": 794, "heightPx": 1123, "safeBottomPx": 12 },
  "font": {
    "family": "Lato",
    "baseSizePt": 10.5,
    "scale": { "name": 3.14, "title": 1.33, "sectionHeader": 1.33, "body": 1.0, "small": 0.9 },
    "lineHeight": 1.5,
    "letterSpacingEm": { "title": 0.2, "header": 0.06 }
  },
  "color": {
    "primary": "#323B4C",
    "text": "#737373",
    "accent": "#323B4C",
    "onPrimary": "#FFFFFF",
    "rule": "#D0D0D0",
    "background": "#FFFFFF"
  },
  "layout": {
    "sidebarWidthPx": 206,
    "pagePaddingPx": { "top": 36, "right": 32, "bottom": 12, "left": 30 },
    "sectionGapPx": 12,
    "entryGapPx": 9,
    "bulletGapPx": 2,
    "skillGapPx": 7
  },
  "bullet": { "style": "diamond", "color": "#FFFFFF" }
}
```

### JSON example — `clean-default` (reproduces `cv-clean.html` / Type 2)

```json
{
  "id": "clean-default",
  "templateId": "clean",
  "page": { "widthPx": 794, "heightPx": 1123, "safeBottomPx": 12 },
  "font": {
    "family": "Source Sans 3",
    "baseSizePt": 10.0,
    "scale": { "name": 2.2, "title": 1.05, "sectionHeader": 1.0, "body": 1.0, "small": 0.96 },
    "lineHeight": 1.3,
    "letterSpacingEm": { "title": 0.05, "header": 0.15 }
  },
  "color": {
    "primary": "#111111",
    "text": "#111111",
    "accent": "#444444",
    "onPrimary": "#FFFFFF",
    "rule": "#111111",
    "background": "#FFFFFF"
  },
  "layout": {
    "sidebarWidthPx": null,
    "pagePaddingPx": { "top": 22, "right": 52, "bottom": 22, "left": 52 },
    "sectionGapPx": 9,
    "entryGapPx": 9,
    "bulletGapPx": 3,
    "skillGapPx": 3
  },
  "bullet": { "style": "disc", "color": "#111111" }
}
```

> Golden snapshot tests (M2/M3) pin pixel fidelity of both default themes against the original `cv-main.html` / `cv-clean.html` renders.

---

## 4. LLM structured-output contracts (JSON Schemas)

Both contracts are enforced via provider-native structured output / tool-use and then **re-validated with zod** server-side (one bounded repair retry on parse failure, then hard error). The mock provider emits schema-valid output echoing input facts so provenance checks always pass in dev/CI.

### 4.1 Contract (a) — `extract_profile` (resume text → profile / knowledge base)

```json
{
  "name": "extract_profile",
  "description": "Extract a structured career knowledge base from raw resume text. Extract ONLY what the resume supports. Leave fields empty rather than inventing. Do not invent employers, titles, dates, metrics, or skills.",
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["header", "contact", "experiences", "education", "skills"],
    "properties": {
      "header": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "title": { "type": "string" },
          "website": { "type": "string" },
          "summaryLong": { "type": "string" }
        }
      },
      "contact": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "email": { "type": "string" },
          "phone": { "type": "string" },
          "location": { "type": "string" },
          "linkedin": { "type": "string" }
        }
      },
      "experiences": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["company", "role", "bulletsFull"],
          "properties": {
            "company": { "type": "string" },
            "role": { "type": "string" },
            "period": { "type": "string" },
            "location": { "type": "string" },
            "bulletsFull": { "type": "array", "items": { "type": "string" } },
            "tags": { "type": "array", "items": { "type": "string" } },
            "angles": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["label", "jdSignals"],
                "properties": {
                  "label": { "type": "string" },
                  "jdSignals": { "type": "array", "items": { "type": "string" } },
                  "bulletIdxs": { "type": "array", "items": { "type": "integer" } }
                }
              }
            }
          }
        }
      },
      "education": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["institution"],
          "properties": {
            "institution": { "type": "string" },
            "degree": { "type": "string" },
            "period": { "type": "string" },
            "note": { "type": "string" }
          }
        }
      },
      "skills": {
        "type": "object",
        "additionalProperties": false,
        "required": ["professional", "soft"],
        "properties": {
          "professional": { "type": "array", "items": { "type": "string" } },
          "soft": { "type": "array", "items": { "type": "string" } }
        }
      },
      "leadership": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "description"],
          "properties": {
            "name": { "type": "string" },
            "description": { "type": "string" },
            "url": { "type": "string" },
            "tags": { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "languages": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "level"],
          "properties": {
            "name": { "type": "string" },
            "level": { "type": "string" }
          }
        }
      }
    }
  }
}
```

### 4.2 Contract (b) — `tailor_cv` ((knowledge base + JD + templateId) → tailored CvData + rationale/diff)

```json
{
  "name": "tailor_cv",
  "description": "Given the knowledge base (a SUPERSET of TRUE facts) and a job description, SELECT and REPHRASE existing material into a one-page-targeted CvData for the given templateId. Never add experience, employers, dates, metrics, or claims absent from the knowledge base. Each experience MUST echo back its kbExperienceId. If the JD requires something the candidate lacks, do not add it — add a string to `warnings`.",
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["cvData", "rationale", "templateSuggestion", "warnings"],
    "properties": {
      "cvData": {
        "type": "object",
        "additionalProperties": false,
        "required": ["header", "contact", "summary", "skills", "experience", "education"],
        "properties": {
          "header": {
            "type": "object",
            "additionalProperties": false,
            "required": ["name", "title", "summary"],
            "properties": {
              "name": { "type": "string" },
              "title": { "type": "string" },
              "website": { "type": "string" },
              "summary": { "type": "string" }
            }
          },
          "contact": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "email": { "type": "string" },
              "phone": { "type": "string" },
              "location": { "type": "string" },
              "linkedin": { "type": "string" }
            }
          },
          "summary": { "type": "string" },
          "skills": {
            "type": "object",
            "additionalProperties": false,
            "required": ["professional", "soft"],
            "properties": {
              "professional": { "type": "array", "items": { "type": "string" } },
              "soft": { "type": "array", "items": { "type": "string" } }
            }
          },
          "experience": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["kbExperienceId", "company", "role", "bullets"],
              "properties": {
                "kbExperienceId": { "type": "string" },
                "company": { "type": "string" },
                "role": { "type": "string" },
                "period": { "type": "string" },
                "location": { "type": "string" },
                "bullets": { "type": "array", "items": { "type": "string" } }
              }
            }
          },
          "education": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["institution"],
              "properties": {
                "kbEducationId": { "type": "string" },
                "institution": { "type": "string" },
                "degree": { "type": "string" },
                "period": { "type": "string" },
                "note": { "type": "string" }
              }
            }
          },
          "leadership": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name", "description"],
              "properties": {
                "kbLeadershipId": { "type": "string" },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "url": { "type": "string" }
              }
            }
          },
          "languages": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name", "level"],
              "properties": {
                "name": { "type": "string" },
                "level": { "type": "string" }
              }
            }
          }
        }
      },
      "rationale": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["field", "change", "reason"],
          "properties": {
            "field": { "type": "string", "description": "e.g. experience[0].bullets" },
            "change": { "type": "string", "description": "human-readable summary of the edit" },
            "reason": { "type": "string", "description": "why, tied to a JD signal" },
            "jdSignal": { "type": "string" }
          }
        }
      },
      "templateSuggestion": { "type": "string", "enum": ["sidebar", "clean"] },
      "warnings": {
        "type": "array",
        "items": { "type": "string" },
        "description": "JD requirements with no KB support, e.g. 'JD wants Kubernetes; not in knowledge base'."
      }
    }
  }
}
```

**Deterministic guardrails applied after the LLM returns (never trusting the model):**
1. **Provenance:** every `cvData.experience[i].kbExperienceId` must exist in the KB; company/period must match the KB record exactly; role may be rephrased but must map to the same KB experience. Mismatch → reject + repair retry.
2. **No-new-employer:** set of output companies ⊆ set of KB companies.
3. **Skill containment (soft):** novel skills not derivable from KB skills/tags are pushed into `warnings` and flagged in the diff for human approval, never silently shipped.
4. **Numeric/claim sanity (best-effort):** bullets introducing numbers/metrics absent from the corresponding KB `bulletsFull` are flagged for human review.

---

## 5. File / folder manifest (Next.js app)

Single Next.js app (no workspace). Dependency-direction lint: `lib/render-engine/**`, `lib/schemas/**`, `lib/ai/**` (except `factory.ts`) may not import from `app/**`, `lib/db/**`, or `lib/auth/**`.

```
cv-generator/
├─ planning/                          # design docs (00–04, STATUS.md)
├─ docker-compose.yml                 # postgres:16 service (the only infra container locally)
├─ Dockerfile                         # (M12) Playwright base image for future deploy — non-blocking
├─ app/                               # Next.js App Router
│  ├─ (marketing)/
│  │  └─ page.tsx                     # public landing
│  ├─ (auth)/
│  │  └─ sign-in/page.tsx             # Google + dev-login shim button
│  ├─ (app)/                          # authenticated segment (layout guards session)
│  │  ├─ layout.tsx                   # requireSession(); nav shell (rail + topbar)
│  │  ├─ onboarding/page.tsx          # 3-step wizard (upload → confirm → key)
│  │  ├─ dashboard/page.tsx
│  │  ├─ knowledge-base/
│  │  │  ├─ page.tsx                  # KB editor (RSC + client forms)
│  │  │  └─ actions.ts                # 'use server' KB mutations
│  │  ├─ documents/
│  │  │  ├─ page.tsx
│  │  │  ├─ [id]/page.tsx             # version detail + preview + rationale/diff
│  │  │  └─ actions.ts
│  │  ├─ tailor/
│  │  │  ├─ page.tsx                  # split-pane workspace (controls left / live A4 preview right)
│  │  │  └─ actions.ts                # createTailorJob, regenerateRender, refitDocument, editTailoredCv
│  │  └─ settings/
│  │     ├─ page.tsx                  # API keys, default template/theme, appearance, data
│  │     └─ actions.ts                # saveProviderKey, testProviderKey, deleteProviderKey, updateSettings
│  ├─ api/
│  │  ├─ auth/[...nextauth]/route.ts  # Auth.js v5 catch-all
│  │  ├─ uploads/route.ts             # POST multipart resume
│  │  ├─ artifacts/[id]/route.ts      # GET → 302 to signed local file token (ownership-checked)
│  │  ├─ files/[token]/route.ts       # GET stream a signed local file (HMAC token)
│  │  └─ health/route.ts              # { ok, browser, db }
│  ├─ layout.tsx                      # root layout: fonts (Fraunces/Inter/Geist Mono), providers
│  └─ globals.css                     # Tailwind + shadcn :root/.dark tokens (Editorial Studio)
├─ components/
│  ├─ ui/                             # shadcn primitives (generated)
│  └─ product/                        # custom signature components (see UX spec §3.2)
│     ├─ CvPreview.tsx                # renders CvData+theme at true A4; shared by edit + export
│     ├─ PreviewFrame.tsx             # paper lightbox + zoom + Type1/Type2 switch
│     ├─ OnePageFitIndicator.tsx
│     ├─ TemplatePickerCard.tsx
│     ├─ JdPasteBox.tsx
│     ├─ TailorDiffViewer.tsx
│     ├─ KnowledgeBaseEditor.tsx
│     ├─ ExperienceEntryEditor.tsx
│     ├─ ApiKeyManager.tsx
│     ├─ GenerationProgress.tsx
│     ├─ PhotoUploader.tsx
│     ├─ DocumentCard.tsx
│     ├─ EditableField.tsx
│     ├─ ProviderBadge.tsx
│     ├─ TokenCostMeter.tsx
│     ├─ StepRail.tsx
│     ├─ EmptyState.tsx
│     └─ CommandPalette.tsx
├─ lib/
│  ├─ schemas/                        # zod + inferred TS types (SHARED, PURE)
│  │  ├─ cv-data.ts                   # CvData, ThemeTokens, TemplateId
│  │  ├─ knowledge-base.ts            # KnowledgeBase, Experience, Angle, KnowledgeBaseForLLM
│  │  ├─ llm-contracts.ts             # extraction + tailor I/O (zod + exported JSON Schema)
│  │  └─ index.ts
│  ├─ render-engine/                  # data → HTML (PURE, no DB, no fetch)
│  │  ├─ templates/
│  │  │  ├─ Sidebar.tsx               # Type 1 (was cv-main.html)
│  │  │  ├─ Clean.tsx                 # Type 2 (was cv-clean.html)
│  │  │  └─ shared/                   # Bullets.tsx, SkillList.tsx, Section.tsx, ...
│  │  ├─ themes/
│  │  │  ├─ sidebar-default.ts
│  │  │  ├─ clean-default.ts
│  │  │  └─ registry.ts
│  │  ├─ fonts/                       # self-hosted Lato + Source Sans 3 woff2 (base64-inlined)
│  │  ├─ css.ts                       # tokens → CSS string (deterministic)
│  │  ├─ render.ts                    # renderToHtml(cvData, templateId, tokens): string
│  │  └─ fit.ts                       # auto-fit token-tightening ladder (pure policy)
│  ├─ pdf/
│  │  ├─ browser-pool.ts              # singleton Playwright browser + page acquire/release
│  │  ├─ render-pdf.ts                # html → { pdf, bbox, pages }; drives the fit loop
│  │  └─ measure.ts                   # in-page bbox measurement script
│  ├─ qa/
│  │  ├─ assertions.ts                # file-size, text-extraction, one-page, layout-integrity
│  │  └─ extract-text.ts              # pdf text extraction for QA
│  ├─ ai/
│  │  ├─ provider.ts                  # LLMProvider interface
│  │  ├─ anthropic.ts
│  │  ├─ openai.ts
│  │  ├─ google.ts
│  │  ├─ mock.ts                      # deterministic mock provider (no network)
│  │  ├─ factory.ts                   # resolveProvider(userId, provider) → decrypt key → adapter
│  │  └─ prompts/
│  │     ├─ extraction.ts
│  │     └─ tailor.ts
│  ├─ crypto/
│  │  └─ envelope.ts                  # AES-256-GCM envelope encrypt/decrypt of provider keys
│  ├─ storage/
│  │  ├─ storage.ts                   # Storage interface (put/get/getSignedUrl/delete)
│  │  ├─ local-fs.ts                  # LocalFsStorage adapter (writes to ./storage)
│  │  └─ token.ts                     # HMAC signed-download tokens (local "signed URL")
│  ├─ db/
│  │  ├─ schema.ts                    # Drizzle table definitions (source of DDL)
│  │  ├─ client.ts                    # pooled pg clients: ownerClient (migrations) + appClient (RLS)
│  │  ├─ rls.ts                       # withUser(userId, fn) → SET LOCAL app.user_id within a txn
│  │  └─ queries/                     # typed query helpers per table
│  ├─ auth/
│  │  ├─ config.ts                    # Auth.js v5 (Google + dev-login shim, Drizzle adapter, DB sessions)
│  │  └─ guards.ts                    # requireSession() → userId
│  ├─ validation/                     # request zod schemas for actions/handlers
│  ├─ ratelimit/                      # per-user token bucket (in-memory locally)
│  └─ env.ts                          # zod-validated process.env (fail fast at boot)
├─ drizzle/
│  ├─ migrations/                     # Drizzle-generated SQL + companion RLS/role SQL
│  │  ├─ 0000_init.sql                # Drizzle DDL
│  │  └─ 0001_rls_policies.sql        # roles, app_uid(), GUC, ENABLE RLS + policies (hand-authored)
│  └─ seed.ts                         # dev user + sample KB + baseline cv_documents per template
├─ drizzle.config.ts
├─ tests/
│  ├─ unit/                           # render, schema, fit, providers (mock), crypto
│  ├─ integration/                    # db+RLS, actions, api (against docker-compose Postgres)
│  ├─ e2e/                            # Playwright happy paths
│  └─ golden/                         # PDF/HTML/PNG snapshot fixtures
├─ scripts/
│  ├─ db-migrate.ts                   # apply Drizzle + RLS migrations to the compose Postgres
│  └─ db-seed.ts                      # run drizzle/seed.ts
├─ .env.example
├─ eslint.config.mjs                  # incl. no-restricted-imports dependency-direction rule
├─ next.config.ts
├─ tailwind.config.ts
├─ vitest.config.ts
├─ playwright.config.ts
├─ tsconfig.json                      # strict: true
├─ package.json
├─ pnpm-lock.yaml
└─ README.md
```

**Server Actions vs Route Handlers rule:** Actions for form/mutation-shaped work (KB edits, `createTailorJob`, key management, settings). Route Handlers only for binary/streaming I/O (multipart upload, file/PDF download), the Auth.js catch-all, and health.

---

## 6. Environment variables (full list)

`lib/env.ts` zod-validates these at boot and fails fast. `.env.example` documents every name. `.env.local` is gitignored. **Optional-locally** items are usable without setup thanks to the dev-login shim + mock provider.

```bash
# ── App ──
NEXTAUTH_URL=http://localhost:3000           # required
AUTH_SECRET=                                 # required — `openssl rand -base64 32`
NODE_ENV=development                         # required

# ── Auth.js Google OAuth ──
GOOGLE_CLIENT_ID=                            # OPTIONAL locally (dev-login shim covers sign-in)
GOOGLE_CLIENT_SECRET=                        # OPTIONAL locally
AUTH_DEV_LOGIN=true                          # enables Credentials dev-login shim (dev only; ignored in prod)
AUTH_ALLOWED_EMAILS=                         # OPTIONAL — comma list for private beta allowlist

# ── Database (Docker Compose Postgres) ──
# Owner/migration role (privileged; runs migrations, owns objects, may bypass RLS for DDL):
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cvgen           # required
# RLS-enforced application role (non-superuser, NO BYPASSRLS) — used by all business queries:
APP_DATABASE_URL=postgresql://app_user:app_pw@localhost:5432/cvgen         # required

# ── File storage (local filesystem adapter) ──
STORAGE_DRIVER=local                         # local | supabase (future). required (default 'local')
STORAGE_LOCAL_DIR=./storage                  # required when STORAGE_DRIVER=local; gitignored
STORAGE_SIGNING_SECRET=                      # required — HMAC secret for local signed-download tokens
# (Future Supabase adapter, all OPTIONAL/unused locally:)
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
# SUPABASE_STORAGE_BUCKET_UPLOADS=uploads
# SUPABASE_STORAGE_BUCKET_ARTIFACTS=artifacts

# ── Encryption ──
MASTER_KEY_SECRET=                           # required — `openssl rand -base64 48`; wraps provider keys (AES-256-GCM)

# ── AI (BYOK — per-user keys live in the DB; these are dev/test convenience only) ──
AI_PROVIDER=mock                             # mock | anthropic | openai | google. Default 'mock' (OPTIONAL to change)
# DEV_AI_API_KEY=                            # OPTIONAL dev-only override key for the selected provider
ANTHROPIC_DEFAULT_MODEL=claude-sonnet        # OPTIONAL — recommended default per provider
OPENAI_DEFAULT_MODEL=gpt-4.1                 # OPTIONAL
GOOGLE_DEFAULT_MODEL=gemini-1.5-pro          # OPTIONAL

# ── PDF ──
PLAYWRIGHT_CHROMIUM=                         # OPTIONAL explicit Chromium path; else Playwright-managed
PDF_MAX_CONCURRENCY=3                        # OPTIONAL (default 3)

# ── Rate limiting ──
RATELIMIT_LLM_PER_HOUR=10                    # OPTIONAL (default 10)
RATELIMIT_UPLOAD_PER_HOUR=20                 # OPTIONAL (default 20)
```

**Minimal set to run the whole app locally with zero external accounts:** `NEXTAUTH_URL`, `AUTH_SECRET`, `AUTH_DEV_LOGIN=true`, `DATABASE_URL`, `APP_DATABASE_URL`, `STORAGE_SIGNING_SECRET`, `MASTER_KEY_SECRET`, `AI_PROVIDER=mock`. Everything else is optional locally.

---

## 7. Milestones M1–M12 (acceptance criteria + verification command)

> M0 (this planning synthesis + repo on `main`) is **done** after this commit. The build sequence below is dependency-ordered; the deterministic spine **M1 → M2 → M3** must be rock-solid before tenancy (M4/M5), BYOK (M6), and the hot paths (M7/M8) are layered on. Verification commands assume `pnpm` scripts that each milestone wires up; the first milestone to need a script also adds it to `package.json`.

| Milestone | Scope | Acceptance criteria | Verification command |
|---|---|---|---|
| **M0 — Master plan & repo** | This doc + STATUS.md committed; repo on `main` with remote. | `planning/04-master-plan.md` + `planning/STATUS.md` exist and are pushed. | `git -C /Users/roishikler/MEGA/Projects/cv-generator log --oneline -1 && git status` |
| **M1 — Repo & tooling scaffold** | Next.js (App Router, TS strict) + Tailwind + shadcn/ui; ESLint with dependency-direction rule; `lib/env.ts`; vitest + playwright config; pnpm. | `next dev` serves the marketing page; `tsc --noEmit` clean; lint passes incl. the no-restricted-imports rule; `env.ts` fails fast on missing required vars. | `pnpm install && pnpm lint && pnpm typecheck && pnpm build` |
| **M2 — Schemas (pure core)** | `lib/schemas/*`: `CvData`, `ThemeTokens`, `KnowledgeBase`, `KnowledgeBaseForLLM`, LLM contracts (zod + inferred types + exported JSON Schema). | Unit tests round-trip the §2/§3 JSON examples; invalid fixtures rejected; `toJsonSchema()` output matches §4 contracts. | `pnpm test -- tests/unit/schemas` |
| **M3 — Render engine (deterministic)** | `Sidebar.tsx`, `Clean.tsx`, `themes/*`, `css.ts`, `render.ts`, self-hosted fonts. `renderToHtml(cvData, templateId, tokens)` pure (no DB/network). | Golden HTML snapshots match the two original designs given seed `CvData`; both templates render every optional field (photo/leadership for sidebar, languages for clean); escaping verified. | `pnpm test -- tests/unit/render && pnpm test -- tests/golden` |
| **M4 — PDF + auto-fit + QA** | `browser-pool.ts`, `render-pdf.ts`, `measure.ts`, `fit.ts`, `qa/assertions.ts`. Playwright Chromium; `overflow:hidden` removed; export gated on fit. | Seed `CvData` → one-page A4 PDF (40–500 KB, page_count===1); an over-long `CvData` is tightened by the ladder until it fits; ladder-exhaustion returns `fits:false`; all four QA assertions pass; golden PNG diff within tolerance. | `pnpm exec playwright install chromium && pnpm test -- tests/unit/fit tests/golden && pnpm test:pdf` |
| **M5 — Database + RLS (Docker Compose)** | `docker-compose.yml` (postgres:16); Drizzle `schema.ts` (all tables from doc 03 §3 reproduced 1:1) + Drizzle migration; companion `0001_rls_policies.sql` (roles, `app_uid()`, GUC, ENABLE RLS + policies); `withUser`; query helpers; `seed.ts`. | `docker compose up -d` + `pnpm db:migrate` + `pnpm db:seed` succeed; RLS integration suite proves user A cannot read/update/delete user B's rows on **every** table while connected as `app_user`; owner path can; transaction-local GUC verified (no pool leakage). | `docker compose up -d db && pnpm db:migrate && pnpm db:seed && pnpm test -- tests/integration/rls` |
| **M6 — Auth.js + dev-login shim** | Drizzle adapter, DB sessions, Google provider, dev-login Credentials shim (gated `AUTH_DEV_LOGIN && !prod`), `requireSession()`, `(app)` layout guard. | Dev-login signs in a seeded user with no Google creds; protected routes redirect when signed out; a `sessions` row is created on login and removed on sign-out; shim disabled when `NODE_ENV=production`. | `pnpm test -- tests/integration/auth && pnpm test:e2e -- auth.spec.ts` |
| **M7 — Provider abstraction + crypto + BYOK** | `LLMProvider`, mock + Anthropic/OpenAI/Google adapters, `envelope.ts`, `factory.ts`, `ApiKeyManager` UI + `saveProviderKey`/`testProviderKey`/`deleteProviderKey` actions. | Crypto encrypt→decrypt round-trip passes; tamper (flip a ciphertext byte) → auth-tag failure; `saveProviderKey`+`testProviderKey` work with the mock; each real adapter parses its recorded fixture into a valid `ExtractionResult`/`TailorResult`; repair-retry on bad JSON; plaintext key never written to logs/DB. | `pnpm test -- tests/unit/crypto tests/unit/providers tests/integration/keys` |
| **M8 — Storage interface + LocalFs adapter** | `Storage` interface, `LocalFsStorage`, HMAC signed-token download (`token.ts`), `/api/files/[token]`, `/api/artifacts/[id]`. | `put`→`getSignedUrl`→fetch round-trips a file; expired/invalid token rejected (401); object keys namespaced `{userId}/...`; ownership checked before minting a token; files written under `STORAGE_LOCAL_DIR` (gitignored). | `pnpm test -- tests/unit/storage tests/integration/files` |
| **M9 — Hot path A (upload → extract → KB)** | `/api/uploads` (multipart, MIME sniff, 8 MB cap), `extractProfile` (1 LLM call via mock), KB editor UI + actions, deterministic baseline `CvData` projection. | Upload a seed resume → extracted KB (mock) → KB editable + autosaved → baseline `cv_documents` row created; extraction cache hits on identical re-upload (no second call); low-confidence fields flagged. | `pnpm test -- tests/integration/extract && pnpm test:e2e -- onboarding.spec.ts` |
| **M10 — Hot path B (JD → tailor → render → PDF)** | `createTailorJob` (≤1 LLM call, cached), tailor cache by `(userId, kbVersion, jdHash, templateId)`, guardrail checks, `regenerateRender`/`refitDocument`/`editTailoredCv`, the split-pane Tailor workspace + preview + rationale/diff. | Paste JD → tailored `cv_documents` row + one-page PDF artifact + rationale/warnings (mock); cache hit on identical repeat (no second call); re-render with other template/theme costs 0 calls; a poisoned mock output (bad `kbExperienceId`) is rejected by the provenance guardrail. | `pnpm test -- tests/integration/tailor && pnpm test:e2e -- tailor.spec.ts` |
| **M11 — Hardening** | Per-user rate limiting, upload safety (magic-byte sniff, no inline serve, random names), log redaction (no keys/PII/bodies), usage view, error/empty states, full e2e happy paths. | e2e suite green end-to-end (sign in → upload → KB → tailor → export); rate limits enforced on LLM/upload routes; a log-scan test finds no secret/PII/body in logs; redaction middleware active. | `pnpm test:e2e && pnpm test -- tests/integration/ratelimit tests/unit/redaction` |
| **M12 — Deploy prep (NO deploy)** | `Dockerfile` on the Playwright base image; document hosted-Postgres + Supabase-Storage adapter swap; secret-store wiring notes; health checks; serverless-Chromium fallback + AV-sidecar TODO recorded. | `docker build` produces an image that boots the app and runs the full mock flow locally; `/api/health` returns `{ ok, browser, db }` true; deploy notes complete. **No actual deployment performed.** | `docker build -t cvgen . && docker run --rm -p 3000:3000 --env-file .env.local cvgen` then `curl localhost:3000/api/health` |

**Critical path:** M1 → M2 → M3 → M4 (deterministic engine + PDF, provable with zero auth/DB/LLM). M5 (tenancy) and M6 (BYOK) are independent and can interleave. M8 (storage) is independent. M9/M10 depend on all prior. M11/M12 are hardening + prep.

> **Renumbering note vs doc 03 §11:** doc 03 used M0–M10 with Supabase. This plan uses **M1–M12** with Docker-Compose Postgres + a dedicated Storage milestone (M8) split out (since storage is now a first-class local adapter, not Supabase Storage). The mapping is: 03's M0→M1, M1→M2, M2→M3, M3→M4, M4→M5, M5→M6, M6→M7, (new) Storage→M8, M7→M9, M8→M10, M9→M11, M10→M12.

---

## 8. Determinism & cost summary (carried forward, unchanged)

Exactly **one LLM call per high-value action**: extraction (once per upload, cached by `sha256(rawText)`), tailoring (once per new JD, cached by `(userId, kbVersion, jdHash, templateId)`). Everything else — parse, structure, render, auto-fit, PDF, QA, diff, inline edits, re-theme, re-fit — is pure code and costs **zero tokens**. Token counts/latency/status are recorded in `usage_events`; request/response bodies and keys are **never** logged.

## 9. Open product questions (unchanged, for the founder)

Carried from `01-product-spec.md` §9 — not blocking the build, defaults assumed: Q1 trial-without-key (default: BYOK strictly required at v1; mock covers dev), Q2 pricing (now answered — see §10), Q3 Hebrew/RTL (v1.1), Q4 open-source posture, Q5 provider default (mid-tier per provider), Q6 honesty positioning. None block M1–M12.

---

## 10. Monetization plan — M13 (Polar.sh, deferred until wanted)

**Decision (July 2026, research-backed):** when monetization ships, it is **Polar.sh**
selling **prepaid credit packs** spent against the app's managed LLM key. Deferred by
choice — nothing below blocks current work; this section exists so the decision and its
rationale don't have to be re-derived later.

### 10.1 Why Polar.sh

- **Merchant of Record** — Polar is legally the seller and handles VAT/sales tax
  globally. As a solo Israeli dev with international users, plain Stripe would make
  *us* the tax-liable merchant in every customer jurisdiction. Non-starter.
- **Native LLM token metering** — Polar ingests usage directly from OpenAI/Anthropic
  API responses and supports credit packs + subscriptions + metered billing in one
  product. Lemon Squeezy / Paddle offer the MoR benefit but not the LLM metering;
  Clerk Billing had no usage-based billing or tax handling as of mid-2026.
- **Pricing:** free Starter plan, 5% + $0.50 per transaction (same take rate as the
  other MoRs); paid tiers ($20/$100/$400 per month) buy the percentage down. Start on
  Starter — zero fixed cost until there is revenue.

### 10.2 How it maps onto the existing architecture (small delta by design)

The hard parts already exist:

| Already built | Where | Role in monetization |
|---|---|---|
| Per-call token accounting | `usage_events` (tokens, kind, status per LLM call) | The meter — source of truth for credit burn |
| BYOK vs managed split | `billingMode` in the tailor pipeline; `resolveProvider` | "Paying user on managed key" is a third billing mode alongside `byok` / managed-free |
| Managed-free budget caps | `TOKEN_CAP_FREE_*` env + rolling-average logic | Same enforcement point gates paid credits |
| Per-user rate limits | `lib/ratelimit` | Unchanged; applies to paid users too |

New pieces (the whole M13 scope):

1. **Credit ledger** — new `credit_transactions` table (userId, delta, reason:
   `purchase | burn | refund | grant`, polarOrderId, usageEventId, createdAt), RLS like
   every other table. Balance = SUM(delta); never a mutable balance column.
2. **Polar webhook route** — `app/api/webhooks/polar/route.ts`: verify signature, insert
   a `purchase` transaction on order-paid. Idempotent on polarOrderId.
3. **Burn hook** — after each managed-key LLM call, convert `usage_events` tokens →
   credits (fixed credits-per-1k-tokens rate per provider tier) and insert a `burn` row
   in the same transaction as the usage event.
4. **Gate** — in the managed-key path of `resolveProvider` / tailor action: balance ≤ 0
   → structured "buy credits" error to the UI. BYOK users bypass entirely (unchanged).
5. **UI** — settings: balance + "buy credits" (Polar hosted checkout link); tailor
   workspace: credit-cost estimate next to the existing token budget indicator.
6. **Pricing** — launch with one pack (e.g. $5 ≈ 50 tailorings on mid-tier models);
   tune with real usage data from `usage_events`, which already records exact costs.

Non-negotiables carry over: budgeted reasoning unchanged (credits change *who pays*,
never *how many calls*), keys never logged, every boundary (webhook body included)
Zod-validated.

### 10.3 Infra decisions recorded alongside (July 2026)

- **Database: stay on Cloud SQL** (`tailor-db`). We do NOT use Neon. Revisit only if
  the ~always-on Cloud SQL cost bothers us at low traffic — Neon (scale-to-zero
  Postgres) is the researched escape hatch and is a connection-string swap since
  Drizzle + RLS are plain Postgres. Not needed for monetization.
- **Auth: no change.** Auth.js v5 + Google OAuth with basic scopes (`openid email
  profile`) requires **no Google app verification** — the consent-screen production
  toggle is already done. Managed-auth providers (WorkOS/Clerk/Supabase) would not
  remove any production step. Revisit only if we want passkeys/magic links or hosted
  login UI; researched pick then: WorkOS AuthKit (free to 1M MAU).
- **Hosting: Cloud Run stays** — Playwright/Chromium needs the container runtime;
  no platform researched improves on it.
