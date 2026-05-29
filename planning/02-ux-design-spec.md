# 02 — UX & Visual Design Specification

> Companion to `00-current-system-analysis.md`. This document defines the brand, design system, component inventory, page-by-page UX, the two themeable CV output designs, responsive/accessibility rules, and the polish layer. It is written for an engineer + designer to build from directly. **Decisions are stated, not deferred.** The bar: *looks genuinely premium, not a scrappy AI MVP.*

Stack assumption: **Next.js (App Router) + Tailwind CSS + shadcn/ui (Radix primitives) + CSS variables for theming.** All tokens below are expressed so they drop into a Tailwind `theme.extend` + a shadcn `globals.css` `:root` / `.dark` block.

---

## 0. Design thesis (read this first)

Three forces shape every decision:

1. **The product makes documents that get someone hired.** It must feel *trustworthy, editorial, and precise* — closer to Linear / Stripe / a premium writing tool than to a chatbot. We are selling judgment, not novelty.
2. **The output is the hero.** The two CVs are the product. The app's job is to be a quiet, confident frame around a live document. The UI must never out-shout the artifact it produces. This pushes us toward a **calm, paper-forward, high-contrast-but-low-saturation** aesthetic.
3. **It is an AI product that must not look like an AI product.** We explicitly reject: purple→blue gradients, glowing orbs, "✨ Generate with AI" sparkle confetti, neon-on-black dashboards, glassmorphism everywhere. AI is *plumbing*, surfaced honestly (streaming, diffs, provenance) — never as decoration.

The resulting art direction: **"Editorial Studio."** Warm paper-white canvas, near-black ink, a single confident accent (deep spruce green), one functional warm-amber highlight for AI/diff states, generous whitespace, a serif display face paired with a precise grotesque for UI. It reads like a high-end stationery brand crossed with a developer tool.

---

## 1. Brand & art direction

### 1.1 Product name

**Working name:** Tailor.
**Recommendation: keep the concept, ship as → `Cut` is too terse; `Tailored` is taken-feeling. Final pick: **"Stitch" is owned by Google. → Final recommendation: **`Lapel`.**

Rationale for **Lapel**:
- A lapel is the part of a suit that signals fit, formality, and care — the exact emotional promise of a *tailored* CV. It is concrete, ownable, short (5 letters), trademark-clear in the SaaS space, and not an AI cliché.
- It lets us keep "tailor" language everywhere in the UI as a *verb* ("Tailor for this role") without naming collision, and the brand mark is a clean geometric notch/V-fold.
- Fallback names if `Lapel` is unavailable at trademark/domain check: **`Hemline`**, **`Selvedge`**, **`Inkwell`**. Avoid generic `CVTailor`, `ResuMate`, `JobFit*` (SEO mush, low prestige).

Throughout this spec the product is referred to as **Lapel**; the core action is **"tailor."**

### 1.2 Logo / mark

- **Mark:** a single folded-corner notch — a `⌐` like fold suggesting a lapel/dog-ear of paper, rendered as one continuous 2px stroke in a rounded square or as a standalone glyph. It doubles as a "page corner," tying brand → document.
- **Wordmark:** lowercase `lapel` set in the display serif (see §2.2), slightly tightened tracking, ink color. The dot/notch can replace the negative space of the `l` descender region — keep it subtle.
- **Do:** monochrome by default (ink on paper, paper on ink). **Don't:** gradients, 3D bevels, mascot.

### 1.3 Tone of voice

| Trait | We are | We are NOT |
|---|---|---|
| Register | Confident, concise, editorial | Bubbly, exclamatory, "Let's gooo" |
| AI framing | Honest assistant ("Drafted from your experience") | Magical ("AI magic ✨ in seconds!") |
| Errors | Plain, accountable ("We couldn't fit this on one page — here's why") | Cute/blaming ("Oops! Something went wrong 🙈") |
| Microcopy | Verbs, specifics | Filler, hype |

Voice examples:
- Empty state: *"No documents yet. Upload a resume and we'll build your profile."*
- Generating: *"Tailoring to the role… selecting your most relevant experience."*
- One-page fit: *"Fit to one page — tightened spacing, kept all content."*

### 1.4 Art direction principles

- **Paper, not glass.** Surfaces are warm off-white with hairline borders and soft, low, neutral shadows — like stacked cards/paper. No frosted glass, no heavy drop shadows.
- **Ink, not neon.** Text is a true near-black with a faint warmth. Accent is used sparingly and with intent.
- **Type does the work.** Hierarchy comes from the serif/grotesque pairing and scale, not from color or boxes.
- **Motion is physical and quick.** Things slide and settle (ease-out, 120–220ms). Nothing bounces, pulses, or shimmers gratuitously.
- **The document is sacred.** The live preview is rendered at true A4 proportions, never cropped misleadingly, always crisp.

---

## 2. Design system / tokens

### 2.1 Color palette

Philosophy: a **warm-neutral paper foundation**, **ink text**, **one brand accent (Spruce)**, **one AI/diff functional hue (Amber)**, plus standard semantic colors. Saturation is deliberately low so the CV preview (which has its own navy/black) never clashes.

#### Brand & neutrals (raw palette)

| Token | Hex | Use |
|---|---|---|
| `paper-50` | `#FBFAF7` | App background (light) — warm paper white |
| `paper-100` | `#F4F2EC` | Subtle raised surfaces, sidebars (light) |
| `paper-200` | `#E9E6DD` | Hairline borders, dividers (light) |
| `paper-300` | `#D8D4C8` | Stronger borders, disabled fills |
| `ink-900` | `#1A1B19` | Primary text (light) — warm near-black |
| `ink-700` | `#3C3E3A` | Secondary text |
| `ink-500` | `#6B6E67` | Muted text, captions |
| `ink-400` | `#8E9189` | Placeholder text |
| `spruce-700` | `#1F4A3D` | Accent pressed/dark |
| `spruce-600` | `#256B53` | **Primary accent** (buttons, links, focus) |
| `spruce-500` | `#2E8268` | Accent hover |
| `spruce-100` | `#DCEBE4` | Accent tint backgrounds |
| `amber-600` | `#B5740F` | **AI / diff "added" emphasis**, generation accent |
| `amber-500` | `#D98A1A` | AI hover |
| `amber-100` | `#F8ECD4` | AI tint / "added in this tailoring" highlight bg |

#### Semantic (light mode)

