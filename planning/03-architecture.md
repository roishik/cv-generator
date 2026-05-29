# 03 — Technical Architecture

> Status: **Decided.** This document makes firm architectural decisions for the multi-tenant CV-tailoring product. It generalizes the deterministic pipeline reverse-engineered in `00-current-system-analysis.md` (data → template regen → headless-Chromium PDF, with one-page verification) into a production Next.js SaaS.
>
> Locked stack (given): Next.js App Router + TypeScript, Tailwind + shadcn/ui, PostgreSQL via Supabase with RLS, Auth.js (NextAuth v5) Google OAuth, server-side headless-Chromium PDF, provider-agnostic AI (Anthropic/OpenAI/Google), BYOK. Local-host first; deploy later.
>
> Guiding invariant (from the analysis): **design + layout + render + PDF + one-page-fit = pure deterministic code. The LLM is used for exactly two reasoning calls (extraction, tailoring) and nothing else.** Truthfulness is enforced: the model selects and rephrases from the knowledge base; it never invents experience.

---

## 1. System Overview

### 1.1 Component / context diagram

```
                                  ┌───────────────────────────────────────────────┐
                                  │                  BROWSER (user)                 │
                                  │  Next.js client components (shadcn/ui, Tailwind)│
                                  │  - onboarding / resume upload                   │
                                  │  - knowledge-base editor                        │
                                  │  - JD paste → tailor → preview → download       │
                                  └───────────────┬───────────────────────────────┘
                                                  │ HTTPS (cookies: Auth.js session)
                                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS APP (single app, App Router) — Node runtime              │
│                                                                                          │
│  ┌────────────────┐   ┌──────────────────────────────────────────────────────────────┐  │
│  │  Auth.js v5     │   │                     SERVER LAYER                              │  │
│  │  Google OAuth   │   │  Server Actions (mutations, form posts)                       │  │
│  │  session=DB     │   │  Route Handlers (binary I/O: PDF stream, upload, webhooks)    │  │
│  └───────┬────────┘   │                                                                │  │
│          │            │   lib/ (pure modules, no React):                               │  │
│          │            │   ┌──────────────┐ ┌───────────────┐ ┌────────────────────┐    │  │
│          │            │   │ render-engine│ │  ai/ (LLM)    │ │  qa/ (auto-fit +    │    │  │
│          │            │   │ data→HTML    │ │ provider      │ │  one-page + checks)│    │  │
│          │            │   │ (React SSR)  │ │ abstraction   │ └────────────────────┘    │  │
│          │            │   └──────┬───────┘ └──────┬────────┘                            │  │
│          │            │          │                │                                     │  │
│          │            │   ┌──────▼────────────────▼───────┐  ┌──────────────────────┐  │  │
│          │            │   │  pdf/ (headless Chromium pool) │  │ crypto/ (AES-256-GCM │  │  │
│          │            │   │  Playwright → A4 PDF + bbox    │  │ envelope, key wrap)  │  │  │
│          │            │   └────────────────┬──────────────┘  └──────────────────────┘  │  │
│          │            └────────────────────┼──────────────────────────────────────────┘  │
│          │                                 │                                              │
└──────────┼─────────────────────────────────┼──────────────────────────────────────────────┘
           │ (Auth.js adapter: SQL)           │ (SQL via service role + RLS-scoped pooled conn)
           ▼                                 ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────────────────────┐
│       SUPABASE POSTGRES       │   │                 SUPABASE STORAGE (S3-compatible)       │
│  Auth.js tables + app tables  │   │  bucket: uploads/   (raw resumes, private)            │
│  Row-Level Security per user  │   │  bucket: artifacts/ (generated PDFs, private)          │
└──────────────────────────────┘   └──────────────────────────────────────────────────────┘
           │
           ▼ (egress, per-request, key decrypted in memory only)
┌──────────────────────────────────────────────────────────────────┐
│   EXTERNAL LLM PROVIDERS (user BYO key): Anthropic / OpenAI / Google│
└──────────────────────────────────────────────────────────────────┘
```

**Runtime decision:** All server code runs on the **Node.js runtime** (`export const runtime = 'nodejs'`), never the Edge runtime, because the PDF path needs Chromium + filesystem + the `crypto` module. Locally this is `next dev`/`next start`. The future deploy target (see §10) is a **long-lived Node container** (Fly.io / Render / a VM), *not* Vercel serverless functions, because of the Chromium dependency and process-pool warm-start economics.

### 1.2 Hot path A — Resume upload → extraction → structured profile

```
1. Client: user drops resume.pdf (or .docx/.txt). Client-side guard: type+size.
2. Route Handler  POST /api/uploads  (multipart, Node runtime)
   - Auth.js: resolve session.user.id (else 401).
   - Validate: MIME sniff (magic bytes), size ≤ 8 MB, ext allowlist [pdf,docx,txt].
   - Stream to Supabase Storage bucket `uploads/{userId}/{uuid}.pdf` (private).
   - Insert row in `resume_uploads` (status='uploaded'). Return uploadId.
3. Server Action  extractProfile(uploadId)  [deterministic + 1 LLM call]
   a. (det) Download object; extract raw text:
        pdf → pdf-parse / pdfjs ; docx → mammoth ; txt → utf8.
   b. (det) Normalize whitespace, strip headers/footers heuristically.
   c. (LLM call #1) provider.extractProfile(rawText) → structured JSON
        validated against KnowledgeBaseExtraction zod schema (provider-native
        structured output / tool-use; see §5.4). NO network logging of content.
   d. (det) Upsert into knowledge_base + kb_experiences (+ angles) + kb_education
        + kb_skills. Mark resume_uploads.status='extracted'.
   e. (det) Seed a baseline cv_document v1 by projecting the KB → CvData
        (deterministic selection: all experiences, default ordering).
   Returns: { knowledgeBaseId, baselineCvDocumentId }.
4. Client: redirect to KB editor for human review/correction (truth gate).
```

Cost note: exactly **one** LLM call (extraction), cached by `sha256(rawText)`; re-upload of identical text is free.

### 1.3 Hot path B — JD → tailor → render → PDF

```
1. Client: user pastes JD text + picks template ('sidebar'|'clean') + theme.
   Server Action  createTailorJob({ jdText, baselineCvDocumentId, templateId, themeId })
2. (det) Insert job_descriptions row; hash jdText (sha256).
3. CACHE CHECK: if a tailored_cv exists for (userId, kbVersion, jdHash, templateId)
   → reuse it, skip LLM. (See §8.)
4. (LLM call #2) provider.tailor({ knowledgeBase, jdText }) → TailorResult:
      { cvData: CvData, rationale: ChangeRationale[], templateSuggestion, warnings[] }
   - Structured output enforced (§5.5). Truthfulness guardrail in prompt + a
     deterministic post-check that every fact in cvData traces to a KB id.
5. (det) Persist cv_documents row (kind='tailored', parent=baseline, version++),
   storing the full CvData snapshot (JSONB) + rationale + jobDescriptionId.
6. (det) RENDER: render-engine.renderToHtml(cvData, template, themeTokens) → HTML string.
7. (det) AUTO-FIT + PDF (single Chromium page reused):
      loop:
        page.setContent(html); measure content bbox (DOM) vs A4 box.
        if overflow → tighten spacing tokens one notch (bounded) → re-render → re-measure.
        else break.
      page.pdf({format:'A4', margin:0, printBackground:true}) → Buffer.
8. (det) QA ASSERTIONS on the Buffer (port of manual checklist, §4.5):
      file-size 40KB–500KB ; text-extraction (sample tokens present) ;
      one-page bbox (lowest-y ≤ page bottom − margin) ; layout-integrity
      (type-aware: sidebar fill present for 'sidebar', absent for 'clean').
      Any failure → job status='qa_failed' with the failed assertion; surfaced to UI.
9. (det) Upload PDF → Storage `artifacts/{userId}/{cvDocId}.pdf`; insert artifacts row.
10. Client: preview (signed URL) + download + view rationale/diff.
```

