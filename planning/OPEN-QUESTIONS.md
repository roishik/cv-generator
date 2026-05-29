# OPEN QUESTIONS — what Roi must provide / decide to go live

> One consolidated, answerable-in-one-sitting batch. The build is complete and green; **none of these block local development** (dev-login shim + mock provider cover everything). They block only a real, public, non-mock launch. Each item has a recommended default — if you agree with the default, just say "defaults" and we proceed.

---

## A. Secrets & credentials you must supply (hard blockers for a public launch)

### Q-OAUTH — Google OAuth credentials
We need a real Google Cloud OAuth 2.0 client so non-dev users can sign in (the dev-login shim is hard-disabled in production).
- **Provide:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Authorized redirect URIs to register** (Auth.js v5 callback shape):
  - `http://localhost:3000/api/auth/callback/google` (local testing)
  - `https://<your-domain>/api/auth/callback/google` (production)
- **Authorized JavaScript origins:** `http://localhost:3000` and `https://<your-domain>`.
- **Recommended default:** create one OAuth client in a dedicated Google Cloud project, "External" user type, start in "Testing" with your own email on the allowlist; promote to "In production" before public launch. Keep `AUTH_ALLOWED_EMAILS` set during private beta.

### Q-API-KEY — one real provider API key for live verification
Everything has only ever run against the deterministic **mock** provider. We need at least one real key to verify the live extraction + tailoring path end-to-end (real structured output, repair-retry, provenance gate) before launch.
- **Provide:** one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` (used once for a verification run; production keys are per-user/BYOK and entered in the UI).
- **Recommended default:** an Anthropic key — it's the recommended default provider (see Q-MODELS) and the cheapest path to a single confidence-building live run (well under $0.10).

---

## B. Confirmations (quick yes/no)

### Q-MODELS — per-provider default model IDs
The code currently defaults to (`src/lib/ai/provider.ts`):
- Anthropic: **`claude-sonnet-4-5`**
- OpenAI: **`gpt-4.1`**
- Google: **`gemini-2.5-pro`**
- **Note / cleanup:** `.env.example` still documents older example IDs (`claude-sonnet`, `gemini-1.5-pro`) that don't match the code defaults. We should align them.
- **Recommended default:** keep the three IDs above as the curated defaults (good quality/cost balance for select-and-rephrase tailoring), and fix `.env.example` to match. **Confirm these three are the IDs you want shipped.**

### Q-NAME — product name: "Tailor" vs "Lapel"
Shipped name is **Tailor** (README, UI, product spec); "Lapel" was a design-doc rebrand candidate, not adopted.
- **Recommended default:** ship as **Tailor**; revisit "Lapel" only if there's a trademark/domain conflict. **Confirm "Tailor".**

---

## C. §9 product decisions (from `01-product-spec.md`)

### Q-TRIAL — trial credit vs strict BYOK at v1
Do we eat the cost of one managed first extraction so users feel value before pasting a key, or require BYOK from minute one?
- **Recommended default:** **strict BYOK at v1** (mock covers dev; lowest cost/abuse exposure). Add a single managed "first extraction" credit later if activation data demands it.

### Q-PRICING — what we charge for (BYOK covers inference)
- **Recommended default:** **free with limits** for v1 to maximize adoption (limits already enforced via per-user rate limiting); introduce a paid "convenience" tier (hosted keys, higher limits, application tracking) once there's usage signal. Decide the headline limit numbers (current defaults: 10 LLM ops/hr, 20 uploads/hr).

### Q-RTL — Hebrew / RTL output: MVP or v1.1
Israel-first audience; real font + layout implications for both templates.
- **Recommended default:** **v1.1.** Ship English-only at v1; RTL is a scoped follow-up (mirrored layout + Hebrew-capable fonts in the render engine).

### Q-OSS — open-source posture
Repo is public. Does the hosted product stay open-source, and does that change the managed-credit/key stance?
- **Recommended default:** **keep the engine open-source** (the deterministic render/fit/QA core is a credibility asset and not the moat); keep any future hosted-convenience billing/infra in a private layer. No change to the strict-BYOK stance.

### Q-HONESTY — how loudly to market "never fabricate"
A genuine differentiator (provenance gate + honesty report are code-enforced), but it carries an implicit accuracy promise.
- **Recommended default:** **make it a primary marketing wedge** ("selects and rephrases your real experience — never invents") backed by the honesty report in-product, paired with plain "you are responsible for the final content" terms copy. Lawyer-review the public guarantee wording before launch.

---

## D. Nice-to-haves (non-blocking, note your preference)

- **Custom domain + TLS** for the production redirect URIs above (needed before Q-OAUTH production promotion).
- **Secret store** for production env (the master plan flags this as a M12 deploy note); confirm where prod secrets live (e.g. host env, Vault, platform secrets).
- **Shared store for rate limits + caches** before running more than one instance (currently in-memory per process).

---

### TL;DR — to unblock a live (non-mock) run today, send:
1. Google OAuth Client ID + Secret (+ confirm the redirect URIs above). 
2. One real provider API key (Anthropic recommended). 
3. "Defaults" if you accept every recommended default above — otherwise note the exceptions (name, trial, pricing limits, RTL timing, OSS, honesty positioning, model IDs).