| Semantic token | Maps to | Hex |
|---|---|---|
| `success` | green | `#2E8268` (reuse spruce for cohesion) |
| `success-bg` | | `#DCEBE4` |
| `warning` | amber | `#B5740F` |
| `warning-bg` | | `#F8ECD4` |
| `destructive` | clay red | `#B23B2E` |
| `destructive-bg` | | `#F6E0DC` |
| `info` | slate | `#3C5A78` |

#### Dark mode (warm charcoal, not pure black)

Dark mode is a *studio at night* — warm charcoal, not the typical cold blue-black SaaS dark theme.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#16170F`… use → `#181814` | App background (warm charcoal) |
| `surface-1` | `#202019` | Cards |
| `surface-2` | `#2A2A22` | Raised / popovers |
| `border` | `#37372E` | Hairlines |
| `ink-on-dark-900` | `#F4F2EC` | Primary text |
| `ink-on-dark-500` | `#A9AB9F` | Muted text |
| `spruce-dark-primary` | `#4FB492` | Accent (lifted for contrast on dark) |
| `spruce-dark-tint` | `#16312A` | Accent tint bg |
| `amber-dark` | `#E0A341` | AI accent on dark |
| `amber-dark-tint` | `#3A2E14` | AI tint bg |

> **Decision:** Default theme is **light** (documents are read on white). Dark mode is fully supported for the app chrome, but **the CV preview pane is always rendered on its own white paper regardless of app theme** — you never edit a resume on a black background. In dark mode the preview sits in a darker "lightbox" frame with a subtle paper drop shadow.

### 2.2 Typography

Two app typefaces (distinct from the CV output fonts Lato / Source Sans 3, to keep brand and artifact separate):

- **Display / brand / large headings:** **Fraunces** (variable serif, "soft" optical setting, low contrast). Editorial, warm, premium — signals craft, not chatbot. Used for: logo wordmark, marketing H1–H2, dashboard greeting, empty-state headlines, large numbers.
- **UI / body / controls:** **Inter** (or **Geist Sans** if matching Vercel ecosystem). Neutral, legible at small sizes, excellent for dense tool UI.
- **Mono (rare):** **Geist Mono** / `ui-monospace` for API keys, token counts, JSON peeks, keyboard shortcuts.

> Rationale: a serif-display + grotesque-UI pairing is the signature of premium editorial/dev tools (Stripe, Linear lean grotesque-only; we add Fraunces to claim "craft + document"). It is the single biggest cheap win for "not an AI MVP."

#### Type scale (UI — Inter unless noted)

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display-xl` | 48 / 52 | Fraunces 480 | Marketing hero |
| `display-lg` | 36 / 42 | Fraunces 480 | Page hero, empty-state title |
| `heading-1` | 24 / 30 | Inter 600 | Screen title |
| `heading-2` | 18 / 26 | Inter 600 | Section title |
| `heading-3` | 15 / 22 | Inter 600 | Card title |
| `body` | 14 / 22 | Inter 400 | Default body |
| `body-sm` | 13 / 20 | Inter 400 | Secondary |
| `label` | 12 / 16 | Inter 500, +0.02em | Form labels, eyebrows (uppercase optional) |
| `caption` | 11 / 16 | Inter 400 | Meta, timestamps |
| `mono-sm` | 12 / 18 | Geist Mono 400 | Keys, counts |

### 2.3 Spacing, radius, shadow, motion

**Spacing** — 4px base scale: `0,1=4,2=8,3=12,4=16,5=20,6=24,8=32,10=40,12=48,16=64`. Page gutters: 24 (mobile) / 32 (tablet) / 48 (desktop). Card padding: 20–24.

**Radius** (intentionally restrained — premium ≠ super-round):
| Token | px |
|---|---|
| `radius-sm` | 6 |
| `radius-md` | 10 (default for cards, inputs, buttons) |
| `radius-lg` | 14 (modals, large panels) |
| `radius-full` | 9999 (avatars, pills) |

**Shadow** (soft, neutral, layered — paper not plastic):
| Token | Value |
|---|---|
| `shadow-xs` | `0 1px 2px rgba(26,27,25,0.05)` |
| `shadow-sm` | `0 1px 3px rgba(26,27,25,0.06), 0 1px 2px rgba(26,27,25,0.04)` |
| `shadow-md` | `0 4px 12px rgba(26,27,25,0.08), 0 2px 4px rgba(26,27,25,0.04)` |
| `shadow-lg` | `0 12px 32px rgba(26,27,25,0.12), 0 4px 8px rgba(26,27,25,0.06)` |
| `shadow-paper` | `0 2px 8px rgba(26,27,25,0.08), 0 16px 40px rgba(26,27,25,0.10)` — the CV preview lightbox |

**Motion principles:**
- Durations: `fast 120ms`, `base 180ms`, `slow 240ms`. Page/panel transitions ≤ 300ms.
- Easing: `ease-out` (`cubic-bezier(0.16,1,0.3,1)`) for entrances; `ease-in-out` for moves. **No bounce/spring on UI chrome.**
- Respect `prefers-reduced-motion`: replace transforms with instant + opacity-only fades.
- Hover: color/elevation shift in `fast`. Press: scale 0.985, never < 0.97.
- The only "delight" animations: the generation progress (§7) and the diff highlight settle.

### 2.4 Token mapping (Tailwind + shadcn CSS variables)

shadcn expects HSL-ish CSS variables under `:root` / `.dark`. Map the palette onto its contract:

```css
/* globals.css */
:root {
  --background: 48 33% 98%;        /* paper-50  #FBFAF7 */
  --foreground: 80 5% 10%;         /* ink-900   #1A1B19 */
  --card: 0 0% 100%;               /* pure white cards float on paper */
  --card-foreground: 80 5% 10%;
  --popover: 0 0% 100%;
  --popover-foreground: 80 5% 10%;
  --primary: 159 47% 28%;          /* spruce-600 #256B53 */
  --primary-foreground: 48 33% 98%;
  --secondary: 45 24% 94%;         /* paper-100 */
  --secondary-foreground: 80 5% 10%;
  --muted: 45 24% 94%;
  --muted-foreground: 90 3% 43%;   /* ink-500 */
  --accent: 38 86% 90%;            /* amber-100 tint */
  --accent-foreground: 36 86% 38%; /* amber-600 */
  --destructive: 5 59% 44%;        /* clay #B23B2E */
  --destructive-foreground: 48 33% 98%;
  --border: 42 22% 89%;            /* paper-200 */
  --input: 42 22% 89%;
  --ring: 159 47% 28%;             /* spruce focus ring */
  --radius: 0.625rem;              /* 10px = radius-md */

  /* product-specific (not shadcn defaults) */
  --ai: 36 86% 38%;                /* amber-600 — AI/diff emphasis */
  --ai-bg: 38 86% 90%;
  --diff-added-bg: 38 86% 90%;
  --diff-removed-bg: 5 59% 92%;
}
.dark {
  --background: 60 8% 9%;          /* warm charcoal #181814 */
  --foreground: 45 24% 94%;
  --card: 70 7% 12%;               /* surface-1 */
  --card-foreground: 45 24% 94%;
  --popover: 70 7% 14%;
  --popover-foreground: 45 24% 94%;
  --primary: 159 39% 51%;          /* spruce-dark #4FB492 */
  --primary-foreground: 60 8% 9%;
  --secondary: 70 7% 14%;
  --muted: 70 7% 14%;
  --muted-foreground: 80 5% 64%;
  --accent: 40 47% 16%;
  --accent-foreground: 38 70% 57%;
  --destructive: 5 55% 56%;
  --border: 70 8% 20%;
  --input: 70 8% 20%;
  --ring: 159 39% 51%;
  --ai: 38 70% 57%;                /* amber-dark */
  --ai-bg: 40 47% 16%;
}
```

```ts
// tailwind.config.ts (theme.extend excerpt)
extend: {
  colors: {
    border:'hsl(var(--border))', input:'hsl(var(--input))', ring:'hsl(var(--ring))',
    background:'hsl(var(--background))', foreground:'hsl(var(--foreground))',
    primary:{DEFAULT:'hsl(var(--primary))', foreground:'hsl(var(--primary-foreground))'},
    secondary:{DEFAULT:'hsl(var(--secondary))', foreground:'hsl(var(--secondary-foreground))'},
    muted:{DEFAULT:'hsl(var(--muted))', foreground:'hsl(var(--muted-foreground))'},
    accent:{DEFAULT:'hsl(var(--accent))', foreground:'hsl(var(--accent-foreground))'},
    destructive:{DEFAULT:'hsl(var(--destructive))', foreground:'hsl(var(--destructive-foreground))'},
    card:{DEFAULT:'hsl(var(--card))', foreground:'hsl(var(--card-foreground))'},
    ai:{DEFAULT:'hsl(var(--ai))', bg:'hsl(var(--ai-bg))'},
  },
  fontFamily:{
    serif:['var(--font-fraunces)','Georgia','serif'],
    sans:['var(--font-inter)','ui-sans-serif','system-ui','sans-serif'],
    mono:['var(--font-geist-mono)','ui-monospace','monospace'],
  },
  borderRadius:{ lg:'var(--radius)', md:'calc(var(--radius) - 4px)', sm:'calc(var(--radius) - 6px)' },
  boxShadow:{
    xs:'0 1px 2px rgba(26,27,25,0.05)',
    sm:'0 1px 3px rgba(26,27,25,0.06),0 1px 2px rgba(26,27,25,0.04)',
    md:'0 4px 12px rgba(26,27,25,0.08),0 2px 4px rgba(26,27,25,0.04)',
    lg:'0 12px 32px rgba(26,27,25,0.12),0 4px 8px rgba(26,27,25,0.06)',
    paper:'0 2px 8px rgba(26,27,25,0.08),0 16px 40px rgba(26,27,25,0.10)',
  },
}
```

---

## 3. Component inventory

### 3.1 shadcn/ui primitives used (as-is, restyled by tokens)
`Button`, `Input`, `Textarea`, `Label`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Tabs`, `Dialog`, `Sheet` (mobile drawers), `Popover`, `DropdownMenu`, `Tooltip`, `Toast` (sonner), `Card`, `Badge`, `Separator`, `Skeleton`, `ScrollArea`, `Accordion`, `Avatar`, `Progress`, `Alert`, `Command` (⌘K palette), `Collapsible`, `HoverCard`, `Breadcrumb`, `Resizable` (split-pane).

