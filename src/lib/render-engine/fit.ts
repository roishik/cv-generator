import type { ThemeTokens } from "@/lib/schemas/cv-data";

// Pure auto-fit policy. Given a theme, it produces a sequence of progressively
// tighter token sets. The PDF layer measures rendered height and walks this
// ladder until the content fits one A4 page — NEVER silently clipping. If the
// ladder is exhausted, the caller returns { fits:false, reason, suggestion }.

export interface FitBounds {
  // minimums — used when TIGHTENING (content overflows one page)
  minLineHeight: number;
  minBaseSizePt: number;
  minSectionGapPx: number;
  minEntryGapPx: number;
  minBulletGapPx: number;
  minSkillGapPx: number;
  // maximums — used when EXPANDING (content well under one page → fill the gap)
  maxLineHeight: number;
  maxBaseSizePt: number;
  maxSectionGapPx: number;
  maxEntryGapPx: number;
  maxBulletGapPx: number;
  maxSkillGapPx: number;
}

export const DEFAULT_FIT_BOUNDS: FitBounds = {
  minLineHeight: 1.12,
  minBaseSizePt: 8.5,
  minSectionGapPx: 4,
  minEntryGapPx: 3,
  minBulletGapPx: 0,
  minSkillGapPx: 1,
  // Expansion caps are intentionally conservative. Gaps are absolute (they sit
  // above both templates' bases). Font + line-height are ALSO clamped relative
  // to the base inside buildFitLadder (base + EXPAND_FONT_HEADROOM /
  // EXPAND_LH_HEADROOM) so a large-base theme can never balloon past a notch or two.
  maxLineHeight: 1.6,
  maxBaseSizePt: 11.5,
  maxSectionGapPx: 18,
  maxEntryGapPx: 15,
  maxBulletGapPx: 6,
  maxSkillGapPx: 12,
};

/** Relative headroom for the risky dimensions, applied on top of FitBounds maxes. */
const EXPAND_FONT_HEADROOM = 1.0; // pt above the base font size
const EXPAND_LH_HEADROOM = 0.1; // line-height units above the base