Cost note: exactly **one** LLM call (tailoring) per *new* JD. Re-render with a different theme or template, or a re-fit, costs **zero** tokens (steps 6–9 are pure).

---

## 2. Monorepo / Project Structure

**Decision: a single Next.js app, not a workspace/monorepo.** Rationale: there is one deployable (the web app); the "shared" code (render engine, schemas, providers) is consumed only by that app and its tests. A pnpm workspace would add tooling overhead (build orchestration, internal versioning) with no consumer to justify it. We keep strict internal boundaries via `lib/` module folders + path aliases + a dependency-direction lint rule (`lib/render-engine` and `lib/schemas` may not import from `app/` or `lib/db`). If a second consumer ever appears (e.g. a CLI or a worker service), we promote `lib/render-engine`, `lib/schemas`, `lib/ai` to packages then — cheaply, because they are already pure and side-effect-free. **Trade-off:** no enforced package boundary today; mitigated by the lint rule below.

```
cv-generator/
├─ planning/                      # design docs (this file, 00, etc.)
├─ app/                           # Next.js App Router
│  ├─ (marketing)/                # public landing, unauthenticated
│  │  └─ page.tsx
│  ├─ (app)/                      # authenticated segment (layout guards session)
│  │  ├─ layout.tsx               # requires session; nav shell
│  │  ├─ dashboard/page.tsx       # list documents + jobs
│  │  ├─ knowledge-base/
│  │  │  ├─ page.tsx              # KB editor (RSC + client forms)
│  │  │  └─ actions.ts            # 'use server' KB mutations
│  │  ├─ documents/
│  │  │  ├─ page.tsx              # baseline + tailored versions
│  │  │  ├─ [id]/page.tsx         # version detail + preview + rationale
│  │  │  └─ actions.ts
│  │  ├─ tailor/
│  │  │  ├─ page.tsx              # JD paste → tailor flow
│  │  │  └─ actions.ts            # createTailorJob, regenerate, refit
│  │  └─ settings/
│  │     ├─ page.tsx              # provider keys, default template/theme
│  │     └─ actions.ts            # saveProviderKey (encrypts), test key
│  ├─ api/                        # Route Handlers (binary / streaming / webhook)
│  │  ├─ auth/[...nextauth]/route.ts
│  │  ├─ uploads/route.ts         # POST multipart resume
│  │  ├─ artifacts/[id]/route.ts  # GET stream PDF (auth-checked redirect to signed URL)
│  │  └─ health/route.ts
│  ├─ layout.tsx                  # root layout, fonts, providers
│  └─ globals.css
├─ lib/
│  ├─ schemas/                    # zod schemas + inferred TS types (SHARED, PURE)
│  │  ├─ cv-data.ts               # CvData, ThemeTokens, TemplateId
│  │  ├─ knowledge-base.ts        # KnowledgeBase, Experience, Angle
│  │  ├─ llm-contracts.ts         # extraction + tailor I/O schemas (JSON Schema + zod)
│  │  └─ index.ts
│  ├─ render-engine/              # data → HTML (PURE, no DB, no fetch)
│  │  ├─ templates/
│  │  │  ├─ Sidebar.tsx           # Type 1 (was cv-main.html)
│  │  │  ├─ Clean.tsx             # Type 2 (was cv-clean.html)
│  │  │  └─ shared/Bullets.tsx, SkillList.tsx, ...
│  │  ├─ themes/
│  │  │  ├─ sidebar-default.ts    # ThemeTokens for Type 1
│  │  │  ├─ clean-default.ts      # ThemeTokens for Type 2
│  │  │  └─ registry.ts
│  │  ├─ css.ts                   # tokens → CSS string (deterministic)
│  │  ├─ render.ts                # renderToHtml(cvData, templateId, tokens): string
│  │  └─ fit.ts                   # auto-fit token-tightening ladder (pure policy)
│  ├─ pdf/
│  │  ├─ browser-pool.ts          # singleton Playwright browser + page acquire/release
│  │  ├─ render-pdf.ts            # html → {pdf: Buffer, bbox, pages} (+ fit loop driver)
│  │  └─ measure.ts               # in-page bbox measurement script
│  ├─ qa/
│  │  ├─ assertions.ts            # file-size, text-extraction, one-page, layout-integrity
│  │  └─ extract-text.ts          # pdf text extraction for QA
│  ├─ ai/
│  │  ├─ provider.ts              # LLMProvider interface
│  │  ├─ anthropic.ts             # adapter
│  │  ├─ openai.ts                # adapter
│  │  ├─ google.ts                # adapter
│  │  ├─ mock.ts                  # deterministic mock provider (no network)
│  │  ├─ factory.ts               # resolveProvider(userId) → decrypt key → adapter
│  │  └─ prompts/                 # extraction.ts, tailor.ts (prompt builders)
│  ├─ crypto/
│  │  └─ envelope.ts              # AES-256-GCM encrypt/decrypt of provider keys
│  ├─ db/
│  │  ├─ client.ts                # pooled pg / supabase clients (service + RLS)
│  │  ├─ rls.ts                   # withUser(userId, fn) → sets request.jwt.claims
│  │  └─ queries/                 # typed query helpers per table
│  ├─ auth/
│  │  ├─ config.ts                # Auth.js v5 config (providers, adapter, callbacks)
│  │  └─ guards.ts                # requireSession() for actions/handlers
│  ├─ validation/                 # request zod schemas for actions/handlers
│  ├─ ratelimit/                  # token-bucket limiter (per-user, per-route)
│  └─ env.ts                      # zod-validated process.env
├─ supabase/
│  ├─ migrations/                 # SQL DDL + RLS policies (versioned)
│  └─ seed.sql                    # dev seed (Roi's KB from career-knowledge)
├─ tests/
│  ├─ unit/                       # render, schema, fit, providers (mock), crypto
│  ├─ integration/                # db+RLS, actions, api (testcontainers / local supabase)
│  ├─ e2e/                        # Playwright happy paths
│  └─ golden/                     # PDF/HTML snapshot fixtures
├─ .env.example
├─ eslint.config.mjs              # incl. no-restricted-imports dependency-direction rule
├─ next.config.ts
└─ package.json
```

**Server Actions vs Route Handlers — the rule:**
- **Server Actions** for everything form/mutation-shaped that returns JSON-serializable data and benefits from progressive enhancement & revalidation: KB edits, `createTailorJob`, `saveProviderKey`, settings.
- **Route Handlers** only where Actions are a poor fit: **binary/streaming I/O** (multipart upload, PDF download), the **Auth.js catch-all**, and **health**. Actions cannot stream multipart uploads or set arbitrary response headers cleanly; handlers can.

**Dependency-direction lint** (`no-restricted-imports`): `lib/render-engine/**`, `lib/schemas/**`, `lib/ai/**` (except `factory.ts`) must not import `app/**`, `lib/db/**`, or `lib/auth/**`. Keeps the pure core testable without a DB or a session.

---

## 3. Data Model

**Storage decision:** Postgres for all structured data and metadata; **Supabase Storage (S3-compatible) for binary blobs** (uploaded resumes, generated PDFs). Rationale: PDFs are 40–500 KB and resumes a few MB — storing them as `bytea` bloats the table, hurts `VACUUM`, and breaks streaming/range requests and CDN signing. Storage buckets are private; access is always via short-lived signed URLs minted server-side after an RLS-equivalent ownership check. Postgres keeps only the **storage path + metadata + checksum**.

### 3.1 Auth.js tables (NextAuth v5, `@auth/pg-adapter` schema)

Standard adapter schema; lives in schema `next_auth` (the adapter convention) or `public` — we use `public` with the documented column names so the Postgres adapter works out-of-the-box.

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text,
  email         text UNIQUE NOT NULL,
  "emailVerified" timestamptz,
  image         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                text NOT NULL,
  provider            text NOT NULL,
  "providerAccountId" text NOT NULL,
  refresh_token       text, access_token text, expires_at bigint,
  token_type text, scope text, id_token text, session_state text,
  UNIQUE (provider, "providerAccountId")
);
CREATE INDEX accounts_user_idx ON accounts("userId");