### 3.2 Custom components (the product's signature pieces)

| Component | Purpose / behavior |
|---|---|
| **`CvPreview`** | Renders a CV `document` + `theme` (Type 1 or 2) at true A4 (794×1123). Wrapped in `PreviewFrame` (paper lightbox + shadow). Scales to fit container via CSS `transform: scale()` with a measured zoom; exposes 50–150% zoom + "fit width." Single source of truth shared by edit + export. |
| **`PreviewFrame`** | The lightbox around `CvPreview`: paper shadow, page-edge, optional page-overflow ruler line at y=1123, zoom controls, "Type 1 / Type 2" segmented switch. |
| **`OnePageFitIndicator`** | A status chip + thin gauge showing vertical fill (e.g. "94% — fits"). States: `fits` (spruce), `tight` (>92%, amber), `overflow` (clay, with "Auto-fit" action). Tooltip explains what auto-fit did. |
| **`TemplatePickerCard`** | Selectable card showing a *real miniature render* (not a static png) of Type 1 / Type 2 with the user's own data, name, "best for…" tag, radio-selected state. |
| **`JdPasteBox`** | Large focused textarea with char/■token estimate, paste-detection, optional "paste from URL"/file, and a "Detected role: …" inferred chip. Sticky "Tailor" CTA. |
| **`TailorDiffViewer`** | Inline, field-aware diff between baseline document and tailored result. Per field shows added (amber underline/bg), changed (strike-old → new), reordered (↕ badge). Toggle "Show changes" on the preview; click any change → jump to source field. |
| **`KnowledgeBaseEditor`** | The profile editor: structured sections (header, experience[], education[], skills, leadership) + a freeform "career narrative / angles" panel (the `career-knowledge.md` analog). Inline add/reorder/delete, drag handles, autosave. |
| **`ExperienceEntryEditor`** | Repeating block: company, title, period, bullets[] (each bullet editable, AI-rewrite-per-bullet optional later), "angles to highlight" tags. |
| **`ApiKeyManager`** | BYOK panel: provider tabs (Anthropic / OpenAI / Google), masked key input, "Test connection" with live status, model picker, never-logged notice, encrypted-at-rest badge. |
| **`GenerationProgress`** | Streaming, step-aware progress for a tailor run (read KB → select → rewrite → render → fit-check). Not a spinner; a labeled checklist that fills. |
| **`PhotoUploader`** (Type 1) | Optional circular photo upload w/ crop; graceful fallback (monogram initials on muted fill) when absent. |
| **`DocumentCard`** | Dashboard/version tile: mini render thumbnail, title (role/company tailored for), date, template badge, status (draft/exported), actions. |
| **`DiffField` / `EditableField`** | Click-to-edit inline field used inside preview-adjacent edit list; shows provenance dot (kept / rewritten / added by AI). |
| **`ProviderBadge`**, **`TokenCostMeter`** | Show which model produced a draft and an estimated token/cost readout (BYOK transparency). |
| **`StepRail`** | Slim vertical/horizontal progress rail used in onboarding wizard. |
| **`EmptyState`** | Standardized illustration-light empty states (serif headline + 1 action). |
| **`CommandPalette`** | ⌘K: jump to doc, new tailor, switch template, go to settings. |

