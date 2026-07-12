# CLAUDE.md — cv-generator (Tailor)

## Project overview

AI-powered CV generator. Deterministic render engine + one-page guarantee. LLM used for exactly
two reasoning calls (extraction + tailoring). BYOK (Anthropic / OpenAI / Google). All design and
layout decisions live in pure TypeScript code — no LLM inference in the render path.

**Authoritative spec:** `planning/04-master-plan.md` — that file is the tiebreaker for all
architectural decisions. Read it before making any structural changes.

---

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Set up env (pre-filled with safe local defaults)
cp .env.example .env   # then edit — a generated .env already exists for dev

# 3. Start Postgres via Docker Compose
pnpm db:up

# 4. Run migrations + seed (available from M5 onwards)
pnpm db:migrate
pnpm db:seed

# 5. Start the dev server
pnpm dev
# → http://localhost:3000
```

---

## Key commands

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm lint` | ESLint (includes dep-direction rule) |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check |
| `pnpm test` | Vitest unit + integration tests |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm test:pdf` | Render→PDF→QA tests for both templates (needs `pnpm pdf:install` once) |
| `pnpm pdf:install` | `playwright install chromium` — required before any PDF render/test |
| `pnpm render:smoke` | Render both templates → PDF + QA to `/tmp/cv-smoke` (dev check) |
| `pnpm e2e` | Playwright e2e tests |
| `pnpm db:up` | Start Postgres container (`docker compose up -d db`) |
| `pnpm db:down` | Stop Postgres container |
| `pnpm db:migrate` | Apply Drizzle + RLS migrations (stub until M5) |
| `pnpm db:seed` | Seed dev data (stub until M5) |

---

## Environment variables

See `.env.example` for the full list with comments.

**Minimum to run locally (zero external accounts):**

```
AUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/cvgen
STORAGE_SIGNING_SECRET=<openssl rand -base64 32>
MASTER_KEY_SECRET=<openssl rand -base64 48>
AUTH_DEV_LOGIN=true
AI_PROVIDER=mock
```

The generated `.env` (gitignored) already has these filled in for local dev.

## Dev-login shim (M6)

When `AUTH_DEV_LOGIN=true` (and `NODE_ENV !== production`), the sign-in page
shows one-click buttons for seeded demo users. No Google credentials required.

```bash
# 1. Start the DB
pnpm db:up

# 2. Apply migrations + seed demo users
pnpm db:migrate && pnpm db:seed

# 3. Start dev server
pnpm dev
# → http://localhost:3000/sign-in
# Click "Ada Sample (sidebar)" or "Blake Fixture (clean)"
```

**Security:** the dev-login shim is HARD-DISABLED in production (`NODE_ENV=production`).
Two independent guards: the module-load check and the `authorize()` callback check.
Google creds stay optional locally — set them for real OAuth sign-in testing.

---

## Architecture

```
src/
  app/          — Next.js App Router pages and API routes
  components/
    ui/         — shadcn/ui primitives
    product/    — custom CV-specific components (from M3 onwards)
  lib/
    schemas/    — Zod schemas + inferred TS types (PURE, shared)
    render-engine/ — CvData + tokens → HTML (PURE, no DB/network)
    pdf/        — Playwright headless PDF rendering + auto-fit loop
    ai/         — LLM provider abstraction + mock
    crypto/     — AES-256-GCM envelope for provider keys
    storage/    — Storage interface + LocalFsStorage adapter
    db/         — Drizzle schema, client, RLS helpers, query helpers
    auth/       — Auth.js v5 config + session guards
    env.ts      — Zod-validated process.env (fails fast at boot)