CREATE TABLE sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionToken" text UNIQUE NOT NULL,
  "userId"       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions("userId");

CREATE TABLE verification_token (
  identifier text NOT NULL, token text NOT NULL, expires timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);
```

**Session strategy decision: database sessions** (not JWT). Rationale: instant server-side revocation (sign-out everywhere, key compromise), and the `sessions` row is the natural place RLS reads identity from. Trade-off: one DB read per request — negligible at our scale and the read is indexed.

### 3.2 Application tables

```sql
-- ── Per-user profile / settings ───────────────────────────────────────────
CREATE TABLE profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name        text,
  default_template text NOT NULL DEFAULT 'sidebar'
                     CHECK (default_template IN ('sidebar','clean')),
  default_theme_id text NOT NULL DEFAULT 'sidebar-default',
  default_provider text CHECK (default_provider IN ('anthropic','openai','google')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Knowledge base (the "career-knowledge.md" generalization) ──────────────
-- One active KB per user, versioned so a tailor result pins the KB it used.
CREATE TABLE knowledge_bases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     int  NOT NULL DEFAULT 1,
  -- freeform narrative (career themes, positioning) — mirrors career-knowledge.md prose
  narrative   text,
  -- structured header/contact/summary superset
  header      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {name,title,website,summaryLong}
  contact     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {email,phone,location,linkedin}
  languages   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name,level}]
  source_upload_id uuid,                            -- FK set after extraction
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
CREATE INDEX kb_user_idx ON knowledge_bases(user_id);

CREATE TABLE kb_experiences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- denormalized for RLS
  ord           int  NOT NULL,
  company       text NOT NULL,
  role          text NOT NULL,
  period        text,
  location      text,
  -- the SUPERSET of bullets (richer than any single CV); tailor SELECTS from these
  bullets_full  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  -- "Angles to highlight depending on job" — the crown-jewel mapping
  angles        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{label, jdSignals:string[], bulletIdxs:int[]}]
  tags          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- skill/domain tags for matching
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kb_exp_kb_idx ON kb_experiences(knowledge_base_id, ord);
CREATE INDEX kb_exp_user_idx ON kb_experiences(user_id);

CREATE TABLE kb_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ord int NOT NULL,
  institution text NOT NULL, degree text, period text, note text
);
CREATE INDEX kb_edu_kb_idx ON kb_education(knowledge_base_id, ord);

CREATE TABLE kb_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('professional','soft')),
  ord int NOT NULL,
  value text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX kb_skill_kb_idx ON kb_skills(knowledge_base_id, category, ord);

-- ── Uploaded resumes (binary in Storage; metadata here) ────────────────────
CREATE TABLE resume_uploads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,                 -- uploads/{userId}/{uuid}.pdf
  filename     text NOT NULL,
  mime_type    text NOT NULL,
  byte_size    int  NOT NULL,
  sha256       text NOT NULL,                 -- of raw extracted text → extraction cache key
  status       text NOT NULL DEFAULT 'uploaded'
                 CHECK (status IN ('uploaded','extracting','extracted','failed')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_user_idx ON resume_uploads(user_id);
CREATE INDEX uploads_sha_idx  ON resume_uploads(user_id, sha256);

-- ── Job descriptions ──────────────────────────────────────────────────────
CREATE TABLE job_descriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text,                  -- optional, parsed/entered
  company    text,
  raw_text   text NOT NULL,
  sha256     text NOT NULL,         -- tailor cache key component
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jd_user_idx ON job_descriptions(user_id, sha256);

-- ── CV documents (baseline + tailored, versioned) ─────────────────────────
-- Canonical render input is the cv_data JSONB snapshot. Tailored docs pin the
-- KB version + JD they came from. This is immutable per version (new edit = new row).
CREATE TABLE cv_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('baseline','tailored')),
  parent_id       uuid REFERENCES cv_documents(id) ON DELETE SET NULL, -- tailored→baseline
  version         int  NOT NULL DEFAULT 1,
  template_id     text NOT NULL CHECK (template_id IN ('sidebar','clean')),
  theme_id        text NOT NULL DEFAULT 'sidebar-default',
  knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  kb_version      int,                      -- snapshot of KB version used
  job_description_id uuid REFERENCES job_descriptions(id) ON DELETE SET NULL,
  cv_data         jsonb NOT NULL,           -- the CvData snapshot (see §4)
  rationale       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ChangeRationale[] (tailored only)
  applied_theme_overrides jsonb,            -- fit-loop tightened tokens actually used
  label           text,                     -- user-facing name
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cvdoc_user_idx   ON cv_documents(user_id, created_at DESC);
CREATE INDEX cvdoc_parent_idx ON cv_documents(parent_id);
-- tailor cache lookup:
CREATE INDEX cvdoc_cache_idx  ON cv_documents(user_id, knowledge_base_id, kb_version, job_description_id, template_id);

-- ── Generated artifacts (PDF refs) ─────────────────────────────────────────
CREATE TABLE artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cv_document_id  uuid NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
  storage_path    text NOT NULL,            -- artifacts/{userId}/{cvDocId}.pdf
  byte_size       int  NOT NULL,
  sha256          text NOT NULL,
  page_count      int  NOT NULL,
  qa              jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {fileSize,textExtraction,onePage,layout}
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artifact_doc_idx ON artifacts(cv_document_id);

-- ── Provider API keys (encrypted, BYOK) ───────────────────────────────────
CREATE TABLE provider_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('anthropic','openai','google')),
  -- envelope-encrypted ciphertext (AES-256-GCM). NEVER the plaintext.
  ciphertext      bytea NOT NULL,
  iv              bytea NOT NULL,
  auth_tag        bytea NOT NULL,
  key_version     int   NOT NULL DEFAULT 1, -- which server master key wrapped it
  last4           text,                     -- for UI display only ("sk-...AB12")
  validated_at    timestamptz,              -- last successful test call
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- ── Usage / audit ──────────────────────────────────────────────────────────
CREATE TABLE usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,  -- 'extraction','tailor','render','pdf','key.test','upload'
  provider    text,
  model       text,
  prompt_tokens int, completion_tokens int,   -- from provider usage; NEVER content
  latency_ms  int,
  status      text NOT NULL,  -- 'ok','error','qa_failed'
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {jdHash, cvDocId, failedAssertion} — no PII content
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_user_time_idx ON usage_events(user_id, created_at DESC);
```

### 3.3 Row-Level Security

Every app table carries a `user_id`. We **denormalize `user_id` onto child tables** (`kb_experiences`, `kb_skills`, etc.) so each RLS policy is a single-column equality check with no join — faster and impossible to get subtly wrong.

```sql
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_experiences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_education        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_uploads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_descriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_keys       ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events        ENABLE ROW LEVEL SECURITY;

-- identity source: a request-scoped GUC we set from the verified Auth.js session.
CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- Template policy (repeat per table, swapping table name):
CREATE POLICY p_select ON cv_documents FOR SELECT USING (user_id = app_uid());
CREATE POLICY p_insert ON cv_documents FOR INSERT WITH CHECK (user_id = app_uid());
CREATE POLICY p_update ON cv_documents FOR UPDATE USING (user_id = app_uid())
                                                 WITH CHECK (user_id = app_uid());
