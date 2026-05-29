# STATUS — Living Build Log

> The single source of truth for build progress. Each milestone agent updates the table row it completes (status + date + verification evidence) and fills in the "How to run locally" section as capabilities come online. Authoritative plan: [`04-master-plan.md`](./04-master-plan.md).

Last updated: **2026-05-29** · Branch: `main` · Stack: Next.js (App Router, TS strict) · Drizzle + Postgres (Docker Compose) · Auth.js v5 + dev-login shim · Playwright PDF/e2e · BYOK AI (mock default) · pnpm.

## Milestones

| ID | Milestone | Status | Verified (date / evidence) |
|----|-----------|--------|----------------------------|
| M0 | Master plan & repo synthesis | ✅ Done | 2026-05-29 — `04-master-plan.md` + `STATUS.md` committed & pushed to `origin/main` |
| M1 | Repo & tooling scaffold (Next.js + TS strict + Tailwind + shadcn + ESLint dep-rule + env.ts + vitest/playwright + pnpm) | ⬜ Not started | — |
| M2 | Schemas (pure core): CvData, ThemeTokens, KB, LLM contracts | ⬜ Not started | — |
| M3 | Render engine (deterministic): Sidebar + Clean templates, themes, css.ts, render.ts, self-hosted fonts | ⬜ Not started | — |
| M4 | PDF + auto-fit + QA (Playwright Chromium, fit ladder, QA assertions) | ⬜ Not started | — |
| M5 | Database + RLS (Docker Compose Postgres, Drizzle schema/migrations, RLS policies, withUser, seed) | ⬜ Not started | — |
| M6 | Auth.js + dev-login shim (Drizzle adapter, DB sessions, Google, requireSession, guard) | ⬜ Not started | — |
| M7 | Provider abstraction + crypto + BYOK (LLMProvider, mock + 3 adapters, envelope encryption, key UI) | ⬜ Not started | — |
| M8 | Storage interface + LocalFs adapter (HMAC signed-token downloads) | ⬜ Not started | — |
| M9 | Hot path A (upload → extract → KB → baseline projection) | ⬜ Not started | — |
| M10 | Hot path B (JD → tailor → render → PDF, tailor cache, guardrails, workspace UI) | ⬜ Not started | — |
| M11 | Hardening (rate limiting, upload safety, log redaction, e2e happy paths, error/empty states) | ⬜ Not started | — |
| M12 | Deploy prep — NO deploy (Dockerfile on Playwright base, health checks, adapter-swap notes) | ⬜ Not started | — |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · 🔴 Blocked.

## How to run locally

> _Placeholder — filled in as the build progresses. Target shape below; each `pnpm` script is wired up by the milestone that first needs it._

```bash
# 1. Prerequisites (already on this machine): Node, pnpm, Docker (running).
# 2. Install deps:                pnpm install            # [M1]
# 3. Copy env:                    cp .env.example .env.local   # then fill required vars (see 04 §6)
#    Minimal local set: AUTH_SECRET, AUTH_DEV_LOGIN=true, DATABASE_URL, APP_DATABASE_URL,
#                       STORAGE_SIGNING_SECRET, MASTER_KEY_SECRET, AI_PROVIDER=mock
# 4. Start Postgres:              docker compose up -d db  # [M5]
# 5. Migrate + seed:              pnpm db:migrate && pnpm db:seed   # [M5]
# 6. Install Chromium:            pnpm exec playwright install chromium   # [M4]
# 7. Run dev server:              pnpm dev                 # [M1]  → http://localhost:3000
# 8. Sign in:                     use the dev-login shim (no Google creds needed)  # [M6]
# 9. AI:                          AI_PROVIDER=mock runs extract/tailor with zero spend  # [M7]
```

### Useful scripts (to be added by milestones)
| Script | Purpose | Added by |
|---|---|---|
| `pnpm dev` | Next.js dev server | M1 |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | build / `tsc --noEmit` / ESLint | M1 |
| `pnpm test` | vitest unit + integration | M2 |
| `pnpm test:pdf` | PDF render + QA checks | M4 |
| `pnpm test:e2e` | Playwright e2e | M6 |
| `pnpm db:migrate` / `pnpm db:seed` | apply Drizzle + RLS migrations / seed dev data | M5 |
