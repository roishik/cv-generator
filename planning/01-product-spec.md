# 01 — Product Specification

> Builds on `00-current-system-analysis.md`. This is the v1 product definition. Decisions are made; assumptions are stated inline as **[ASSUMPTION]**. Open items the founder must resolve are collected in §9.

**Working product name (placeholder):** **Tailor** — "one resume in, the right one-page CV out, for every job."

---

## 1. Vision & Positioning

**Product thesis.** Job seekers waste hours hand-tweaking a resume for every application, and the output is usually worse, not better — typos, layout breakage, inconsistent tone, two-page bloat. Tailor turns a person's full career history into a structured, truthful knowledge base once, then for each pasted job description produces a *polished, one-page, recruiter-grade CV* in seconds — by doing all the hard parts (layout, fit, PDF, structure) deterministically in code and using an LLM *only* to decide which true facts to surface and how to phrase them. Users bring their own AI key, so the product stays cheap to run and the user owns their cost and data.

**Who it's for.** Mid-career and early-career professionals in tech/AI/engineering/consulting who apply to many roles and care about a strong, design-quality CV but don't want to fiddle with formatting or risk a two-page mess. Initial wedge skews technical (PMs, engineers, data/AI, deep-tech) because the originating workflow is tuned there and these users will trust BYOK.

**The core wedge.** *"Two beautiful, fixed, one-page designs + a never-fabricate tailoring engine, for the price of your own API key."* We do not compete on infinite template choice (Canva, Novoresume) or on dishonest keyword-stuffing (most AI resume tools). We compete on: design fidelity, the one-page guarantee, truthfulness, and near-zero marginal cost via BYOK.

**What we are NOT (v1).** Not a cover-letter generator, not a job board, not a LinkedIn importer, not a multi-design playground, not a team/recruiter tool. Discipline here is the product.

---

## 2. Target Users & Jobs-To-Be-Done

### Primary persona — "Active Job Seeker" (Maya, 31, Senior PM)
Applying to 5–30 roles over a few weeks. Has a decent base resume but knows generic resumes underperform. Technically comfortable, willing to paste an API key. Cares about looking sharp and not lying.

| JTBD | Statement |
|---|---|
| J1 | When I find a role I want, **tailor my CV to its language and priorities in under a minute** without rewriting it myself. |
| J2 | **Never let me ship a broken or two-page CV** — guarantee it fits one page and looks designed. |
| J3 | **Keep me honest** — surface what I'm missing for a role rather than inventing it. |
| J4 | **Remember everything about my career once**, so I never re-enter it. |
| J5 | **Track which CV I sent where**, so I can reuse and follow up. |

### Secondary persona A — "Passive Upgrader" (Daniel, 38)
Employed, occasionally applies to a reach role. Low volume, high stakes. Values J2/J3 most; activation must survive a long gap between sessions.

### Secondary persona B — "Career Switcher" (Noa, 27)
Pivoting domains; the *angles* concept (re-framing the same experience for a different target) is the headline value. Heaviest user of the knowledge-base "angles" and the honesty gap surfacing.

---

## 3. Core User Journeys

### 3a. First-run onboarding (sign in → upload → extract → review → key)

1. **Land** on marketing page → click "Get started". One CTA.
2. **Sign in with Google** (OAuth). No password. On first sign-in, a user row + empty profile are provisioned.
3. **Upload resume** — drag/drop a PDF or DOCX (≤10 MB). [ASSUMPTION] one file at v1; LinkedIn export PDF works as a normal PDF.
4. **Deterministic parse** — server extracts raw text + structure (no LLM yet): see §6. A progress state shows "Reading your resume…".
5. **LLM extraction (one call)** — the user's chosen provider (or, if none yet, a *trial extraction* path; see §9 Q1) maps raw text → structured profile JSON + a first-pass knowledge base. Costs are shown ("~1 short request").
6. **Review & edit profile** — the extracted profile opens in the editor (§4). Fields flagged `low-confidence` are highlighted for confirmation. User fixes names, dates, bullets.
7. **Guided enrichment (skippable)** — the app asks 3–5 targeted questions to deepen the knowledge base (e.g. "What was the measurable result of X?", "Which roles is this experience strongest for?"). Answers merge into the KB. User can skip and do it later.
8. **Add a provider key** — user picks Anthropic / OpenAI / Google and pastes their API key. The key is validated with one cheap models-list/ping call, then encrypted at rest (§6). If they used a trial extraction in step 5, this is where they convert to BYOK.
9. **Done** — land on dashboard with the baseline profile saved and a prompt: "Paste a job description to make your first tailored CV."