CREATE POLICY p_delete ON cv_documents FOR DELETE USING (user_id = app_uid());
```

**How `app_uid()` / `auth.uid()` scoping works in this app.** Auth.js (not Supabase Auth) owns identity, so there is no Supabase JWT carrying `auth.uid()`. We therefore drive RLS from our **own** verified session:

1. App connects to Postgres with a **non-superuser, RLS-enforced application role** (`app_user`) via the pooled connection. Critically, this role does **not** have `BYPASSRLS`.
2. Every DB access goes through `withUser(userId, fn)` (`lib/db/rls.ts`), which, on a dedicated transaction/connection, runs:
   ```sql
   SELECT set_config('app.user_id', $1, true);  -- true = transaction-local
   ```
   then executes the query, so `app_uid()` returns the authenticated user for the life of that transaction only. Connection-pool leakage is impossible because the setting is transaction-local.
3. The `userId` passed in is **always** the value resolved from the Auth.js DB session (`requireSession()`), never user input. RLS is defense-in-depth: even a query bug that drops a `WHERE user_id=` clause cannot cross tenants.
4. The Auth.js adapter and a few system operations (creating sessions, minting signed Storage URLs) use a separate **service role** path that bypasses RLS, confined to `lib/db/client.ts` and `lib/auth`. App/business code never touches the service client.

> Note on Supabase Auth's native `auth.uid()`: we deliberately do **not** use Supabase Auth (Auth.js is the locked decision), so the canonical `auth.uid()` helper is replaced by our `app_uid()` reading a transaction-local GUC. This is the standard pattern for "RLS with an external auth provider."

**Storage RLS:** buckets `uploads` and `artifacts` are private. We do not rely on Supabase Storage's own RLS (it expects Supabase Auth JWTs); instead the server checks ownership in Postgres, then mints a **short-lived signed URL** (≤ 60 s) with the service role. Object keys are namespaced `{bucket}/{userId}/...` as defense-in-depth.

---

## 4. The CV Rendering Engine (Deterministic) — core section

### 4.1 From HTML templates to data-driven React components

The original `apply-changes.js` does regex surgery on hand-written HTML keyed by `data-section`/`data-field`. That is brittle (the file itself notes the `!== undefined` skill bug and the multiple fragile regexes). **We discard the regex-regen approach entirely.** The clean idea underneath it — *CSS/design is never touched; only data is bound* — becomes a **pure function**:

```
renderToHtml(cvData: CvData, templateId: TemplateId, tokens: ThemeTokens): string
```

Implementation: **React Server Components rendered to a static HTML string** via `react-dom/server`'s `renderToStaticMarkup`, producing a *complete, self-contained HTML document* (doctype + `<style>` + body). Each template (`Sidebar.tsx`, `Clean.tsx`) is a 1:1 faithful re-creation of `cv-main.html` / `cv-clean.html`, but:
- all literal text comes from `cvData` props (no personal data baked in),
- all colors/sizes/spacing/geometry come from `tokens` (no hardcoded CSS values for anything themeable),
- the CSS is emitted by `css.ts` from `tokens` into an inlined `<style>` block (so the PDF is fully self-contained; Chromium needs no external CSS).

Why React (server-rendered to string) over a string-template engine (Handlebars/EJS): React gives us **typed props** (the `CvData`/`ThemeTokens` types are the contract), composition (shared `Bullets`, `SkillList`), compile-time safety, and trivially testable pure components. We are NOT hydrating these on the client and NOT shipping them to the browser; they are server-only render functions. **Trade-off:** we accept React's `renderToStaticMarkup` over raw string concat for safety; output is deterministic and snapshot-testable.

**Fonts:** Google Fonts (Lato, Source Sans 3) are **self-hosted** (downloaded woff2 into `app` and `@font-face`-inlined as base64 in the emitted CSS, or served from a known local path). Rationale: deterministic rendering offline, no network race in the PDF step (the original relied on `networkidle0` waiting for fonts.googleapis.com — a flakiness and privacy source we remove).

### 4.2 The `CvData` schema (generalized from `cv-data.json`)

```typescript
// lib/schemas/cv-data.ts
import { z } from 'zod';

export const TemplateId = z.enum(['sidebar', 'clean']);
export type TemplateId = z.infer<typeof TemplateId>;

export const CvHeader = z.object({
  name: z.string().min(1),
  title: z.string(),            // role/positioning line
  website: z.string().optional(),
  summary: z.string(),          // TAILORED short summary (KB holds the long one)
});

export const CvContact = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
});

export const CvExperience = z.object({
  kbExperienceId: z.string().uuid(),   // provenance → enforces truthfulness (§5.6)
  company: z.string(),
  role: z.string(),                    // "title" in original
  period: z.string().optional(),
  bullets: z.array(z.string()).min(1), // SELECTED & REPHRASED subset of bullets_full
});

export const CvEducation = z.object({
  kbEducationId: z.string().uuid().optional(),
  institution: z.string(),
  degree: z.string().optional(),
  period: z.string().optional(),
  note: z.string().optional(),
});

export const CvSkills = z.object({
  professional: z.array(z.string()),
  soft: z.array(z.string()),
});

export const CvLanguage = z.object({ name: z.string(), level: z.string() });

export const CvLeadership = z.object({       // sidebar "Leadership & Impact"
  name: z.string(),
  description: z.string(),
  url: z.string().optional(),
});

export const CvData = z.object({
  schemaVersion: z.literal(1),
  header: CvHeader,
  contact: CvContact,
  summary: z.string(),                 // canonical summary (header.summary mirrors)
  skills: CvSkills,
  experience: z.array(CvExperience),
  education: z.array(CvEducation),
  leadership: z.array(CvLeadership).default([]),  // rendered by 'sidebar' only
  languages: z.array(CvLanguage).default([]),     // rendered by 'clean' only
  photoUrl: z.string().optional(),                // sidebar circular photo
});
export type CvData = z.infer<typeof CvData>;
```

This is a strict superset of the original `cv-data.json` (`header`, `contact`, `skills.{professional,soft}`, `experience[].{company,period,title→role,bullets}`, `education[]`) plus `leadership`, `languages`, `photoUrl`, and the all-important `kbExperienceId` provenance pointer.

### 4.3 The `ThemeTokens` schema

Every value the two designs hardcode (catalogued in `cv-analysis.json`) becomes a token. Each template ships a **default theme**; the fit loop produces *bounded overrides* of the spacing tokens only.

```typescript
// lib/schemas/cv-data.ts (cont.)
export const ThemeTokens = z.object({
  id: z.string(),
  templateId: TemplateId,
  page: z.object({                // A4 @96dpi
    widthPx: z.number().default(794),
    heightPx: z.number().default(1123),
    safeBottomPx: z.number().default(12),  // one-page bottom margin guard
  }),
  font: z.object({
    family: z.string(),           // 'Lato' | 'Source Sans 3'
    baseSizePt: z.number(),       // body text
    scale: z.object({             // multipliers off base for each role
      name: z.number(), title: z.number(), sectionHeader: z.number(),
      body: z.number(), small: z.number(),
    }),
    lineHeight: z.number(),       // FIT-TUNABLE
    letterSpacingEm: z.object({ title: z.number(), header: z.number() }),
  }),
  color: z.object({
    primary: z.string(),          // sidebar navy #323b4c
    text: z.string(),             // body #737373 / #111
    accent: z.string(),
    onPrimary: z.string(),        // white text on sidebar
    rule: z.string(),             // dividers
    background: z.string(),
  }),
  layout: z.object({              // ALL fit-tunable within [min,max] ladder
    sidebarWidthPx: z.number().optional(),   // sidebar only
    pagePaddingPx: z.object({ top:z.number(),right:z.number(),bottom:z.number(),left:z.number() }),
    sectionGapPx: z.number(),               // FIT-TUNABLE
    entryGapPx: z.number(),                 // FIT-TUNABLE
    bulletGapPx: z.number(),                // FIT-TUNABLE
    skillGapPx: z.number(),                 // FIT-TUNABLE
  }),
  bullet: z.object({ style: z.enum(['disc','diamond','none']), color: z.string() }),
});
export type ThemeTokens = z.infer<typeof ThemeTokens>;
```

`sidebar-default.ts` reproduces `cv-main.html` exactly (navy `#323b4c`, Lato, 33px name, 206px sidebar). `clean-default.ts` reproduces `cv-clean.html` (Source Sans 3, centered uppercase header, 52px side padding, inline `·`-joined skills). Golden snapshot tests (§9) pin pixel fidelity against the originals.