---

## 4. Page-by-page UX

Global chrome (authed app): a **left icon+label nav rail** (collapsible, 240px → 64px), **top bar** (breadcrumb, ⌘K trigger, theme toggle, avatar/menu). Content max-width 1280 except the tailor workspace (full-bleed). Light mode default.

```
┌──────────────────────────────────────────────────────────────┐
│ lapel        Home / Tailor for "Senior PM"        ⌘K  ☾  (RS) │  top bar
├───────┬──────────────────────────────────────────────────────┤
│ ◉ Home│                                                        │
│ ✎ Tail│                  page content                         │
│ ▤ Docs│                                                        │
│ ☰ Prof│                                                        │
│ ⚙ Sett│                                                        │
└───────┴──────────────────────────────────────────────────────┘
```

### 4.1 Marketing / landing (public)

Purpose: convert a job-seeker who's tired of manually re-tailoring. Sell *fit + truthfulness + one page + your design*.

Layout:
```
┌──────────────────────────────────────────────────────────┐
│  lapel                              Sign in   [ Get started ]│
├──────────────────────────────────────────────────────────┤
│                                                            │
│   One résumé. Tailored to every role.        [ paper card  │
│   (Fraunces display-xl, ink)                   showing a   │
│                                                live CV w/   │
│   Paste a job description. Lapel rewrites      diff anim ]  │
│   from your real experience — truthfully —                 │
│   and renders a one-page, designer CV.                     │
│                                                            │
│   [ Continue with Google ]   No résumé fabrication.        │
│                                                            │
├──────────────────────────────────────────────────────────┤
│  How it works:  Upload → We build your profile → Paste JD  │
│                 → Tailor → Export PDF   (3 small cards)     │
├──────────────────────────────────────────────────────────┤
│  Two designs (side-by-side Type 1 / Type 2 real renders)   │
│  Bring your own AI key (provider logos)                    │
│  Footer                                                     │
└──────────────────────────────────────────────────────────┘
```
- Hero visual = the actual `CvPreview` with a looping, tasteful diff highlight (amber underline appears on a summary line) — proves the product in one glance.
- No stock photos, no purple gradient. Background = paper-50 with a faint paper grain texture (≤3% opacity).
- States: static, no loading concerns. Respect reduced-motion (freeze hero animation).

### 4.2 Sign-in

Single centered paper card. Google is the only method (per spec). Minimal, fast.
```
┌───────────────────────────────┐
│            ⌐ lapel             │
│      Welcome back.             │  (Fraunces)
│                                │
│  [  G   Continue with Google ] │
│                                │
│  By continuing you agree to    │
│  Terms · Privacy               │
└───────────────────────────────┘
```
- Loading: button → spinner + "Connecting to Google…".
- Error: inline `Alert` (destructive) "Sign-in failed. Try again." Never a modal.

### 4.3 Onboarding wizard (first run)

Goal: get from zero → a usable profile → first tailored CV with delight. **Decision: a 3-step guided wizard, single-purpose per step, skippable to dashboard but strongly nudged.** Uses `StepRail`.

```
Step 1 — Upload                Step 2 — Confirm profile          Step 3 — Add your key
┌───────────────────────┐      ┌───────────────────────────┐    ┌────────────────────────┐
│  ● ─── ○ ─── ○         │      │  ● ─── ● ─── ○            │    │  ● ─── ● ─── ●         │
│                        │      │ We extracted this from     │    │ Bring your own AI key   │
│  Drop your resume      │      │ your resume. Edit anything.│    │ (Anthropic/OpenAI/Google│
│  ┌──────────────────┐  │      │ ┌───────────┬───────────┐ │    │ [ provider tabs ]       │
│  │  ⬆  PDF / DOCX    │  │      │ │ profile   │ live      │ │    │ [ key ……………  ] Test    │
│  │  drag & drop      │  │      │ │ editor    │ preview   │ │    │ Encrypted, never logged.│
│  └──────────────────┘  │      │ └───────────┴───────────┘ │    │ [ Finish → Dashboard ]  │
│  or paste text         │      │ [ Looks good → ]           │    └────────────────────────┘
└───────────────────────┘      └───────────────────────────┘
```
- **Step 1:** dropzone; on upload show parsing skeleton + streamed "Reading your experience… found 5 roles, 2 degrees."
- **Step 2:** the `KnowledgeBaseEditor` with a live `CvPreview` (Type 1 default) so they see their data become a CV *immediately* — the first delight moment. Confidence flags on low-confidence extractions (amber dot + "verify").
- **Step 3:** BYOK. Allow "Add later" (then tailoring is gated until a key exists, with a clear prompt).
- Empty/error: bad file → "We couldn't read that file. Try a PDF or paste the text." Extraction partial → keep what parsed, flag gaps.

### 4.4 Dashboard / Home

Purpose: relaunch the core loop fast; manage documents.
```
┌──────────────────────────────────────────────────────────────┐
│  Good evening, Roi.                         [ + Tailor a CV ]  │  (Fraunces greeting)
│  Your profile is 92% complete · 4 documents                    │
├──────────────────────────────────────────────────────────────┤
│  Continue                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ thumb    │ │ thumb    │ │ thumb    │   recent tailored docs │
│  │ Sr PM ·  │ │ AI PM ·  │ │ Cons. ·  │   (DocumentCard grid)  │
│  │ Type1    │ │ Type1    │ │ Type2    │                       │
│  └──────────┘ └──────────┘ └──────────┘                       │
├──────────────────────────────────────────────────────────────┤
│  Your profile  [ Edit knowledge base → ]                       │
│  Settings · API keys · Templates                               │
└──────────────────────────────────────────────────────────────┘
```
- Empty (post-onboarding, no tailors yet): big `EmptyState` — Fraunces "Tailor your first CV" + primary CTA + a faint preview of their profile rendered.
- Loading: `DocumentCard` skeletons (thumbnail block + 2 text lines).
- Error: non-blocking toast + retry; cards that fail to thumbnail show a neutral placeholder.

### 4.5 Profile / Knowledge-base editor

Purpose: the durable source of truth (superset of any CV). Two-pane: structured editor + live preview, with a dedicated **"Career narrative & angles"** freeform area (the productized `career-knowledge.md`).