**Activation = completing step 9 with a saved profile + a valid key.**

### 3b. Tailoring a CV to a JD (paste → template → generate → diff → edit → export)

1. **New tailored CV** — user pastes the JD text (or a URL; [ASSUMPTION] URL fetch is v1.1, paste-only at v1). Optional fields: company name, role title (auto-detected from JD, editable).
2. **Template selection** — app recommends **Type 1 (sidebar)** or **Type 2 (clean)** based on a deterministic heuristic over the JD (keywords: consulting/finance/government → Type 2; tech/startup/AI → Type 1) and lets the user override. Default Type 1.
3. **Generate (one LLM call)** — the engine sends {knowledge base + baseline structured CV + JD} and gets back a *structured set of content changes* (same shape as the CV document): reordered/rewritten summary, titles, bullets, skill ordering, which experiences to include/compress. **The LLM returns data, never HTML.** It also returns a short **rationale** and an **honesty report** (gaps; see §7).
4. **Deterministic render + auto-fit** — code renders the changed data into the chosen template and runs the one-page auto-fit loop (§6) until it fits or exhausts strategies.
5. **Review diff vs baseline** — a structured, field-level diff view (baseline ↔ tailored) per section, with the LLM's per-change rationale on hover. The honesty report is shown prominently if non-empty.
6. **Inline edit** — user edits any field directly in the live preview; edits re-run only the deterministic render + fit (no LLM call). User can revert any single change to baseline.
7. **Export PDF** — server renders headless-Chromium A4 PDF (zero margin, `printBackground`), runs automated QA (§6), and offers download. The tailored CV is saved as a versioned document tied to the application.
8. **Optional** — attach to an application record (company/role/status), see 3c.

### 3c. Returning user managing multiple tailored CVs / applications

1. **Dashboard** lists Applications (company · role · status · date · template) and a Documents library (every generated version).
2. **Reuse** — "Tailor again" from an existing application clones the JD context; "Duplicate & retarget" starts from another tailored CV.
3. **Edit profile / KB** — changes to the baseline profile prompt: "X tailored CVs were built from an older profile — regenerate?" (non-destructive; old versions are immutable).
4. **Application status** — light kanban-less list: `Saved → Applied → Interviewing → Offer → Closed`. Manual; no scraping.
5. **Re-export / version history** — every document keeps its versions; user can re-download any prior PDF.

---

## 4. The Knowledge-Base Concept (generalizing `career-knowledge.md`)

The KB is the per-user superset of truth — richer than any single CV. It is the **only** source the LLM may draw from; the structured CV (`cv-data.json` equivalent) is a derived, render-ready subset.

### Data model (per user)

| Layer | Contents | Source |
|---|---|---|
| **Identity & Targeting** | name, location, contact, links, languages, target roles, domains, work prefs | extraction + edit |
| **Experiences[]** | org, role, period, domain, *full* responsibilities/results (more than fits a CV), structured bullets, metrics | extraction + enrichment |
| **Experience → Angles[]** | per experience: tagged "use this for {role type}" framings (e.g. "0→1 founding" → startups; "SDKs+docs" → dev-platform) | enrichment + LLM-suggested, user-approved |
| **Education[] / Projects[] / Leadership[]** | structured + freeform notes, with "use when" tags | extraction + edit |
| **Skills** | professional + soft, with synonyms/aliases (for JD keyword matching) | extraction + edit |
| **Career themes** | freeform positioning statements used to seed summaries | enrichment |
| **Freeform notes** | catch-all markdown the user can dump anything into | edit |

Each fact carries a `confidence` (extracted vs user-confirmed) and a `source` (resume / user / llm-suggested). **Only user-confirmed facts are eligible for tailoring** unless the user opts in to use extracted-but-unconfirmed facts.

