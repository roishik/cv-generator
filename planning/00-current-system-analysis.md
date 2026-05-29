# 00 — Current System Analysis (Reverse-Engineering the Manual Workflow)

> Source: `/Users/roishikler/MEGA/job-hunt/2026/cv-editor`. This document is the ground truth that the product must generalize from a single-user CLI into a multi-tenant web product.

## 1. What the current system does

Roi maintains a **deterministic CV-tailoring pipeline** driven by Claude. Given a job description (JD), Claude rewrites his CV content to best fit the role while preserving one of two fixed visual designs, then exports a pixel-accurate PDF.

The key insight: **the design and rendering are 100% deterministic code; only the *content reasoning* uses the LLM.** This is exactly the cost/determinism split the product must preserve.

## 2. Architecture of the manual pipeline

```
career-knowledge.md   (narrative source of truth about the person + "angles")
        │  (read by the LLM/agent at session start)
        ▼
cv-data.json          (structured baseline content: header, contact, skills,
        │              leadership, experience[], education[])
        │
        ├── apply-changes.js  → mutates cv-data.json, then regex-regenerates
        │                       BOTH HTML templates from data-section/data-field attrs
        ▼
templates/cv-main.html (Type 1)   templates/cv-clean.html (Type 2)
        │
        └── generate-pdf.js → Puppeteer (headless Chrome) → A4 PDF, zero margin,
                              printBackground:true, viewport 794×1123
```

`cv-edit.sh --type=1|2 '<JSON change>'` is the one-command wrapper.

### Change-spec grammar (deterministic mutations)
- `{type:"text-replace", section, field, [index], value}` for header/contact/experience/skills/education
- `{type:"add-skill", category, value}`
- Bullets are edited by hand in `cv-data.json` (the script does not yet support per-bullet ops).

### Template binding mechanism
HTML carries `data-section`, `data-field`, `data-exp-index`, `data-edu-index`, `data-skill-index` attributes. `apply-changes.js` finds elements by these attributes (via regex, not a DOM parser) and replaces inner content. **CSS in the `<style>` block is never touched** — content regen is fully decoupled from design. This is the cleanest part of the design and we will formalize it (data + template = pure function).

## 3. The two designs (must be reproduced generically)

### Type 1 — "Sidebar" (`cv-main.html`)
- A4 (794×1123px @96dpi). CSS grid `206px | 1fr`.
- Left sidebar: dark navy `#323b4c`, white text, circular photo, Contact, Professional Skills, Soft Skills, Leadership & Impact (square diamond bullets).
- Right main: name (Lato 900, 33px, `#323b4c`), title (letter-spaced uppercase), website, summary (`#737373`), navy divider, Experience (vertical timeline w/ diamond nodes), Education, "References available upon request".
- Font: **Lato** (Google Fonts). Body text `#737373`.
- **Use for:** tech, startups, product, AI/ML — the default.

### Type 2 — "Clean / McKinsey" (`cv-clean.html`)
- A4, single column, ~52px side padding, no photo, no color blocks.
- Centered header (name uppercase 22pt, title, single-line contact row), justified summary, section titles with bottom rule, experience entries with `org | role` left + `period` right, justified bullets, skills rendered inline as ` · `-separated prose, languages line.
- Font: **Source Sans 3** (Google Fonts).
- **Use for:** consulting, finance, conservative/formal, senior IC.

### Design tokens already extracted (`cv-analysis.json`)
Colors, fonts, sizes, layout geometry are catalogued. We will turn this into a formal **theme token schema** so each template is a (tokens + layout) pair the renderer consumes.

## 4. The intelligence layer — what the LLM actually does

`career-knowledge.md` is the crown jewel. It is NOT just a CV; it is a **richer-than-the-CV knowledge base** with, per role:
- Full factual detail (more than fits on any one CV)
- **"Angles to highlight depending on job"** — explicit mapping from experience → which JD types it serves
- "Key career themes" for summary/positioning
- A hard rule: **never invent experience.** If the JD needs something the person hasn't done, say so.

So the LLM's job, given a JD, is:
1. Read the knowledge base (superset of facts).
2. Select & prioritize which experiences/bullets/skills are relevant to the JD.
3. Rewrite summary, titles, bullets, skill ordering to match the JD's language and priorities — truthfully.
4. Choose/confirm the template type.
5. Emit a **structured set of content changes** (the same shape as `cv-data.json`), which deterministic code renders.

This is the single most important thing to productize well, and the only step that should cost API tokens.

## 5. Verification discipline (must carry into the product as automated QA)

After every generation the manual process runs:
1. **File-size** check (40KB–500KB).
2. **Text-extraction** check (the new value appears).
3. **One-page-fit** check — extract text bboxes, assert lowest-y leaves ≥ bottom margin (overflow:hidden silently clips). **Mandatory.**
4. **Layout-integrity** check — type-aware (Type 1 must have navy sidebar fill; Type 2 must not).
5. **Agentic visual inspection** — render to PNG, eyeball against a per-type checklist; emit `VISUAL PASS/FAIL`.

Overflow handling rule: **tighten CSS spacing before trimming tailored copy.** The product must enforce one-page fit automatically (auto-fit loop) rather than relying on a human.

## 6. Implications for the product

| Manual artifact | Product generalization |
|---|---|
| `career-knowledge.md` (one person) | Per-user **profile knowledge base** (structured + freeform), populated by resume upload + LLM extraction + manual editing |
| `cv-data.json` (one baseline) | Per-user **structured CV document**, versioned; the canonical render input |
| Two HTML templates w/ hardcoded data | Two **generic, data-driven template renderers** (React components) with zero personal data; theme tokens externalized |
| `apply-changes.js` regex mutation | Pure **render(data, template) → HTML** function; no mutation, no regex |
| `cv-edit.sh` + Claude session | **Tailor pipeline**: deterministic parse/structure/render + a single LLM "content reasoning" call (provider-agnostic, BYOK) that returns structured changes |
| Puppeteer local Chrome | Server-side **headless Chromium PDF render** (same approach, containerized) |
| Manual verification checklist | Automated **QA + auto-fit** pipeline (one-page guarantee), with optional visual diff |
| Single user on a laptop | **Multi-tenant**: Google sign-in, per-user isolated data (Postgres + row-level security), each user brings their own provider API key |

## 7. Non-negotiable product principles (derived)

1. **Deterministic-first.** Parsing, structuring, layout, rendering, PDF, one-page-fit = pure code. LLM only for content relevance/rewriting.
2. **Truthfulness.** Never fabricate experience. The LLM selects and rephrases from the knowledge base; it does not invent.
3. **Design fidelity.** The two designs must look as polished as the originals; generic (no personal data baked in); pixel-accurate A4 PDF.
4. **BYOK, multi-provider.** User chooses Anthropic / OpenAI / Google and supplies their own key. Keys stored encrypted, never logged.
5. **Per-user isolation.** Every row scoped to a user; enforced at the database layer (RLS), not just the app.
6. **One-page guarantee.** Automated fit; tighten layout before cutting content.
7. **Productized, not scrappy.** Clean SaaS UX, onboarding, document management, version history.

## 8. Environment facts
- Node v24.9.0, pnpm 10.20.0, npm 11.6.0 available locally.
- GitHub: personal account `roishik` (active, repo scope). Public repo target.
- Target working dir: `/Users/roishikler/MEGA/Projects/cv-generator` (this repo).