```
┌───────────────────────────────────────────────┬──────────────┐
│  Profile                          autosaved ✓   │  Live preview │
│  ┌───────────────────────────────────────────┐ │  ┌──────────┐ │
│  │ Header   name · title · summary · website │ │  │  A4 CV   │ │
│  ├───────────────────────────────────────────┤ │  │ (Type 1) │ │
│  │ Experience  [⋮⋮] BAND ………………  [edit][×]   │ │  │          │ │
│  │             [⋮⋮] Mobileye …………  [edit][×]   │ │  │          │ │
│  │             [ + Add role ]                 │ │  │  zoom 70%│ │
│  ├───────────────────────────────────────────┤ │  └──────────┘ │
│  │ Education · Skills · Leadership            │ │              │
│  ├───────────────────────────────────────────┤ │  [ Type1|Type2]│
│  │ Career narrative & angles  (freeform)      │ │              │
│  │  "What to emphasize for X vs Y roles…"     │ │              │
│  └───────────────────────────────────────────┘ │              │
└───────────────────────────────────────────────┴──────────────┘
```
- Interactions: inline edit, drag-reorder (dnd-kit), per-bullet add/remove, autosave with subtle "Saving…/Saved ✓" in `caption`. Each experience has **"angles to highlight"** tag chips — these feed the tailoring prompt.
- The narrative panel is markdown-friendly, generous, explicitly framed as "richer than any one CV; never invented." A help tooltip cites the truthfulness rule.
- Empty: prompt to import or hand-add. Loading: form skeleton. Error: field-level inline validation; save failure → toast + local retain.

### 4.6 The Tailor workspace (the heart — designed in depth)

**Core decision: a single persistent split-pane workspace, NOT a multi-step wizard.** Rationale:
- The job is iterative ("paste JD → generate → tweak → re-fit → export"), and a wizard forces linear, lossy back-and-forth. A workspace keeps the JD, controls, and the living document co-present so cause↔effect is always visible.
- The live preview is the product. It must be on screen *the entire time*, updating as content changes. This is the single most important architectural constraint (see closing summary).
- We borrow the "form-left / live-preview-right" pattern proven by Stripe Checkout builder, Resume.io, Typedream — but elevate it with true A4 rendering + diff.

**Layout (desktop ≥1280): resizable 3-zone split.**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ Back   Tailor   ·  Untitled draft        [Type 1 ▮][Type 2]   [ Export ▾]│  workspace bar
├───────────────────────────┬────────────────────────────────────────────────┤
│ LEFT  (controls, 420px)   │ RIGHT  (live preview, flex)                     │
│ ┌───────────────────────┐ │   ┌──────────────────────────────────┐         │
│ │ Job description       │ │   │  ████  PreviewFrame (paper)  ████ │         │
│ │ ┌───────────────────┐ │ │   │  ┌────────────────────────────┐  │         │
│ │ │ paste JD here…    │ │ │   │  │                            │  │         │
│ │ │                   │ │ │   │  │     A4 CV (true 794×1123)  │  │         │
│ │ │  ~1,250 words     │ │ │   │  │     scaled to fit          │  │         │
│ │ └───────────────────┘ │ │   │  │                            │  │         │
│ │ Detected: Senior PM   │ │   │  │   [diff highlights amber]  │  │         │
│ │ Template: ◉Type1 ○Type2│ │   │  │                            │  │         │
│ │ Model: Claude ⌄  ~$0.03│ │   │  └────────────────────────────┘  │         │
│ │ [    ✦ Tailor CV    ] │ │   │  Fit: ▰▰▰▰▰▱ 94% fits ✓  zoom 80%⌄ │         │
│ └───────────────────────┘ │   │  [Show changes ▮]  [Baseline|Tailored]      │
│ ┌───────────────────────┐ │   └──────────────────────────────────┘         │
│ │ Changes (after gen)   │ │                                                  │
│ │ • Summary rewritten   │ │   (clicking a change scrolls preview + opens     │
│ │ • Reordered skills ↕  │ │    the matching field inline-editor)             │
│ │ • Dropped 1 bullet    │ │                                                  │
│ └───────────────────────┘ │                                                  │
└───────────────────────────┴────────────────────────────────────────────────┘
```

**Flow & interactions:**
1. **Input.** User pastes JD into `JdPasteBox`. We infer a role label + show word/token estimate. Template defaults to the user's last-used (Type 1 default overall). Model picker reflects BYOK keys; shows live cost estimate.
2. **Tailor.** `Tailor CV` triggers the single LLM call. `GenerationProgress` replaces the button with a labeled, streaming checklist:
   `Reading your profile ✓ → Matching to the role ✓ → Rewriting content ⟳ → Rendering → Checking one-page fit`. The preview updates *progressively* if streamed (summary first, then experience), otherwise reveals on completion with a soft cross-fade.
3. **Review.** Result lands in `CvPreview`. **"Show changes"** toggles `TailorDiffViewer` overlays directly on the rendered CV (amber underline = added/rewritten, struck ghost = removed, ↕ = reordered). The left **Changes** list summarizes every edit with jump links. A `Baseline | Tailored` segmented toggle swaps the preview between the user's untailored doc and the tailored one (A/B).
4. **Inline edit.** Click any field/bullet in the preview → it becomes editable in place (contenteditable-backed `EditableField`) OR opens the corresponding field in a slim left inline-editor (decision: **click-in-preview → inline popover editor anchored to the field**, so editing happens where you look). Each field carries a provenance dot: kept / AI-rewritten / AI-added. User edits are tracked as a third diff layer ("you edited").
5. **One-page fit.** `OnePageFitIndicator` always visible under the preview. On overflow: chip turns clay, preview shows a red hairline at the page boundary and faint clipped region, and an **"Auto-fit"** button appears. Auto-fit runs the deterministic tighten-then-trim loop (tighten spacing first, only then suggest content cuts) and shows *what it did* in the Changes list. We never silently clip.
6. **Regenerate / refine.** "Tailor again" (full re-run) and per-section "Rewrite this" (targeted). Edits are non-destructive; baseline is untouched.
7. **Export.** `Export ▾`: "Download PDF" (server headless-Chromium, true A4, the canonical render), "Save as document" (names + stores version), "Copy as text." Export shows a brief progress toast and a fit re-check gate (blocks export on hard overflow with a one-click auto-fit offer).

**States:**
- *Empty (pre-paste):* preview shows the user's **baseline** CV (their profile rendered) so the screen is never blank; left shows the JD box with a gentle "Paste a job description to tailor."
- *No API key:* `Tailor` is disabled with an inline prompt → "Add your AI key to tailor" linking to settings (Sheet, not full nav-away).
- *Generating:* progress checklist; preview dims to 60% with a subtle top-to-bottom shimmer mask on the affected sections only.
- *Error (provider/rate-limit/parse):* inline `Alert` with provider-specific message, the raw provider error in a `Collapsible`, and "Try again" / "Switch model." Baseline preview stays intact.
- *Truthfulness guard:* if the model reports the JD asks for experience the user lacks, surface a non-blocking amber note: *"This role asks for X — you don't have it in your profile. We didn't invent it."*

### 4.7 Documents / version history

Purpose: manage every tailored output and revisions.
```
┌──────────────────────────────────────────────────────────────┐
│  Documents          [ search… ]   [ template ▾ ] [ + Tailor ] │
├──────────────────────────────────────────────────────────────┤
│  ▤ grid / ☰ list toggle                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│  │thumb   │ │thumb   │ │thumb   │ │thumb   │                  │
│  │Sr PM   │ │AI PM   │ │Cons.   │ │Growth  │  DocumentCards   │
│  │Type1 ·│ │Type1 ·│ │Type2 ·│ │Type1 ·│  date · status     │
│  └────────┘ └────────┘ └────────┘ └────────┘                  │
└──────────────────────────────────────────────────────────────┘
   click → document detail w/ version timeline:
   ┌─────────────┬───────────────────────────────┐
   │ Versions    │  CvPreview (selected version)  │
   │ ● v3 now    │                                │
   │ ○ v2  edits │  [ Restore ] [ Duplicate ]     │
   │ ○ v1  gen   │  [ Export PDF ]                │
   └─────────────┴───────────────────────────────┘
