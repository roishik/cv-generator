<div align="center">

# Tailor — AI-Tailored CV Builder

**Upload your resume once. Paste any job description. Get a beautifully designed, one-page CV tailored to that role — in seconds.**

</div>

---

Tailor turns the manual "rewrite my CV for every application" grind into a product. It learns your career once (resume upload + LLM extraction + your edits), stores it as a structured **knowledge base**, and for each job description it intelligently selects and rephrases the most relevant experience into one of two polished, recruiter-ready designs — then renders a pixel-accurate one-page PDF.

## Principles

- **Deterministic-first** — parsing, layout, rendering, PDF export, and one-page fitting are all pure code. The AI is used *only* where judgment is needed: deciding what's relevant and rewriting it truthfully to match the job.
- **Bring your own key (BYOK)** — choose your AI provider (Anthropic, OpenAI, or Google) and use your own API key. Your keys are encrypted and never logged.
- **Truthful** — the AI selects and rephrases from what you've actually done. It never invents experience.
- **Per-user & private** — Google sign-in; every user's data is isolated at the database layer.
- **Production-grade** — not a scrappy MVP. Clean SaaS UX, document versioning, and automated QA on every generated CV.

## Two designs

| Type 1 — Sidebar | Type 2 — Clean |
|---|---|
| Navy sidebar, photo, visual skill bullets. For tech, startups, product, AI/ML. | Single-column, conservative typography, no color. For consulting, finance, formal roles. |

## Status

🚧 Under active construction. See [`planning/`](./planning) for the full product spec, UX design, and technical architecture.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · PostgreSQL (Supabase, row-level security) · Auth.js (Google OAuth) · headless-Chromium PDF rendering · provider-agnostic AI layer.

---

<sub>Generalized from a personal deterministic CV-tailoring pipeline into a multi-tenant web product.</sub>