### How it's populated
1. **Extraction** (onboarding) — one LLM call fills the structured layers from the parsed resume; everything is `confidence: low` until confirmed.
2. **Progressive enrichment** — the app asks targeted, high-leverage questions over time: missing metrics, vague bullets, angle tagging, gaps revealed by tailoring sessions ("3 recent JDs wanted Kubernetes — have you used it?"). Each answer merges into the right layer.
3. **In-session capture** — when a user edits a tailored bullet into something *truer/richer*, the app offers to backfill that into the KB (mirrors the original "silently merge new facts" behavior, but with explicit consent rather than silent).

### Truthfulness guardrail (non-negotiable)
- The tailoring prompt is constrained: **select, prioritize, and rephrase from the KB only; never introduce a skill, tool, employer, metric, or claim not present.**
- The LLM must return an **honesty report**: JD requirements with no KB support → surfaced to the user, never silently papered over.
- For each, the LLM may suggest a **truthful angle** (a real adjacent experience reframed) but must label it as a reframe, not a new claim.
- A deterministic post-check flags any tailored bullet whose key nouns/skills don't trace back to a KB entry → "unverified claim" warning before export.

---

## 5. Feature List — MVP vs v1.1 vs Later

### MVP (v1, must-ship) — genuinely shippable, impressive, not bloated

| # | Feature | Notes |
|---|---|---|
| M1 | Google sign-in (OAuth), per-user provisioning | Single auth provider only |
| M2 | Resume upload (PDF/DOCX) + deterministic parse | One file; text + structure extraction in code |
| M3 | LLM extraction → structured profile + first-pass KB | One call; confidence-flagged |
| M4 | Profile editor (all sections) | Inline, validated, immutable-versioned baseline |
| M5 | Knowledge base: structured layers + freeform notes + per-experience angles | Editable; angles can be LLM-suggested + user-approved |
| M6 | JD input (paste) + company/role capture | Paste only |
| M7 | Template selection (Type 1 / Type 2) with heuristic recommendation | Two fixed designs, generic renderers |
| M8 | AI tailoring → structured changes + rationale + honesty report | One LLM call per generation |
| M9 | Structured field-level diff vs baseline | Per-change revert |
| M10 | Inline editing of tailored CV (no LLM) | Re-render deterministically |
| M11 | One-page auto-fit loop | Tighten layout before trimming copy; hard guarantee |
| M12 | PDF export (server headless Chromium, A4) + automated QA | File-size, text, one-page-fit, layout-integrity checks |
| M13 | BYOK key management (Anthropic/OpenAI/Google): add, validate, encrypt, rotate, delete | Never logged; one key per user at v1 |
| M14 | Document/version history (immutable versions, re-download) | Per tailored CV |
| M15 | Light application tracking (company, role, status, link to document) | Manual statuses |
| M16 | Dashboard listing applications + documents | The home surface |

### v1.1 (fast follow)

| # | Feature |
|---|---|
| V1 | JD from URL (server-side fetch + extract) |
| V2 | Guided enrichment as an ongoing, gamified flow ("profile strength" meter) |
| V3 | Multiple saved keys / per-generation provider+model choice |
| V4 | Visual diff preview (side-by-side rendered thumbnails) + agentic visual QA pass |
| V5 | "Regenerate stale CVs after profile change" batch action |
| V6 | DOCX export in addition to PDF |
| V7 | Trial/managed extraction credit so users can try before adding a key (see §9 Q1) |

### Later

| # | Feature |
|---|---|
| L1 | Cover-letter generation from the same KB |
| L2 | Additional templates / theme-token variants (still curated, not freeform) |
| L3 | LinkedIn / ATS-export ingestion |
| L4 | Multi-language CVs (Hebrew/English toggle) |
| L5 | Interview-prep notes derived from the KB + JD |
| L6 | Team/career-coach shared workspaces |
| L7 | Outcome tracking (callback/interview rates) feeding angle recommendations |
| L8 | **Creativity scale** — user-set control over how inventive tailoring may be when rewriting experience bullets (see below) |

**L8 — Creativity scale (detail).** A user-facing scale (e.g. a 0–100 slider or 3–5 named steps such as *Strict → Balanced → Bold*) set per generation, controlling how much latitude the tailoring LLM has when rewriting experience bullets:

- **Low creativity** — stay strictly within what the knowledge base states. Only rephrase, reorder, and re-emphasize facts that already exist; never add a skill, tool, or responsibility not present in the KB. This is today's MVP behavior.
- **High creativity** — allow the agent to surface *reasonable, role-implied* experience that isn't explicitly in the KB. Example: a software engineer almost certainly has some cloud exposure, so "cloud experience" may be inferred even if no bullet states it. The scale governs how far the model may extrapolate from what a person in that role plausibly did.

Open design points to resolve before building this:

- **Tension with the non-negotiable truthfulness guardrail (§4).** "Never fabricate" is currently an absolute. Any non-zero creativity is, by definition, asserting things the user did not state. This feature *cannot* ship without an explicit founder decision on whether the guardrail becomes a tunable spectrum rather than a hard wall — and how that is framed legally and in the UI.
- **Honesty report integration.** At minimum, every inferred (non-KB-grounded) claim must be flagged in the honesty report, visually distinct in the diff, and individually confirmable/revertable by the user — so "creative" additions are always opt-in, never silent.
- **Feedback loop into the KB.** If the user confirms an inferred claim ("yes, I did use AWS"), offer to write it back into the KB as a real fact, so the inference becomes grounded for future generations.
- **Scope of the scale.** Decide whether creativity affects only phrasing/emphasis (safe) or also factual content (risky), or whether those should be two separate controls.

---

## 6. Non-Functional Requirements

### Privacy & security
- **Per-user isolation enforced at the DB layer** (Postgres row-level security), not only in app code. Every row scoped to `user_id`.
- **API keys**: encrypted at rest with envelope encryption (per-row data key wrapped by a KMS master key); decrypted only in memory for the duration of a provider call; **never logged, never returned to the client after first save** (show last-4 only). Key validation uses the cheapest provider endpoint.
- **PII**: resume text and profile data treated as sensitive; **request/response bodies to providers are not logged**; only metadata (token counts, latency, status) is logged. No third-party analytics on profile/CV content.
- **Deletion**: account delete purges profile, KB, documents, keys, and uploaded files. Provide export-my-data.
- **Provider data**: BYOK means content goes to the user's chosen provider under the user's account/terms — surfaced clearly in onboarding.

### Performance targets

| Operation | Target | Determinism |
|---|---|---|
| Resume parse (structure/text) | < 3 s p95 | Deterministic |
| Extraction (LLM) | < 15 s p95 | LLM (1 call) |
| Tailoring generation (LLM) | < 12 s p95 | LLM (1 call) |
| Re-render after inline edit | < 500 ms p95 | Deterministic |
| Auto-fit loop | < 2 s p95 | Deterministic |
| PDF render + QA | < 4 s p95 | Deterministic |
| End-to-end "paste JD → PDF" | < 25 s p95 | 1 LLM call total |

### Accessibility
- WCAG 2.1 AA for the app UI: keyboard nav, focus states, ARIA on editor/diff, color contrast. The *CV output* designs are fixed print artifacts (not held to app a11y) but the preview must have a text-extractable, screen-reader-readable representation.

### Cost control (the heart of the determinism principle)
- **Exactly one LLM call per high-value action**: extraction (once per upload), tailoring (once per generate). Enrichment questions batch into single calls.
- **Everything else is pure code**: parsing, structuring, templating, render, auto-fit, PDF, QA, diff.
- **Caching/reuse**: extraction result cached against the file hash (re-upload of same file = no new call). Tailoring keyed on `hash(KB version + baseline version + JD + template)` so identical regenerations are free. Inline edits never call the LLM.
- **Token discipline**: send only the relevant KB slices when the KB is large (rank experiences by JD relevance deterministically before the call); use prompt caching where the provider supports it (stable KB prefix).

---

## 7. Edge Cases & Failure UX