```
- Versions: each tailor run + significant edit checkpoint = a version (timeline with provenance: "generated", "edited", "auto-fit"). Restore is non-destructive (creates new version).
- Empty: EmptyState → "Your tailored CVs will live here."
- Loading: card skeletons. Error: per-card placeholder + retry.

### 4.8 Settings / BYOK keys

Tabs: **Account · API keys · Templates · Appearance · Data**.
```
┌──────────────────────────────────────────────────────────────┐
│  Settings                                                      │
│  [Account] [API keys] [Templates] [Appearance] [Data]          │
├──────────────────────────────────────────────────────────────┤
│  API keys (BYOK)                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [Anthropic] [OpenAI] [Google]                           │  │
│  │ Anthropic key  ●●●●●●●●●●●●sk-…7Qm   [ Test ✓ live ]    │  │
│  │ Default model  [ claude-…  ⌄ ]                          │  │
│  │ 🔒 Encrypted at rest. Never logged. Never sent to us in │  │
│  │     plaintext beyond the provider call.                 │  │
│  │ [ Remove key ]                                          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```
- `ApiKeyManager`: per provider — masked input (reveal toggle), **Test connection** (calls a cheap models-list/ping; shows ✓ live / ✗ invalid with the provider's message), default-model `Select`, security notice, remove.
- Appearance: theme (System/Light/Dark), default template, preview zoom default.
- Data: export all data (JSON), delete account (destructive confirm dialog with typed confirmation).
- States: saving inline; key test loading inline; invalid-key destructive inline alert.

---

## 5. The two CV outputs as a generic, themeable system

### 5.1 Architecture: `render(document, theme) → A4 HTML/React`

- **`document`**: the user's structured CV data (header, contact, summary, website, photo?, professionalSkills[], softSkills[], leadership[], experience[], education[], languages[]). Zero presentation.
- **`theme`**: a token object (colors, fonts, sizes, spacing, geometry, layout flags) — externalized exactly as catalogued in `cv-analysis.json`. Two built-in themes: `type1-sidebar`, `type2-clean`.
- **`template`**: a React component per layout family that consumes `document` + `theme` and emits the exact markup of the originals. **No personal data baked in.** The same component renders the live preview *and* feeds the server PDF route (one renderer, two consumers → guaranteed parity).
- Replaces the old `data-section/data-field` regex mutation with pure props. The `data-field` attributes are retained *only* as stable hooks for the diff/inline-edit layer and QA text-extraction.
- Page constants: **A4 = 794×1123px @96dpi**, `@page{size:A4;margin:0}`, `-webkit-print-color-adjust:exact; print-color-adjust:exact` (so the navy sidebar prints). One-page constraint enforced (see §5.5).

### 5.2 Type 1 — "Sidebar" theme tokens (reproduce 1:1)

Layout: CSS grid `206px | 1fr`, page 794×1123, sidebar `min-height:1123`.

```
theme.type1 = {
  page:        { width:794, height:1123, bg:'#FFFFFF' },
  fonts:       { family:"'Lato', sans-serif", import:"Lato:300,400,700,900 + italics" },
  sidebar: {
    width:206, bg:'#323B4C', text:'#FFFFFF',
    sectionPad:'12px 18px 14px',
    header:{ size:14.5, weight:700, ls:'0.08em', upper:true,
             borderBottom:'1px solid rgba(255,255,255,0.3)', mb:8, pb:4 },
    divider:'1px solid rgba(255,255,255,0.2)  (margin:0 18px)',
  },
  photo: {                       // OPTIONAL — see 5.4
    pad:'36px 0 28px', circle:118, ring:'3px solid rgba(255,255,255,0.25)',
    placeholderBg:'#4A5568',
  },
  contact:  { size:10, lh:1.45, iconSize:13, iconOpacity:0.85, gap:7, mb:8 },
  skill:    { size:9.5, lh:1.5, bullet:'5px square #FFFFFF rotate(45deg)', mb:7 },
  project:  { name:{size:9.5,weight:700}, url:{size:7.5,italic,rgba(.75)},
              desc:{size:9,italic,rgba(.85),lh:1.5}, mb:11 },
  main: {
    pad:'36px 32px 12px 30px',
    name:   { family:Lato, weight:900, size:33, color:'#323B4C', lh:1.1, ls:'0.01em', mb:4 },
    title:  { weight:400, size:14, color:'#323B4C', ls:'0.2em', upper:true, mb:10 },
    website:{ italic, size:11, color:'#000000', mb:8 },
    summary:{ size:12, color:'#737373', lh:1.65 },
    divider:{ h:2, bg:'#323B4C', margin:'8px 0' },
    sectionHeader:{ weight:700, size:14, color:'#323B4C', ls:'0.06em', upper:true, mb:7 },
    experience:{
      listPadLeft:16, timelineLine:'1px #D0D0D0 (left:4, top6→bottom6)',
      node:'6px square #737373 rotate(45deg) (left:-14,top:6)',
      companyPeriod:{ weight:700, size:9.5, color:'#737373', ls:'0.03em' },
      jobTitle:{ weight:700, size:12.5, color:'#323B4C', mb:6 },
      bullet:{ size:10.5, color:'#737373', lh:1.5, marker:'•', padLeft:10, mb:2 },
      entryMb:9,
    },
    education:{ inst:{weight:700,size:10.5,color:'#737373'},
                period:{size:10,color:'#737373'},
                degree:{weight:700,size:12,color:'#323B4C'},
                note:{italic,size:9.5,color:'#737373',lh:1.45}, entryMb:5 },
    references:{ italic, weight:700, size:9, color:'#737373', center:true, marginTopAuto:true },
  }
}
```
**Use-for tag (shown in picker):** *tech · startups · product · AI/ML — the default.*

### 5.3 Type 2 — "Clean / McKinsey" theme tokens (reproduce 1:1)

Layout: single column, `width:794`, body padding `22px 52px`, base `font-size:10pt; line-height:1.30`, color `#111`, no photo, no color blocks.

