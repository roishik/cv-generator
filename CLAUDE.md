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
| M12 | Deploy prep (Dockerfile, no actual deploy) | - |

---

## Non-negotiables

1. TypeScript strict — no `any`, no `// @ts-ignore` without a comment explaining why.
2. ESLint dep-direction rule must stay active (enforces architectural boundaries).
3. Every boundary (action args, handler bodies, LLM output) validated with Zod.
4. The render engine (`lib/render-engine/**`) is pure — no DB, no fetch, no side-effects.
5. LLM is used for exactly 3 call types: (1) resume extraction, (2) JD tailoring,
   (3) natural-language profile editing ("Edit with AI"). Everything else —
   parsing, structuring, render, one-page-fit, PDF, QA, diff — is deterministic code.
6. Dev-login shim is HARD-DISABLED in production (`NODE_ENV !== 'production'`).
7. API keys are never logged; only `last4` chars shown in UI.