### 4.4 One-page auto-fit algorithm (measure → tighten → re-measure)

Ported from the manual "tighten CSS spacing before trimming copy" rule. **Spacing tokens only are adjusted; copy is never silently cut.** Each tunable token has a `(default, min, step)` ladder. We tighten in priority order, re-render, re-measure, and stop as soon as the content fits.

```typescript
// lib/render-engine/fit.ts  (pure policy) + lib/pdf/render-pdf.ts (drives Chromium)

interface FitLadderStep { token: keyof ThemeTokens['layout'] | 'font.lineHeight'; min: number; step: number; }
const LADDER: FitLadderStep[] = [
  { token: 'bulletGapPx',  min: 1, step: 1 },
  { token: 'entryGapPx',   min: 3, step: 1 },
  { token: 'sectionGapPx', min: 4, step: 1 },
  { token: 'skillGapPx',   min: 3, step: 1 },
  { token: 'font.lineHeight', min: 1.25, step: 0.03 },  // last resort
];
const MAX_ITERS = 24;

// driver (pseudocode):
async function fitAndRender(cvData, templateId, baseTokens): Promise<{html, tokens, fits}> {
  let tokens = structuredClone(baseTokens);
  for (let i = 0; i <= MAX_ITERS; i++) {
    const html = renderToHtml(cvData, templateId, tokens);
    const { contentBottomPx } = await measureInPage(html); // see below
    const limit = tokens.page.heightPx - tokens.page.safeBottomPx;
    if (contentBottomPx <= limit) return { html, tokens, fits: true };
    if (!tightenOneNotch(tokens, LADDER)) {                // ladder exhausted
      return { html, tokens, fits: false };                // → UI: "trim content" CTA
    }
  }
  return { html: renderToHtml(cvData, templateId, tokens), tokens, fits: false };
}
```

**Measurement (`measureInPage`)** runs *inside* the Chromium page (the only source of truth for real layout/line-breaks), mirroring the manual bbox check:

```javascript
// injected into the page after setContent:
() => {
  const page = document.querySelector('.cv-page, body');
  let maxBottom = 0;
  // walk leaf text/box elements; ignore the sidebar fill (it intentionally
  // spans full height) by measuring content nodes only.
  document.querySelectorAll('[data-measure="content"] *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0) maxBottom = Math.max(maxBottom, r.bottom);
  });
  return { contentBottomPx: Math.ceil(maxBottom) };
}
```

Templates mark their content region with `data-measure="content"` so the always-full-height sidebar block does not falsely trip overflow. If the ladder is exhausted and content still overflows, we **do not clip** (we remove `overflow:hidden` from the production render so overflow is visible/measurable, unlike the original which hid it) — instead we return `fits:false`, surface the offending sections, and offer a one-click "reduce bullets" assist (which re-runs only the deterministic render, no LLM).

### 4.5 PDF approach decision

**Decision: Playwright (headless Chromium) running in the Node server process, with a single long-lived browser instance + a small page pool.** Not `@react-pdf`, not a serverless one-shot Chromium.

| Option | Verdict | Why |
|---|---|---|
| **Playwright headless Chromium (chosen)** | ✅ | Pixel-identical to the original Puppeteer output (same engine), full CSS/grid/flex/`@page` support, our designs already target Chromium. Playwright over Puppeteer for: better `browserType.launch` lifecycle, built-in waiting, first-class container Docker images, robust `page.pdf()`. A persistent browser + page pool amortizes the ~300 ms cold start across requests. |
| `@react-pdf/renderer` | ❌ | Its layout engine is a Yoga/flexbox subset — no CSS grid, limited text justification, different font metrics. Reproducing the McKinsey justified columns and the sidebar grid pixel-for-pixel would mean rebuilding both designs in a weaker primitive and losing fidelity. Rejected. |
| `chromium` via `@sparticuz/chromium` (serverless) | ⚠️ later | Only relevant if we ever deploy to AWS Lambda/Vercel. It cold-starts a fresh Chromium per invocation (slow, no pool) and caps at ~50 MB layers. We instead deploy a **long-lived Node container** where the standard Playwright Chromium and a warm pool work. Keep this in our back pocket only if forced onto serverless. |

**Local vs future deploy:** Locally, Playwright downloads its own Chromium (`npx playwright install chromium`) — no fragile `~/.cache/puppeteer` path-scanning like the original. For deploy, use the official `mcr.microsoft.com/playwright` base image (Chromium + all system libs preinstalled) on a long-lived container host (Fly.io/Render/VM). PDF gen is CPU-bound and memory-heavy; we cap concurrency with the page pool (e.g. 2–4 pages) and a queue.

```typescript
// lib/pdf/browser-pool.ts — singleton, reused across requests
let browser: Browser | null = null;
export async function getBrowser() {
  if (!browser || !browser.isConnected())
    browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  return browser;
}
// render-pdf.ts acquires a page, setContent(html,{waitUntil:'load'}), runs fit loop,
// page.pdf({ format:'A4', printBackground:true, margin:0 }), releases page.
```

### 4.6 Automated QA checks (port of the manual verification discipline → server assertions)

After PDF generation, `lib/qa/assertions.ts` runs (all deterministic; failures recorded in `artifacts.qa` and `usage_events`):

```typescript
export interface QaResult { fileSize:boolean; textExtraction:boolean; onePage:boolean; layout:boolean; pageCount:number; failures:string[]; }

// 1. file-size: 40_000 ≤ buffer.length ≤ 500_000
// 2. text-extraction: extract text from the PDF (pdf-parse) and assert a sample of
//    expected tokens (e.g. cvData.header.name, first company) appear → not a blank/clipped page.
// 3. one-page bbox: page_count === 1 AND the in-page measured contentBottomPx ≤ limit
//    (the authoritative overflow check; captured during the fit loop).
// 4. layout-integrity (type-aware):
//    - 'sidebar': rendered HTML/screenshot must contain the navy sidebar fill (token.color.primary
//      present on the .sidebar element) → guards against the sidebar collapsing.
//    - 'clean':  must NOT contain a colored sidebar block → guards against template bleed.
```

A failed QA result blocks artifact publication (status `qa_failed`) and is shown to the user with the specific failed assertion. The "agentic visual inspection" from the manual flow becomes an **optional** dev/CI step: render the page to PNG and run golden-image diffing (§9), not a per-request gate.

---

## 5. AI Provider Abstraction (BYOK)

### 5.1 The `LLMProvider` interface

```typescript
// lib/ai/provider.ts
export interface LLMProvider {
  readonly id: 'anthropic' | 'openai' | 'google';
  /** cheap auth/connectivity probe; no content. */
  validateKey(): Promise<{ ok: boolean; message?: string }>;
  /** LLM call #1 — resume text → structured KB extraction. */
  extractProfile(input: { rawText: string }): Promise<ExtractionResult>;
  /** LLM call #2 — (KB + JD) → tailored CvData + rationale. */
  tailor(input: { knowledgeBase: KnowledgeBaseForLLM; jdText: string; templateId: TemplateId })
    : Promise<TailorResult>;
}
```

Each adapter (`anthropic.ts`, `openai.ts`, `google.ts`) implements this using **provider-native structured output / tool-use** to guarantee schema-valid JSON:
- **Anthropic:** tool-use with `input_schema` = our JSON Schema; the model "calls" a single tool whose arguments are the result. (Messages API, e.g. Claude Sonnet.)
- **OpenAI:** Responses/Chat Completions with `response_format: { type: 'json_schema', json_schema, strict: true }`.
- **Google (Gemini):** `generationConfig.responseMimeType='application/json'` + `responseSchema`.

All outputs are re-validated with the corresponding **zod** schema server-side; a parse failure triggers one bounded repair retry (feed the validation error back), then a hard error. The provider abstraction normalizes token-usage reporting into `usage_events`.

