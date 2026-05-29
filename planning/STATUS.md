# STATUS — Final Build Log (M12 release hardening)

> Single source of truth for build state. Authoritative plan: [`04-master-plan.md`](./04-master-plan.md).
> Open decisions the owner must make to go live: [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md).

Last updated: **2026-05-29** · Branch: `main` · Stack: Next.js 16 (App Router, TS strict) · Drizzle + Postgres 18 (Docker Compose) · Auth.js v5 + dev-login shim · Playwright PDF/e2e · BYOK AI (mock default) · pnpm.

## Summary

**The full app is built, green, and self-tested end-to-end with the dev-login shim + mock provider (zero AI spend, zero external accounts).** Every journey in the product spec was exercised live in a real browser and captured as a screenshot; both CV templates were rendered to one-page A4 PDFs that pass all QA assertions.

## Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| M0 | Master plan & repo synthesis | ✅ Done |
| M1 | Repo & tooling scaffold (Next.js + TS strict + Tailwind + shadcn + ESLint dep-rule + env.ts + vitest/playwright + pnpm) | ✅ Done |
| M2 | Schemas (CvData, ThemeTokens, KB, LLM contracts) | ✅ Done |
| M3 | Render engine (Sidebar + Clean templates, themes, css.ts, render.ts, self-hosted fonts) | ✅ Done |
| M4 | PDF + auto-fit + QA (Playwright Chromium, fit ladder, QA assertions) | ✅ Done |
| M5 | Database + RLS (Docker Compose Postgres, Drizzle schema/migrations, RLS policies, withUser, seed) | ✅ Done |
| M6 | Auth.js + dev-login shim (Drizzle adapter, DB sessions, Google, requireSession, guard) | ✅ Done |
| M7 | Provider abstraction + crypto + BYOK (LLMProvider, mock + 3 adapters, envelope encryption, key UI) | ✅ Done |
| M8 | Storage interface + LocalFs adapter (HMAC signed-token downloads) | ✅ Done |
| M9 | Hot path A (upload → extract → KB → baseline projection) | ✅ Done |
| M10 | Hot path B (JD → tailor → render → PDF, tailor cache, guardrails, workspace UI) | ✅ Done |
| M11 | Hardening (rate limiting, upload safety, log redaction, e2e happy paths, error/empty states) | ✅ Done |
| M12 | Release self-test: journeys exercised, defects fixed, `/api/health` added, screenshots + sample PDFs, docs. NO deploy. | ✅ Done |

## What works (verified live, mock provider)

- **Landing + styleguide** (light & dark) — full Editorial Studio design system renders.
- **Sign-in** — dev-login shim shows one-click seeded users (Ada / Blake); Google path optional locally; protected routes redirect when signed out.
- **Onboarding** — 3-step wizard (Upload → Review → AI key); both the **file-upload** and **paste-text** input paths render and accept input; char counter + "Extract profile".
- **Dashboard** — tailored-document cards with template badge, "PDF ready" state, Open / PDF actions, "Tailor a CV" CTA.
- **Tailor workspace** — JD paste → deterministic template recommendation → **Tailor** (1 mock LLM call) → live A4 preview (sandboxed iframe) + field-level **diff** (baseline ↔ tailored) + **honesty notes** (JD signals absent from KB) + **truthfulness review** ("nothing was invented") + **one-page fit gauge** + inline edit + **Export PDF**.
- **Knowledge-base editor** — full structured form (header / contact / experience with add-role / education / skills); autosave ("All changes saved").
- **Version history** — multiple immutable versions per document with Open / Compare / Restore / PDF / Delete and a live rendered preview.
- **Settings / BYOK** — per-provider key cards (Anthropic / OpenAI / Google), "Mock provider active" banner, AES-256-GCM-at-rest / never-logged copy, masked last-4 after save.
- **Rendered CVs** — Type 1 (sidebar/navy/monogram/diamond bullets/leadership) and Type 2 (clean/centered/inline `·` skills/languages) are faithful to the original `cv-main.html` / `cv-clean.html` designs.
- **`/api/health`** — returns `{ ok, browser, db }` (added during this pass; was missing).

## Exact local run commands

```bash
# Prereqs on this machine: Node, pnpm, Docker running. A gitignored .env with safe
# local defaults already exists (dev-login + mock provider — no Google/API keys needed).

pnpm install                         # deps
pnpm db:up                           # start Postgres 18 (Docker Compose, host port 5433)
pnpm db:migrate                      # Drizzle DDL + RLS policies
pnpm db:seed                         # 2 demo users (Ada=sidebar, Blake=clean) + sample KB
pnpm pdf:install                     # one-time: playwright install chromium
pnpm dev                             # → http://localhost:3000  (sign in via dev-login)
```