```
theme.type2 = {
  page:   { width:794, padding:'22px 52px', bg:'#FFFFFF', color:'#111', base:'10pt/1.30' },
  fonts:  { family:"'Source Sans 3','Calibri','Arial',sans-serif", import:"Source Sans 3:400,600,700" },
  header: { center:true, mb:14,
            name:{size:'22pt',weight:700,ls:'1.5px',upper:true,mb:2},
            title:{size:'10.5pt',weight:600,color:'#444',ls:'0.5px',mb:4},
            contact:{size:'9.4pt',color:'#222',sep:'·',linkColor:'#222',noUnderline:true},
            summary:{size:'10pt',lh:1.42,justify:true,mb:4} },
  sectionTitle:{ size:'10pt',weight:700,ls:'1.5px',upper:true,
                 borderBottom:'1px solid #111', mt:9, mb:5, pb:2 },
  entry:  { mb:9,
            row:'flex space-between baseline',
            left:{size:'10.4pt'}, org:{weight:700}, sep:{weight:400,color:'#444',mx:4},
            role:{weight:600,italic:true},
            right:{size:'9.6pt',color:'#333',weight:600,nowrap:true} },
  bullets:{ ml:18, mb:3, lh:1.42, justify:true },
  eduNote:{ italic, size:'9.6pt', color:'#333' },
  skills: { inline:true, label:{weight:700}, text:'10pt', sep:' · ' (color '#888'),
            lines:['Professional:','Strengths:'], hideBullets:true },
  languages:{ size:'10pt', label:{weight:700} },
}
```
**Use-for tag:** *consulting · finance · conservative/formal · senior IC.*

### 5.4 Photo handling (Type 1 only)

- Photo is **optional**. `PhotoUploader` offers upload + square/circle crop; stored per profile.
- **Present:** circular 118px image, `object-fit:cover`, ring `3px rgba(255,255,255,0.25)`.
- **Absent (graceful fallback):** monogram — user's initials in Lato 700 on `#4A5568` fill, same circle/ring. *Never* a broken-image icon, *never* a person silhouette stock glyph. Optionally allow "no photo" entirely (collapses the photo block; sidebar reflows up) — a toggle in template settings, because many regions/industries prefer photoless CVs. Type 2 never has a photo.

### 5.5 One-page constraint — communicate & auto-handle

The renderer measures content height against 1123px (Type 1) / content box (Type 2):
- **Live signal:** `OnePageFitIndicator` (gauge + chip) under the preview, always present. Bands: `≤92% fits` (spruce), `92–100% tight` (amber), `>100% overflow` (clay).
- **Never silently clip.** On overflow, the preview draws a red hairline at the page bottom and faint-tints the clipped region; export is gated.
- **Auto-fit loop (deterministic, ordered — mirrors the manual rule "tighten before trim"):**
  1. Reduce inter-section / inter-entry spacing within defined min bounds.
  2. Reduce line-heights toward floor (e.g. Type1 bullet 1.5→1.42).
  3. Tighten font sizes within a ±0.5pt safe range.
  4. Only then propose content trims (lowest-priority bullets / least-relevant role), surfaced as *suggestions in the Changes list* the user can accept/reject.
- Every auto-fit action is logged to the Changes list + version provenance so it's transparent and reversible.
- This same measurement is the automated QA gate before any PDF export (text-bbox / lowest-y ≥ bottom-margin check from the manual pipeline).

---

## 6. Responsive & accessibility

### 6.1 Breakpoints
`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. The app is **desktop-first** (the editor needs width).

### 6.2 Responsive behavior per surface
- **Tailor workspace:** split-pane only at `≥1280`. `1024–1279`: collapsible — preview is primary, controls slide over as a `Sheet`. `<1024 (tablet/mobile):` **tabbed single column** — sticky segmented control `[ Job ] [ Preview ] [ Changes ]`; preview scales to fit width; editing fields opens bottom `Sheet`. Generation + export fully available.
- **Mobile story (decision):** Lapel on mobile is a **review/light-edit + tailor-trigger companion, not the primary authoring tool.** You *can* paste a JD, tailor, view the result, toggle diff, accept auto-fit, and export/share a PDF. Deep knowledge-base authoring and precise inline edits are gently deferred to desktop ("Best on a larger screen for detailed editing" hint). The CV preview always renders at true A4 and is pinch/zoom + fit-width capable.
- **Dashboard/Docs:** grid reflows 4→2→1 columns. Nav rail → bottom tab bar on mobile.
- **Settings/Profile:** single column stacks; preview moves below editor on narrow.

### 6.3 Accessibility (WCAG 2.2 AA, non-negotiable)
- **Contrast:** body ink `#1A1B19` on paper `#FBFAF7` ≈ 16:1. Spruce-600 on white ≈ 5.3:1 (AA for text). Amber-600 used on `amber-100` and for non-text emphasis; where amber conveys "added" it is **paired with an underline/icon, never color-alone** (diff legibility for color-blind users). All semantic states ≥ 4.5:1 for text.
- **Focus:** visible 2px `--ring` (spruce) focus ring with 2px offset on every interactive element; never remove outline. `:focus-visible` only (no mouse-focus noise).
- **Keyboard:** full operability. Tab order logical; ⌘K palette; in the workspace: `⌘↵` = Tailor, `⌘E` = Export, `[` / `]` cycle Type1/Type2, `⌘B` toggle baseline/tailored, `Esc` closes popovers. Inline-edit fields reachable and editable by keyboard; diff jump-links are buttons.
- **Screen readers:** Radix primitives give correct roles/labels. The `CvPreview` exposes a structured, readable DOM (real headings/lists), so the rendered CV is itself accessible; diff overlays use `aria-label` ("rewritten", "added"). Generation progress is an `aria-live="polite"` region announcing each step.
- **Motion:** honor `prefers-reduced-motion` everywhere (freeze hero, drop shimmer, opacity-only).
- **Hit targets:** ≥44×44 on touch; ≥32px desktop controls.
- **Forms:** label every field; errors announced + tied via `aria-describedby`; never color-only validation.