| Case | Behavior |
|---|---|
| **Resume parses badly** (scanned image PDF, exotic layout) | Detect low text yield; offer OCR fallback [v1.1] or "paste your resume text" manual path; never fail silently. Extraction still runs on whatever text exists, fields flagged low-confidence. |
| **JD needs experience the user lacks** | Honesty report lists each gap. For each, offer (a) a truthful angle from the KB, labeled as a reframe, or (b) "leave it out." Never invent. Show a "match estimate" but frame it honestly. |
| **LLM/provider error** (timeout, 5xx, rate limit) | Retry once with backoff; on failure show the provider's error class (not raw payload), preserve the user's JD/inputs, offer retry. No charge state confusion — make clear no document was produced. |
| **Invalid/expired/over-quota API key** | Caught at validation on save and again at call time; clear message ("Anthropic rejected this key: invalid"). Block generation, deep-link to key settings. Never log the key. |
| **One-page overflow can't be resolved** | Auto-fit escalates: tighten spacing tokens → reduce optional sections (downplayed roles, references line) → suggest dropping the lowest-priority bullets *with user confirmation*. Never silently clip (the `overflow:hidden` trap). If still impossible, surface "this content can't fit one page — choose what to cut." |
| **Very long careers (15+ roles)** | KB holds everything; tailoring deterministically pre-selects top-N relevant experiences and compresses older ones to one line (mirrors the "downplay MU22" rule). User can pin/unpin roles. |
| **Empty/garbage JD** | Validate min length + that it reads like a JD; warn before spending an LLM call. |
| **Two providers disagree / model not available** | Pin a default model per provider; if unavailable, fall back to a known-good model and tell the user. |
| **Concurrent edits / stale baseline** | Baselines and documents are versioned and immutable; tailored docs record which baseline version they came from. |

---

## 8. Success Metrics

| Category | Metric | Target (initial) |
|---|---|---|
| **Activation** | % of signups that reach a saved profile + valid key | ≥ 60% |
| **Time-to-first-tailored-CV** | median from signup to first exported PDF | < 10 min |
| **Core value** | % of activated users who export ≥ 1 tailored CV in week 1 | ≥ 70% |
| **Generation success rate** | generations that pass QA + one-page fit on first pass | ≥ 95% |
| **Honesty engagement** | % of generations where the honesty report is viewed when non-empty | tracked (trust signal) |
| **Efficiency** | LLM calls per exported CV | ≤ 1 (excluding extraction) |
| **Retention** | % of users returning to tailor a 2nd+ distinct JD within 30 days | ≥ 40% |
| **Quality proxy** | inline-edit volume per generation (lower = better tailoring) | trend down |

---

## 9. Open Product Questions for the Founder (Roi)

- **Q1 — Trial without a key?** Do we eat the cost of a *managed* first extraction (or first tailored CV) so users can experience value before pasting a key, or is BYOK strictly required from minute one? This materially affects activation and our cost exposure. (Recommendation: a single managed extraction credit; everything else BYOK.)
- **Q2 — Pricing.** With BYOK covering inference, what do we charge for? Flat subscription, free-with-limits + paid tiers, or free/open-source with hosted convenience tier? Needed to shape limits and the dashboard.
- **Q3 — Hebrew/English.** Israel-first audience — is bilingual (RTL Hebrew) CV output an MVP requirement or v1.1? It has real rendering/font implications for both templates.
- **Q4 — Public/open-source posture.** The repo is public (per §8 of the analysis). Does the hosted product stay open-source, and does that change our stance on managed credits/keys?
- **Q5 — Provider default.** Which provider+model is the recommended default for tailoring quality vs cost, and do we curate a per-provider recommended model list?
- **Q6 — Liability framing on honesty.** How strongly do we want to position the "never fabricate" guarantee publicly (a marketing wedge) vs treat it as a quiet default? Affects legal copy and UX prominence.

---

## Cross-cutting decisions the architect & designer must internalize

1. **render(data, template) is a pure function.** No regex mutation, no personal data in templates. Templates are generic React/HTML + externalized **theme tokens**; the two designs are (tokens + layout) pairs.
2. **The LLM returns structured data + rationale + honesty report — never HTML, never layout.** One call for extraction, one per tailoring. Everything else is code.
3. **One-page fit is a code guarantee with an auto-fit loop** (tighten tokens → reduce optional content → confirm-before-cut). `overflow:hidden` clipping is a banned failure mode; QA must assert bottom-margin ≥ threshold.
4. **The KB is the only truth source; tailoring selects and rephrases, never invents.** Honesty report + deterministic unverified-claim check gate export.
5. **Multi-tenant isolation is enforced in Postgres (RLS), keys are envelope-encrypted, and provider request bodies are never logged.**