### 5.2 How the key is supplied, validated, encrypted, and used

- **Supplied:** user pastes their key in Settings → Server Action `saveProviderKey(provider, key)`. The plaintext key exists in server memory for the duration of that request only.
- **Validated:** immediately call `provider.validateKey()` (a 1-token/`models.list` probe). On success store `validated_at` and `last4`.
- **Encrypted at rest — decision: app-level AES-256-GCM envelope encryption with a server master key, *not* an external KMS (for now).** Rationale: local-first, no cloud KMS dependency to run the app on a laptop; AES-256-GCM in Node `crypto` is authenticated (tamper-evident) and sufficient. We structure it as **envelope encryption** so swapping to a real KMS (AWS KMS / GCP KMS) later is a drop-in: a per-record data key (DEK) wrapped by the master key (KEK). The `key_version` column supports KEK rotation. **Trade-off:** the master key sits in an env var/secret on the host; compromise of the host compromises stored keys — accepted for a single-operator local-first app, with the migration path to KMS documented.

```typescript
// lib/crypto/envelope.ts
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
const KEK = scryptSync(env.MASTER_KEY_SECRET, 'cvgen-kek-v1', 32); // 256-bit
export function encryptKey(plaintext: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEK, iv);
  const ciphertext = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return { ciphertext, iv, authTag: c.getAuthTag(), keyVersion: 1 };
}
export function decryptKey(r: {ciphertext:Buffer; iv:Buffer; authTag:Buffer}) {
  const d = createDecipheriv('aes-256-gcm', KEK, r.iv);
  d.setAuthTag(r.authTag);
  return Buffer.concat([d.update(r.ciphertext), d.final()]).toString('utf8'); // plaintext in memory only
}
```

- **Used per request without logging:** `lib/ai/factory.ts` `resolveProvider(userId, provider)` loads the row (RLS-scoped), `decryptKey()` in memory, constructs the adapter, and **never** writes the plaintext or request/response bodies to logs. Logging middleware redacts `Authorization`/`x-api-key` headers and message content; only token counts, model id, latency, and status reach `usage_events`. The decrypted key is not retained beyond the request closure.

### 5.3 KB shape passed to the LLM

```typescript
export interface KnowledgeBaseForLLM {
  narrative: string;                 // career themes / positioning
  header: { name:string; title:string; website?:string; summaryLong:string };
  contact: { email?:string; phone?:string; location?:string; linkedin?:string };
  experiences: Array<{
    id: string;                      // kb_experiences.id — MUST be echoed back as kbExperienceId
    company: string; role: string; period?: string; location?: string;
    bulletsFull: string[];           // the superset the model SELECTS from
    angles: Array<{ label:string; jdSignals:string[]; bulletIdxs:number[] }>;
    tags: string[];
  }>;
  education: Array<{ id:string; institution:string; degree?:string; period?:string; note?:string }>;
  skills: { professional:string[]; soft:string[] };
  languages: Array<{ name:string; level:string }>;
}
```

### 5.4 Structured-output contract — LLM call #1 (extraction)

JSON Schema (abridged; full zod in `lib/schemas/llm-contracts.ts`). The model is told to extract **only what the resume supports**, leaving fields empty rather than inventing.

```jsonc
{
  "name": "extract_profile",
  "description": "Extract a structured career knowledge base from raw resume text. Do not invent facts.",
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["header","contact","experiences","education","skills"],
    "properties": {
      "header":  { "type":"object","required":["name"],
        "properties":{"name":{"type":"string"},"title":{"type":"string"},
                      "website":{"type":"string"},"summaryLong":{"type":"string"}}},
      "contact": { "type":"object","properties":{
        "email":{"type":"string"},"phone":{"type":"string"},
        "location":{"type":"string"},"linkedin":{"type":"string"}}},
      "experiences": { "type":"array","items":{ "type":"object",
        "required":["company","role","bulletsFull"],
        "properties":{
          "company":{"type":"string"},"role":{"type":"string"},
          "period":{"type":"string"},"location":{"type":"string"},
          "bulletsFull":{"type":"array","items":{"type":"string"}},
          "tags":{"type":"array","items":{"type":"string"}},
          // model proposes angles; user can edit later
          "angles":{"type":"array","items":{"type":"object",
            "required":["label","jdSignals"],
            "properties":{"label":{"type":"string"},
              "jdSignals":{"type":"array","items":{"type":"string"}},
              "bulletIdxs":{"type":"array","items":{"type":"integer"}}}}}
        }}},
      "education": { "type":"array","items":{"type":"object",
        "required":["institution"],
        "properties":{"institution":{"type":"string"},"degree":{"type":"string"},
                      "period":{"type":"string"},"note":{"type":"string"}}}},
      "skills": { "type":"object","required":["professional","soft"],
        "properties":{"professional":{"type":"array","items":{"type":"string"}},
                      "soft":{"type":"array","items":{"type":"string"}}}},
      "languages": { "type":"array","items":{"type":"object",
        "required":["name","level"],
        "properties":{"name":{"type":"string"},"level":{"type":"string"}}}}
    }
  }
}
```

### 5.5 Structured-output contract — LLM call #2 (tailoring)

Input to the model: `KnowledgeBaseForLLM` + `jdText` + `templateId`. Output:

```jsonc
{
  "name": "tailor_cv",
  "description": "Given the knowledge base (superset of TRUE facts) and a job description, SELECT and REPHRASE existing material into a one-page-targeted CvData. Never add experience, employers, dates, or claims absent from the knowledge base.",
  "input_schema": {
    "type":"object","additionalProperties":false,
    "required":["cvData","rationale","templateSuggestion","warnings"],
    "properties":{
      "cvData": {  // mirrors §4.2 CvData; experience items MUST carry kbExperienceId
        "type":"object",
        "required":["header","contact","summary","skills","experience","education"],
        "properties":{
          "header":{"type":"object","required":["name","title","summary"],
            "properties":{"name":{"type":"string"},"title":{"type":"string"},
                          "website":{"type":"string"},"summary":{"type":"string"}}},
          "contact":{"type":"object","properties":{ /* email/phone/location/linkedin */ }},
          "summary":{"type":"string"},
          "skills":{"type":"object","required":["professional","soft"],
            "properties":{"professional":{"type":"array","items":{"type":"string"}},
                          "soft":{"type":"array","items":{"type":"string"}}}},
          "experience":{"type":"array","items":{"type":"object",
            "required":["kbExperienceId","company","role","bullets"],
            "properties":{
              "kbExperienceId":{"type":"string"},   // provenance → truth check
              "company":{"type":"string"},"role":{"type":"string"},
              "period":{"type":"string"},
              "bullets":{"type":"array","items":{"type":"string"}}}}},
          "education":{"type":"array","items":{ /* institution/degree/period/note */ }},
          "leadership":{"type":"array"},"languages":{"type":"array"}
        }},
      "rationale": { "type":"array","items":{"type":"object",
        "required":["field","change","reason"],
        "properties":{
          "field":{"type":"string"},          // e.g. "experience[0].bullets"
          "change":{"type":"string"},          // human-readable summary of the edit
          "reason":{"type":"string"},          // why, tied to a JD signal
          "jdSignal":{"type":"string"}}}},
      "templateSuggestion": { "type":"string","enum":["sidebar","clean"] },
      "warnings": { "type":"array","items":{"type":"string"} }  // e.g. "JD wants Kubernetes; not in KB"
    }
  }
}
```

### 5.6 Prompt design + truthfulness guardrail enforcement