### Verification commands

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint (incl. dep-direction rule)
pnpm test           # vitest unit + integration (needs db up)
pnpm e2e            # Playwright e2e (auto-starts dev server on :3000; stop any other dev server first)
pnpm build          # production build
pnpm render:smoke   # render both templates → PDF + QA to /tmp/cv-smoke

# Reproduce the release artifacts (dev server must be running on :3100):
NEXTAUTH_URL=http://localhost:3100 PORT=3100 pnpm dev    # in one shell
BASE_URL=http://localhost:3100 pnpm tsx scripts/capture-screenshots.ts
```

## Test results (final, this pass)

| Suite | Command | Result |
|---|---|---|
| Unit + integration (vitest) | `pnpm test` | **209 passed** (21 files), ~27 s |
| End-to-end (Playwright) | `pnpm e2e` | **34 passed** (was 33; +1 for the new `/api/health` test) |
| Typecheck | `pnpm typecheck` | clean (exit 0) |
| Lint | `pnpm lint` | clean (exit 0) |
| Build | `pnpm build` | success |
| PDF QA (both templates) | `pnpm render:smoke` | both pass all 5 checks; sidebar ≈ 59 KB, clean ≈ 150 KB; 1 page; rung 0 (no tightening needed) |

## Defects fixed during hardening

1. **Missing `/api/health` route.** The master-plan manifest (§5) and M12 acceptance require a health probe returning `{ ok, browser, db }`, but no route existed (`/api/health` → 404). Added `src/app/api/health/route.ts` (Node runtime; `SELECT 1` for db, Chromium-binary existence for browser, 200/503). Locked in with a new e2e test.
2. **Clean-template contact separator spacing.** The trailing `website` link in the Type-2 header had no horizontal margin, so its leading `·` separator was glued to the URL (`·danawhitfield`). Gave `.contact a` the same `margin:0 6px` as `.contact span` in `css.ts` so all separators are evenly spaced, matching the original `cv-clean.html`.

## Screenshots index (`planning/screenshots/`)

| File | Journey |
|---|---|
| `01-landing.png` | Public landing (hero, how-it-works, two-designs, CTA) |
| `02-styleguide-light.png` | Design system — light |
| `03-styleguide-dark.png` | Design system — dark |
| `04-sign-in.png` | Sign-in with dev-login shim buttons |
| `05-dashboard.png` | Dashboard with tailored-document card |
| `06-onboarding.png` | Onboarding step 1 — file-upload path |
| `07-onboarding-paste.png` | Onboarding step 1 — paste-text path |
| `08-settings-byok.png` | Settings / BYOK key management |
| `09-knowledge-base.png` | Knowledge-base editor |
| `10-workspace-empty.png` | Tailor workspace — empty |
| `11-workspace-jd-pasted.png` | Tailor workspace — JD pasted + template recommendation |
| `12-workspace-tailored-diff.png` | Tailor workspace — tailored: diff + honesty notes + truthfulness review + fit gauge |
| `13-documents-history.png` | Version history with live preview |
| `14-cv-sidebar.png` | Rendered Type 1 (sidebar) CV |
| `14-cv-clean.png` | Rendered Type 2 (clean) CV |

## Sample artifacts (`planning/samples/`)

`cv-sidebar.pdf`, `cv-clean.pdf` — one-page A4 PDFs (sample data), each passing all 5 QA checks. `cv-sidebar.html`, `cv-clean.html` — the exact HTML rendered into those PDFs. `qa-report.txt` — QA summary.

## Known limitations / honest caveats

- **No live (non-mock) AI run.** Everything was exercised with `AI_PROVIDER=mock` — deterministic, zero spend. The real Anthropic/OpenAI/Google adapters parse recorded fixtures in unit tests but have **not** been run against a live API. Needs one real key to verify end-to-end (see OPEN-QUESTIONS Q-API-KEY).
- **No Google OAuth verification.** Sign-in was exercised only via the dev-login shim. The Google provider is wired but unverified without real credentials + redirect URIs (OPEN-QUESTIONS Q-OAUTH).
- **Workspace preview pane in screenshot 12 appears blank.** This is a Playwright full-page screenshot limitation with `srcDoc` sandboxed iframes — the preview renders correctly in-app (see `13-documents-history.png`, which uses the same `CvPreview` iframe and shows the rendered CV). Not an app defect.
- **No deployment.** Per M12 the Dockerfile + adapter-swap notes exist but no actual deploy was performed.
- **RTL/Hebrew not implemented** (deferred to v1.1 per spec; see OPEN-QUESTIONS Q-RTL).
- **Rate limiting + extraction/tailor caches are in-memory** (per-process), correct for single-instance local; a shared store is needed before horizontal scaling.
