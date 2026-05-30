# Live Verification Report

**Date:** 2026-05-30T11:28:45.036Z  
**Mode:** Real provider APIs (no mocks)  
**Override:** AI_PROVIDER env was NOT changed in committed code; provider was instantiated directly in script.

---

## Step 1: Key Validation

| Provider  | Result |
|-----------|--------|
| Anthropic | ✓ PASS — key present and valid |
| OpenAI    | ✓ PASS — key present and valid |

---

## Step 2: Live Extraction (Anthropic)

- **Model used:** `claude-sonnet-4-6`
- **Experiences extracted:** 3
- **Skills extracted (professional + soft):** 21
- **Education entries:** 1
- **Schema valid:** ✓ yes

---

## Step 3: Live Tailoring (Anthropic)

| Template | Result | Diff entries |
|----------|--------|--------------|
| sidebar  | ✓ PASS | 0 |
| clean    | ✓ PASS | 10 |

Both templates returned schema-valid CvData with `kbExperienceId` fields referencing real KB entries.

---

## Step 4: Truthfulness Gate

| Variant     | Expected ok | Actual ok | Pass? |
|-------------|-------------|-----------|-------|
| Live output | true        | true | ✓ |
| Fabricated  | false       | false | ✓ |

- Live output flags (all warnings): 0
- Fabricated variant error flag kinds: unknown-kb-experience-id, new-employer

---

## Step 5: Render + PDF + QA

### Sidebar template
- **Rung used:** 0
- **Overall QA:** ✓ PASS

- PASS file-size-band: 65.7 KB (band 40–800 KB)
- PASS text-extraction-presence: found "Alex Morgan" in extracted text
- PASS single-page: page_count=1
- PASS one-page-bbox-fit: content bottom=1110px, page=1123px, bottom-margin=13px (need ≥12px)
- PASS layout-integrity: sidebar navy fill present

### Clean template
- **Rung used:** 0
- **Overall QA:** ✓ PASS

- PASS file-size-band: 181.9 KB (band 40–800 KB)
- PASS text-extraction-presence: found "Alex Morgan" in extracted text
- PASS single-page: page_count=1
- PASS one-page-bbox-fit: content bottom=839px, page=1123px, bottom-margin=284px (need ≥12px)
- PASS layout-integrity: clean template correctly has no navy sidebar fill

PDFs saved to `planning/samples/live-sidebar.pdf` and `planning/samples/live-clean.pdf`.

---

## Step 6: OpenAI Cross-Check

- **Key valid:** ✓ yes
- **Model used:** `gpt-5.4`
- **Extraction result:** ✓ schema-valid output
- **Notes:** gpt-5.4 worked as-is (with strict schema patch required for strict mode)

> **Schema note:** The production `OpenAIProvider` uses the shared `EXTRACT_PROFILE_JSON_SCHEMA` which was designed for Anthropic tool-use and omits `required` arrays on all-optional nested objects. OpenAI strict-mode `json_schema` requires `required` on every nested object. This is a known schema compatibility issue between providers; the cross-check uses a fully-strict patched schema to exercise the model call correctly.

---

## Summary

| Check | Pass? |
|-------|-------|
| Anthropic key valid | ✓ |
| OpenAI key valid | ✓ |
| Live extraction (Anthropic) | ✓ |
| Tailoring sidebar | ✓ |
| Tailoring clean | ✓ |
| Truthfulness gate — live | ✓ |
| Truthfulness gate — fabricated rejected | ✓ |
| Sidebar PDF QA | ✓ |
| Clean PDF QA | ✓ |
| OpenAI cross-check | ✓ |

---

## Cost Note

All API calls in this script use real tokens. Approximate cost estimate:
- Extraction (Anthropic): ~1–2K input + 1–2K output tokens ≈ <$0.01
- Tailoring × 2 (Anthropic): ~2–4K input + 2–3K output tokens each ≈ <$0.03
- OpenAI cross-check (extractProfile): ~1–2K tokens ≈ <$0.01
- Total estimated: < $0.10

No secrets were logged. Keys are referred to only as 'key present / key valid'.