**Prompt design notes (both calls):**
- System prompt states the role and the hard rule verbatim: *"You may only use facts present in the provided knowledge base. Never invent employers, titles, dates, metrics, or skills. If the job description requires something the candidate has not done, do not add it — instead add a string to `warnings`."* (This is the productized form of `career-knowledge.md`'s "never invent experience" rule.)
- Tailoring instructions: select the most JD-relevant experiences/bullets (use `angles[].jdSignals`), rephrase truthfully toward the JD's language, reorder skills by relevance, write a JD-targeted summary, target one A4 page, suggest the template type.
- Few-shot: one compact KB+JD→output example to anchor the rationale format.

**Deterministic guardrail enforcement (post-LLM, not trusting the model):**
1. **Provenance check:** every `cvData.experience[i].kbExperienceId` must exist in the KB; companies/roles/periods must match the KB record for that id (exact for company/period; role may be rephrased but must map to the same KB experience). Mismatch → reject.
2. **No-new-employer check:** the set of companies in output ⊆ set in KB.
3. **Skill containment (soft):** output skills should derive from KB skills/tags; novel skills are flagged into `warnings` and highlighted in the UI diff for human approval rather than silently shipped.
4. **Numeric/claim sanity (best-effort):** flag bullets introducing numbers/metrics not present in the corresponding KB `bulletsFull` for human review.
Failures surface in the rationale/diff view; the user always reviews before download. This makes truthfulness a *code-enforced* invariant, not a prompt hope.

---

## 6. API Surface

Auth column: **S** = requires authenticated session (RLS-scoped). All inputs validated with zod before use.

### Server Actions (`'use server'`)

| Action | Input | Output | Auth |
|---|---|---|---|
| `saveKnowledgeBase` | `{ narrative?, header, contact, experiences[], education[], skills, languages[] }` | `{ knowledgeBaseId, version }` | S |
| `updateKbExperience` | `{ id, patch }` | `{ ok }` | S |
| `extractProfile` | `{ uploadId }` | `{ knowledgeBaseId, baselineCvDocumentId }` | S (1 LLM call) |
| `createBaselineDocument` | `{ knowledgeBaseId, templateId, themeId }` | `{ cvDocumentId }` | S (deterministic) |
| `createTailorJob` | `{ jdText, baselineCvDocumentId, templateId, themeId, provider? }` | `{ cvDocumentId, artifactId, qa, rationale, warnings, fits }` | S (≤1 LLM call, cached) |
| `regenerateRender` | `{ cvDocumentId, templateId?, themeId? }` | `{ artifactId, qa, fits }` | S (deterministic, 0 tokens) |
| `refitDocument` | `{ cvDocumentId }` | `{ artifactId, qa, fits }` | S (deterministic) |
| `editTailoredCv` | `{ cvDocumentId, cvDataPatch }` | `{ newCvDocumentId }` (new version) | S (deterministic) |
| `saveProviderKey` | `{ provider, key }` | `{ ok, last4, validated }` | S |
| `deleteProviderKey` | `{ provider }` | `{ ok }` | S |
| `testProviderKey` | `{ provider }` | `{ ok, message }` | S (1 cheap probe) |
| `updateSettings` | `{ defaultTemplate?, defaultThemeId?, defaultProvider? }` | `{ ok }` | S |
| `deleteDocument` | `{ cvDocumentId }` | `{ ok }` | S |

### Route Handlers

| Route | Method | Input | Output | Auth |
|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | OAuth flow | Auth.js | public→S |
| `/api/uploads` | POST | multipart resume file | `{ uploadId }` | S |
| `/api/artifacts/[id]` | GET | artifact id | 302 → signed Storage URL (after ownership check) | S |
| `/api/health` | GET | — | `{ ok, browser, db }` | public |

---

## 7. Auth & Security

- **Auth.js v5 config** (`lib/auth/config.ts`): Google OAuth provider, `@auth/pg-adapter` (Postgres adapter, service-role connection), **`session.strategy = 'database'`**, `callbacks.session` injects `session.user.id`. Sign-in restricted to Google; email allowlist optional via `signIn` callback for early private beta.
- **Session enforcement:** `(app)` layout and every Action/handler call `requireSession()` (`lib/auth/guards.ts`) → returns `userId` or throws/redirects. `userId` is the only identity ever passed to `withUser()`.
- **RLS enforcement:** §3.3 — RLS-enforced app role + transaction-local `app.user_id` GUC; service role confined to auth/storage-signing code paths.
- **Key encryption:** §5.2 — AES-256-GCM envelope, master key from secret, KMS migration path; plaintext never persisted or logged.
- **Input validation:** zod at every boundary (Action args, handler bodies, multipart fields, LLM outputs). `lib/env.ts` zod-validates env at boot (fail fast).
- **Rate limiting** (`lib/ratelimit`): per-user token bucket. Tight limits on the LLM paths (`extractProfile`, `createTailorJob`: e.g. 10/hour) and uploads (e.g. 20/hour); looser on deterministic renders. Local: in-memory bucket; deploy: Postgres- or Redis-backed.
- **File-upload safety:** client + server **MIME magic-byte sniff** (not just extension), **size cap 8 MB**, extension allowlist `[pdf,docx,txt]`, store under `{userId}/` namespace with random UUID names (never the user filename on disk), never execute/serve uploads inline (always `Content-Disposition: attachment` / signed download). **AV consideration:** no inline AV locally; for deploy, gate uploads through a ClamAV sidecar or an object-storage scan hook before extraction — documented as a deploy-time TODO, low risk because files are parsed for text, never executed.
- **Secrets management:** local `.env.local` (gitignored); deploy via host secret store. `.env.example` documents all names with placeholders. The Postgres app role and service role have distinct credentials.
- **Threat model summary:**
  | Threat | Mitigation |
  |---|---|
  | Cross-tenant data read | RLS on every table (denormalized `user_id`), non-BYPASSRLS app role, transaction-local GUC |
  | Stolen provider key | AES-256-GCM at rest, never logged, decrypted in-memory per request, `last4`-only in UI |
  | Malicious upload (RCE/XSS/zip-bomb) | Magic-byte sniff, size cap, no inline serving, random names, text-only parsing, signed download |
  | Prompt injection in resume/JD inflating claims | Deterministic provenance + no-new-employer + skill-containment checks (§5.6); human review of diff before download |
  | SSRF via "website"/links | Links rendered as text/PDF only; never fetched server-side |
  | Session theft | DB sessions (server-revocable), httpOnly secure cookies, short Storage-URL TTLs |
  | PDF engine resource exhaustion | Page-pool concurrency cap + queue + per-user rate limit + size assertions |
  | Secret leakage in logs | Redaction middleware; only token counts/latency/status logged |

---

## 8. Cost & Determinism

| Pipeline step | Det / LLM | Notes / caching |
|---|---|---|
| Resume upload + storage | Det | — |
| Text extraction (pdf/docx/txt → text) | Det | — |
| **Profile extraction (text → KB)** | **LLM #1** | Cached by `sha256(rawText)` per user; identical re-upload = free |
| KB persistence + human edits | Det | edits never re-call the LLM |
| Baseline CvData projection from KB | Det | pure selection/order |
| JD ingest + hash | Det | — |
| **Tailoring (KB+JD → CvData+rationale)** | **LLM #2** | Cached by `(userId, kbVersion, jdHash, templateId)`; re-render/re-theme/re-fit = free |
| Truthfulness guardrail checks | Det | provenance/containment |
| Render (CvData+tokens → HTML) | Det | pure function, snapshot-tested |
| Auto-fit loop (measure→tighten→re-measure) | Det | Chromium-measured, 0 tokens |
| PDF generation | Det | Chromium page pool |
| QA assertions | Det | file-size/text/one-page/layout |
| Artifact storage + signed URL | Det | — |

**Caching strategy:** (a) **extraction cache** keyed by text hash; (b) **baseline reuse** — the baseline CvData is computed once and reused as the tailor input; (c) **tailor cache** — re-call the LLM *only when the JD text or KB version changes*; changing template/theme or refitting reuses the stored CvData. This collapses the steady-state cost to **one tailor call per genuinely new JD**.

**Token-budget considerations:** the KB (not the whole resume) is sent to the tailor call, and only the fields the template needs; bullets are the superset but bounded. We cap KB size sent (truncate oldest/least-tagged experiences if a budget is exceeded) and record `prompt_tokens`/`completion_tokens` per call in `usage_events` so users see spend. Models are configurable per provider with a sensible default (mid-tier: Claude Sonnet / GPT-4-class / Gemini Pro) since the task is structured selection, not long-form generation.

---

## 9. Testing Strategy

- **Unit (no network, no DB):**
  - *Render engine:* `renderToHtml(cvData, template, tokens)` is pure → assert HTML structure, token application, escaping; **golden HTML snapshots** for both templates against the originals.
  - *Schemas:* zod round-trip / invalid-input rejection for `CvData`, `ThemeTokens`, LLM contracts.
  - *Fit algorithm:* given synthetic measured heights (inject a fake measurer), assert the ladder tightens in order, respects mins, terminates, and returns `fits:false` when exhausted.
  - *Provider adapters:* test against the **mock provider** and against recorded fixtures; assert schema-valid parsing, repair-retry on bad JSON, usage normalization. No real keys.
  - *Crypto:* encrypt→decrypt round-trip; tamper (flip a ciphertext byte) → auth-tag failure.
- **Integration:** local Supabase (or Postgres testcontainer) with migrations applied.
  - *DB + RLS:* connect as `app_user`, set `app.user_id`=A, assert user A cannot read/update/delete user B's rows for **every** table; assert service-role path can. This is the most important integration suite.
  - *Actions/handlers:* call `createTailorJob` end-to-end with the mock provider; assert document/artifact rows, QA result, cache hit on repeat.
- **E2E (Playwright):** happy paths — sign in (dev shim), upload resume, review KB, paste JD, tailor, see preview, download PDF; settings: add+test+delete a (mock) provider key.
- **PDF golden/snapshot tests:** render both templates with a fixed CvData+theme to PDF, rasterize to PNG, and pixel-diff against committed golden images (tolerance threshold) to catch design regressions; also assert the QA invariants (one page, size band, text present).
- **Testing without real API keys:** the **mock provider** (`lib/ai/mock.ts`) returns deterministic, schema-valid `ExtractionResult`/`TailorResult` derived from the input (echoes KB facts → guarantees provenance checks pass). Selected when `AI_PROVIDER=mock` or no key configured in dev. CI always uses it; real-provider adapters are exercised only by opt-in fixture/contract tests gated on a CI secret.

---

## 10. Local Dev & Config

**Supabase decision: local Supabase via the Supabase CLI (`supabase start`, Dockerized Postgres + Storage + Studio) for development; hosted Supabase later for deploy.** Rationale: local-first mandate, no cloud dependency to develop offline, migrations/seed run identically against both. Trade-off: requires Docker locally.

`.env.example`:
```bash
# ── App ──
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=                       # `openssl rand -base64 32`
NODE_ENV=development

# ── Auth.js Google OAuth (optional in dev; see dev shim) ──
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_DEV_LOGIN=true                # enables Credentials dev-login shim (dev only)
AUTH_ALLOWED_EMAILS=               # optional comma-list for private beta

# ── Database (local Supabase defaults) ──
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres        # service role
APP_DATABASE_URL=postgresql://app_user:app_pw@localhost:54322/postgres      # RLS-enforced role

# ── Supabase Storage ──
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=         # from `supabase start` output
SUPABASE_STORAGE_BUCKET_UPLOADS=uploads
SUPABASE_STORAGE_BUCKET_ARTIFACTS=artifacts

# ── Encryption ──
MASTER_KEY_SECRET=                 # `openssl rand -base64 48` ; wraps provider keys

# ── AI (BYOK — these are NOT app-wide keys; dev/test convenience only) ──
AI_PROVIDER=mock                   # mock | anthropic | openai | google
# real keys are entered per-user in the UI; the line below is dev-only override:
# DEV_AI_API_KEY=

# ── PDF ──
PLAYWRIGHT_CHROMIUM=               # optional explicit path; else Playwright-managed
PDF_MAX_CONCURRENCY=3
```

- **Run locally without real Google OAuth:** a **dev auth shim** — an Auth.js Credentials provider enabled only when `AUTH_DEV_LOGIN=true` (and `NODE_ENV!=='production'`) that signs you in as a fixed/seeded dev user without OAuth. Hard-disabled in production builds.
- **Run locally without real provider keys:** `AI_PROVIDER=mock` selects the mock provider; the whole pipeline (extraction, tailoring, render, PDF, QA) works end-to-end with zero spend and deterministic output.
- **Seed data (`supabase/seed.sql`):** a dev user + Roi's knowledge base translated from `career-knowledge.md`/`cv-data.json` (header, contact, the five experiences with full bullets + angles, three educations, skills), plus a baseline `cv_documents` row per template. Lets you exercise tailor/render immediately after `supabase db reset`.

---

## 11. Build Sequence (dependency-ordered, each milestone independently verifiable)

**M0 — Repo & tooling.** Next.js (App Router, TS) + Tailwind + shadcn/ui scaffold; eslint with dependency-direction rule; `lib/env.ts`. *Verify:* `next dev` serves a page; lint passes.

**M1 — Schemas (pure core).** `lib/schemas/*` — `CvData`, `ThemeTokens`, KB, LLM contracts (zod + inferred types + JSON Schema export). *Verify:* unit tests round-trip valid/invalid fixtures.

**M2 — Render engine (deterministic).** `Sidebar.tsx`, `Clean.tsx`, `themes/*`, `css.ts`, `render.ts`; self-hosted fonts. *Verify:* golden HTML snapshots match the original two designs given seed CvData; pure (no DB/network).

**M3 — PDF + auto-fit + QA.** `browser-pool.ts`, `render-pdf.ts`, `measure.ts`, `fit.ts`, `qa/assertions.ts`. *Verify:* render seed CvData → one-page A4 PDF in 40–500 KB; fit loop tightens an over-long CvData to fit; QA assertions pass; golden PNG diff.

**M4 — Database + RLS + Supabase local.** Migrations (all tables), RLS policies, `withUser`, query helpers, `supabase start` + seed. *Verify:* RLS integration suite — user A cannot touch user B's rows on every table; seed loads.

**M5 — Auth.js + dev shim.** Adapter, DB sessions, Google provider, dev-login shim, `requireSession()`, `(app)` guard. *Verify:* dev-login signs in; protected routes redirect when signed out; session row created/revoked.

**M6 — Provider abstraction + crypto + BYOK.** `LLMProvider`, mock + three adapters, `envelope.ts`, `factory.ts`, key Settings UI + actions. *Verify:* crypto round-trip/tamper tests; `saveProviderKey`/`testProviderKey` with mock; adapters parse fixtures.

**M7 — Hot path A (upload→extract→KB).** `/api/uploads`, `extractProfile`, KB editor UI + actions, baseline projection. *Verify:* upload seed resume → extracted KB (mock) → editable → baseline doc; extraction cache hit on re-upload.

**M8 — Hot path B (JD→tailor→render→PDF).** `createTailorJob`, tailor cache, guardrail checks, `regenerateRender`/`refitDocument`, tailor UI + preview + rationale/diff. *Verify:* paste JD → tailored doc + one-page PDF + rationale (mock); cache hit on repeat; guardrail rejects a poisoned mock output.

**M9 — Hardening.** Rate limiting, upload safety, log redaction, usage dashboard, error states/empty states, e2e Playwright happy paths. *Verify:* e2e suite green; rate limits enforced; no secrets in logs.

**M10 — Deploy prep (no deploy).** Playwright container image, hosted-Supabase migration parity, secret-store wiring, health checks, document the serverless-Chromium fallback and AV sidecar TODO. *Verify:* container builds and runs the full flow locally against hosted-Supabase staging.

Critical path: **M1 → M2 → M3** (the deterministic engine, provable with zero auth/DB/LLM) is the spine and should be rock-solid before anything multi-tenant is layered on. M4/M5 (tenancy) and M6 (BYOK) are independent and can interleave; M7/M8 depend on all prior.