```

**Dep-direction rule (enforced by ESLint):**
`lib/render-engine/**`, `lib/schemas/**`, `lib/ai/**` (except `factory.ts`) must NOT import
from `app/**`, `lib/db/**`, or `lib/auth/**`.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| ORM / DB | Drizzle ORM over Postgres 16 (Docker Compose) |
| Auth | Auth.js v5, Google OAuth + dev-login shim |
| PDF | Playwright headless Chromium |
| Validation | Zod (everywhere) |
| Tests | Vitest (unit) + Playwright (e2e) |
| Package manager | pnpm |

---

## Milestones

| M | Scope | Status |
|---|---|---|
| M1 | Scaffold (this commit) | Done |
| M2 | Schemas — CvData + ThemeTokens done (`lib/schemas/cv-data.ts`); KB/LLM contracts pending | Partial |
| M3 | Render engine (Sidebar.tsx, Clean.tsx, self-hosted fonts, deterministic HTML) | Done |
| M4 | PDF (Playwright pool) + auto-fit ladder + QA assertions | Done |
| M5 | Database + RLS (Docker Compose Postgres) | Done |
| M6 | Auth.js + dev-login shim | Done |
| M7 | Provider abstraction + BYOK crypto | - |
| M8 | Storage interface + LocalFs adapter | - |
| M9 | Hot path A: upload → extract → KB | - |
| M10 | Hot path B: JD → tailor → render → PDF | - |
| M11 | Hardening: rate limits, upload safety, redaction, e2e | - |
| M12 | Deployed to Google Cloud Run (`tailor` service, project `tailor-cv-generator`, region `europe-west1`). Runbook + redeploy flow: `docs/deployment/google-cloud.md` | Done |
| M13 | Monetization: Polar.sh credit packs on the managed key. Plan + infra decisions (Cloud SQL stays, auth stays): `planning/04-master-plan.md` §10 | Planned (deferred) |

---

## Research-backed roadmap (`research/FINDINGS.md`)

Harvested from the `MadsLorentzen/ai-job-search` investigation (the repo's
career-domain knowledge + three deterministic algorithms; see
`research/FINDINGS.md`, gitignored). The throughline is Tailor's signature move:
**soft prompt + hard code guarantee** — port the prose knowledge into prompts,
then promote every mechanically-checkable rule to a deterministic guardrail
(mirroring `truthfulness.ts`).

**Tier 1 + Tier 2 — implemented.**

| # | Item | Where |
|---|---|---|
| 1.1 | Writing-style rules (em-dash/cliché ban, demonstrate-don't-state, active voice, varied openers, forward-looking) | `lib/ai/prompts/tailor.ts` `## STYLE` |
| 1.2 | Interview-backtrack test + OK/Flag/Never reframe taxonomy | `lib/ai/prompts/tailor.ts` |
| 1.3 | `style-lint.ts` deterministic writing-style guardrail (warnings only) | `lib/ai/style-lint.ts` → workspace StyleReview |
| 1.4 | Relevance-weighted cut suggestions when the fit ladder exhausts | `lib/tailor/suggest-cuts.ts` → `needsReduction.cutSuggestions` |
| 2.1 | Deterministic JD↔CV fit assessment (skills/experience + verdict + gaps) | `lib/tailor/fit-score.ts` → workspace FitScore |
| 2.2 | Role-type framing + per-section page budget | `lib/ai/prompts/tailor.ts` `## FRAMING` |
| 2.3 | Cross-source consistency `reconcile()` (pure detector; not yet wired — see 3.1) | `lib/ai/reconcile.ts` |

**Tier 3 — forward roadmap** (bigger lifts; sequence after Tier 1–2):

| # | Feature | Scope | Recommendation |
|---|---|---|---|
| 3.1 | Multi-source profile ingestion | Build the KB from LinkedIn export + diplomas + reference letters + past CVs (additive, provenance-tagged). Wires up the already-built `reconcile.ts` (2.3) and pairs with the design-extraction vision. Source: `setup.md`, `expand.md`. | **PLAN** — biggest lift; do first. |
| 3.2 | Skill-gap / "upskill" heatmap | Aggregate the per-tailor "JD wants X; not in KB" gaps (now also emitted by `fit-score.ts`) into a frequency-weighted heatmap; keep any web-search learning plan out of the deterministic core. Source: `upskill/SKILL.md`. | **CONSIDER** — cheap heatmap; defer the web-search plan. |
| 3.3 | Cover-letter generation | One-page tailored cover letter alongside the CV. Needs a NEW LLM call type + a new render template. Source: `06-cover-letter-templates.md`. | **DEFER** — breaks the "2–3 calls" discipline; do deliberately, not opportunistically. |
| 3.4 | Opt-in reviewer/critique mode | Drafter → fresh-context reviewer → revise (structured old/new edits). ~2× tailor cost. Source: `apply.md`. | **CONSIDER (opt-in only)** — never the default; surface the extra cost. |

**Tier 4 — explicitly NOT adopted:** LaTeX rendering, the Danish job-portal
scrapers, `salary_lookup.py`, the headless-Gemini sub-agent, and the unbounded
multi-call CC-agent workflow style (all conflict with Tailor's web/multi-tenant,
deterministic, budgeted-call model). See `research/FINDINGS.md` §5–§6.

---

## Non-negotiables

1. TypeScript strict — no `any`, no `// @ts-ignore` without a comment explaining why.
2. ESLint dep-direction rule must stay active (enforces architectural boundaries).
3. Every boundary (action args, handler bodies, LLM output) validated with Zod.
4. The render engine (`lib/render-engine/**`) is pure — no DB, no fetch, no side-effects.
5. **Budgeted reasoning** — LLM is used for 3 call types: (1) resume extraction,
   (2) JD tailoring, (3) natural-language profile editing ("Edit with AI").
   Standard tier: ≤2 LLM calls per tailoring (draft + conditional truthfulness repair).
   Opt-in extended tier (BYOK only): ≤3 calls (draft + deterministic critic/revise + optional
   repair). Everything else — parsing, structuring, render, one-page-fit, PDF, QA, diff — is
   deterministic code with zero tokens. The truthfulness and one-page guarantees are unchanged.
6. Dev-login shim is HARD-DISABLED in production (`NODE_ENV !== 'production'`).
7. API keys are never logged; only `last4` chars shown in UI.