---

## 7. Micro-interactions & polish (what makes it premium)

- **Skeletons, not spinners** for content (DocumentCards, profile fields, preview-loading) — shaped to the final layout, shimmer at ≤180ms, paper-tone.
- **Generation progress = labeled checklist** (§4.6): each step animates from `⟳` to `✓` with a 1px progress hairline. It *narrates honestly* ("Selecting your most relevant experience") and shows the model/provider + running cost. This is the product's signature moment — it makes the AI feel like a careful collaborator, not a black box.
- **Diff settle:** when a tailored result lands, changed lines briefly wash `amber-100` background then fade to underline over 240ms — the eye is guided to what changed without confetti.
- **Toasts (sonner):** bottom-right, compact, ink-on-paper, single-line; success uses spruce check, never emoji. Auto-dismiss 4s; destructive/undo-able toasts persist with an Undo action ("Bullet removed · Undo").
- **Optimistic edits:** inline field edits commit instantly to the preview; autosave reconciles in background; a tiny `Saved ✓` caption confirms.
- **Page transitions:** content cross-fades + 8px upward settle (`ease-out`, 180ms). Nav rail items have a 2px spruce active indicator that slides between items.
- **Buttons:** primary = solid spruce, `shadow-xs`, press scale 0.985, 120ms; loading state shows inline spinner + verb ("Tailoring…"), width-stable.
- **Empty states:** Fraunces headline + one sentence + one primary action + a faint line-art motif (a folded page corner / lapel notch), never clip-art.
- **Texture:** a barely-there paper grain (SVG noise, ≤3% opacity) on the app background and the preview lightbox backdrop — the single most effective "not-flat-AI-template" touch.
- **Numbers in Fraunces** for big stats (profile %, doc count) — editorial feel.
- **Zoom on preview** is smooth (transform scale, GPU) with a `fit-width / 50–150%` control; double-click to toggle fit.

---

## 8. Onboarding & empty states (first-run delight)

- **The "aha" is fast:** within ~30s of uploading a resume, the user sees *their own data rendered as a beautiful Type 1 CV* (onboarding Step 2). That instant transformation is the hook — design protects it (parse → render even before BYOK).
- **Progressive disclosure:** we don't dump every setting. Key setup can be deferred; tailoring is the obvious next step, gently gated.
- **First dashboard empty state:** Fraunces "Tailor your first CV" + their profile completeness ring + primary CTA → opens the workspace pre-loaded with their baseline preview.
- **Profile completeness nudge:** an unobtrusive ring/badge ("92% — add a bullet to your IAF role?") that rewards completeness without nagging.
- **First tailor celebration:** subtle — the Changes list animates in and the fit chip turns spruce; one quiet toast: *"Tailored and fit to one page."* No confetti.
- **Helpful empty zero-states everywhere:** no-key, no-docs, no-experience each have a specific, warm, single-action prompt in the product voice.

---

## Appendix A — Decision log (rationale, condensed)
1. **Name "Lapel"** — concrete tailoring metaphor, ownable, non-AI-cliché; keeps "tailor" as the verb.
2. **Editorial Studio art direction (paper + ink + spruce + amber)** — trustworthy, document-forward, deliberately anti-purple-gradient; low saturation so it never fights the CV's own navy/black.
3. **Fraunces + Inter** — serif-display/grotesque pairing = the cheapest, strongest "premium craft" signal; distinct from the CV fonts (Lato / Source Sans 3).
4. **Single split-pane Tailor workspace (not a wizard)** — iterative loop demands the live A4 preview be permanently co-present with controls.
5. **Themeable `render(document, theme)`** — two themes as pure token sets pulled 1:1 from `cv-analysis.json`; one renderer feeds both preview and PDF for guaranteed parity.
6. **Diff + provenance as first-class UI** — honesty about what the AI changed (and that it invented nothing) is a feature, not a footnote.
7. **One-page = visible gauge + deterministic auto-fit (tighten→trim), never silent clip** — directly carries the manual pipeline's hard rule into UX.
8. **Light default; preview always on white** — you read/edit resumes on paper, even in dark mode.

---

## Closing summary for the architect (10 lines)

1. **Brand: "Lapel" — an "Editorial Studio" art direction.** Warm paper-white canvas (`#FBFAF7`), warm near-black ink (`#1A1B19`), one confident accent **Spruce green** (`#256B53`), one functional **Amber** (`#B5740F`) reserved for AI/diff states.
2. Deliberately **anti-AI-cliché**: no purple gradients, no glassmorphism, no sparkles — calm, document-forward, high-contrast/low-saturation.
3. **Type pairing = Fraunces (display serif) + Inter (UI)** — distinct from the CV output fonts (Lato / Source Sans 3), the cheapest big "premium" win.
4. Restrained radii (10px), soft neutral "paper" shadows, quick ease-out motion (120–240ms, no bounce), faint paper-grain texture.
5. Tokens map cleanly onto Tailwind `theme.extend` + shadcn HSL CSS variables (full `:root`/`.dark` provided); dark mode is warm charcoal, **but the CV preview is always rendered on white paper**.
6. **The two CVs are a generic `render(document, theme)` system** — two pure token themes pulled 1:1 from `cv-analysis.json`; one renderer feeds both the live preview and the server PDF for pixel parity.
7. **THE most important workspace decision: a single persistent split-pane (controls left / always-live true-A4 preview right), NOT a step wizard.** The architecture must treat the A4 `CvPreview` as the single shared source of truth, on screen the entire time, updating progressively as content/edits stream in.
8. **Diff + provenance are first-class**: amber overlays on the rendered CV (added/rewritten/removed/reordered, color never alone), a Changes list with jump-links, and a Baseline↔Tailored toggle — surfacing the truthfulness guarantee.
9. **One-page fit is a visible gauge + deterministic auto-fit loop (tighten spacing → line-height → size → only then trim), never a silent clip**; the same measurement gates PDF export.
10. **First-run delight = see your own resume rendered as a designer CV within ~30s of upload**, before BYOK; desktop-first editor with a defined mobile review/tailor companion mode; WCAG 2.2 AA throughout.