function clone(t: ThemeTokens): ThemeTokens {
  return JSON.parse(JSON.stringify(t)) as ThemeTokens;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Result of {@link buildFitLadder}: the full rung array plus the base's index. */
export interface FitLadder {
  /** Ordered most-EXPANDED (index 0) → base (`baseIndex`) → most-TIGHTENED (last). */
  rungs: ThemeTokens[];
  /** Index of the untouched base theme within `rungs`. */
  baseIndex: number;
}

/**
 * Returns the two-sided ladder of theme variants. Walking UP from `baseIndex`
 * (toward the last rung) progressively TIGHTENS (spacing → line-height → font),
 * clamped to the FitBounds minimums — this is the one-page-fit path. Walking DOWN
 * from `baseIndex` (toward index 0) progressively EXPANDS (same dimensions, the
 * other direction), clamped to the maximums — this fills a short page so it does
 * not leave a large bottom gap. The base theme sits untouched at `baseIndex`.
 */
export function buildFitLadder(
  base: ThemeTokens,
  bounds: FitBounds = DEFAULT_FIT_BOUNDS,
  maxRungs = 40,
): FitLadder {
  // Clamp the risky dimensions (font, line-height) relative to the base so a
  // large-base theme can never expand past a notch or two, regardless of the
  // absolute FitBounds maxes.
  const fontMax = Math.min(bounds.maxBaseSizePt, base.font.baseSizePt + EXPAND_FONT_HEADROOM);
  const lhMax = Math.min(bounds.maxLineHeight, base.font.lineHeight + EXPAND_LH_HEADROOM);

  // --- Tightening side: base → tighter (existing behaviour) ---
  const tightenSteps: Array<(t: ThemeTokens) => boolean> = [
    (t) => apply(t, "layout", "bulletGapPx", stepDown(t.layout.bulletGapPx, 1, bounds.minBulletGapPx)),
    (t) => apply(t, "layout", "entryGapPx", stepDown(t.layout.entryGapPx, 1, bounds.minEntryGapPx)),
    (t) => apply(t, "layout", "sectionGapPx", stepDown(t.layout.sectionGapPx, 1, bounds.minSectionGapPx)),
    (t) => apply(t, "layout", "skillGapPx", stepDown(t.layout.skillGapPx, 1, bounds.minSkillGapPx)),
    (t) => apply(t, "font", "lineHeight", round2n(stepDown(t.font.lineHeight, 0.05, bounds.minLineHeight))),
    (t) => apply(t, "font", "baseSizePt", round1n(stepDown(t.font.baseSizePt, 0.5, bounds.minBaseSizePt))),
  ];
  const tighten = walk(base, tightenSteps, maxRungs);

  // --- Expansion side: base → looser. Gaps first (low risk), font/line-height
  // last (capped tightly via fontMax/lhMax). ---
  const expandSteps: Array<(t: ThemeTokens) => boolean> = [
    (t) => apply(t, "layout", "sectionGapPx", stepUp(t.layout.sectionGapPx, 2, bounds.maxSectionGapPx)),
    (t) => apply(t, "layout", "entryGapPx", stepUp(t.layout.entryGapPx, 2, bounds.maxEntryGapPx)),
    (t) => apply(t, "layout", "bulletGapPx", stepUp(t.layout.bulletGapPx, 1, bounds.maxBulletGapPx)),
    (t) => apply(t, "layout", "skillGapPx", stepUp(t.layout.skillGapPx, 1, bounds.maxSkillGapPx)),
    (t) => apply(t, "font", "lineHeight", round2n(stepUp(t.font.lineHeight, 0.05, lhMax))),
    (t) => apply(t, "font", "baseSizePt", round1n(stepUp(t.font.baseSizePt, 0.5, fontMax))),
  ];
  const expand = walk(base, expandSteps, maxRungs);

  // expand[] runs base→most-expanded; reverse it so index 0 is the loosest.
  const rungs = [...expand.slice(1).reverse(), clone(base), ...tighten.slice(1)];
  return { rungs, baseIndex: expand.length - 1 };
}

/** Apply a step result to a token, returning whether it changed. */
function apply(
  t: ThemeTokens,
  group: "layout" | "font",
  key: string,
  next: number | null,
): boolean {
  if (next === null) return false;
  (t[group] as unknown as Record<string, number>)[key] = next;
  return true;
}

const round1n = (n: number | null) => (n === null ? null : round1(n));
const round2n = (n: number | null) => (n === null ? null : round2(n));

/**
 * Walks a set of one-notch steps from `base`, applying every step that can still
 * move per rung, until none change. Returns [base, rung1, rung2, ...].
 */
function walk(
  base: ThemeTokens,
  steps: Array<(t: ThemeTokens) => boolean>,
  maxRungs: number,
): ThemeTokens[] {
  const out: ThemeTokens[] = [clone(base)];
  let cur = clone(base);
  let guard = 0;
  for (;;) {
    if (guard >= maxRungs) break;
    const next = clone(cur);
    let changed = false;
    for (const s of steps) {
      if (s(next)) changed = true;
    }
    if (!changed) break;
    out.push(next);
    cur = next;
    guard++;
  }
  return out;
}

/** Returns the value lowered by one notch, or null if already at/below min. */
function stepDown(value: number, delta: number, min: number): number | null {
  if (value <= min) return null;
  return Math.max(min, value - delta);
}

/** Returns the value raised by one notch, or null if already at/above max. */
function stepUp(value: number, delta: number, max: number): number | null {
  if (value >= max) return null;
  return Math.min(max, value + delta);
}

export interface FitFailure {
  fits: false;
  reason: string;
  suggestion: string;
}

export type FitPhase = "init" | "tightening" | "expanding" | "settled";

export interface FitStepInput {
  /** Current rung index into FitLadder.rungs. */
  fitRung: number;
  /** Current walk phase. */
  phase: FitPhase;
  /** Last measured content height (px). */
  h: number;
  /** One-page limit (page height − safe bottom). */
  limit: number;
  /** Last valid rung index (rungs.length − 1). */
  last: number;
  /** Below the limit by more than this → worth expanding to fill the gap. */
  fillTol: number;
}

export interface FitStepResult {
  fitRung: number;
  phase: FitPhase;
  /** When true, the caller should report `h` (this rung is the settled answer). */
  report: boolean;
}

/**
 * Pure decision for the client auto-fit walk. Drives the live preview the same
 * way the server loop drives the PDF: tighten when over one page, expand to fill
 * a short page, never oscillate.
 *
 * Convergence: the phase changes direction AT MOST once (init → tightening |
 * expanding → settled). `fitRung` moves strictly toward `last` while tightening
 * and strictly toward 0 while expanding, so a settle is reached within
 * `rungs.length` steps. The tightening check is evaluated BEFORE the expand
 * check so a rung that fits while tightening can never flip back to expanding.
 */
export function nextFitStep(s: FitStepInput): FitStepResult {
  const { fitRung, phase, h, limit, last, fillTol } = s;
  if (h > limit + 1) {
    // OVERFLOW
    if (phase === "expanding") {
      // We expanded one notch too far — step back to the last fitting rung and
      // settle. Don't report the overflowing height; the reverted rung
      // re-measures and reports the correct (fitting) value.
      if (fitRung < last) return { fitRung: fitRung + 1, phase: "settled", report: false };
      return { fitRung, phase: "settled", report: true };
    }
    if (fitRung < last) return { fitRung: fitRung + 1, phase: "tightening", report: false };
    return { fitRung, phase: "settled", report: true }; // honest overflow at tightest rung
  }
  // FITS
  if (phase === "tightening" || phase === "settled") {
    return { fitRung, phase: "settled", report: true };
  }
  // init or expanding, and it fits → expand to fill if there's meaningful slack.
  if (h < limit - fillTol && fitRung > 0) {
    return { fitRung: fitRung - 1, phase: "expanding", report: false };
  }
  return { fitRung, phase: "settled", report: true };
}
