import type { ThemeTokens } from "@/lib/schemas/cv-data";

// Pure auto-fit policy. Given a theme, it produces a sequence of progressively
// tighter token sets. The PDF layer measures rendered height and walks this
// ladder until the content fits one A4 page — NEVER silently clipping. If the
// ladder is exhausted, the caller returns { fits:false, reason, suggestion }.

export interface FitBounds {
  minLineHeight: number;
  minBaseSizePt: number;
  minSectionGapPx: number;
  minEntryGapPx: number;
  minBulletGapPx: number;
  minSkillGapPx: number;
}

export const DEFAULT_FIT_BOUNDS: FitBounds = {
  minLineHeight: 1.12,
  minBaseSizePt: 8.5,
  minSectionGapPx: 4,
  minEntryGapPx: 3,
  minBulletGapPx: 0,
  minSkillGapPx: 1,
};

function clone(t: ThemeTokens): ThemeTokens {
  return JSON.parse(JSON.stringify(t)) as ThemeTokens;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Returns the ordered ladder of theme variants, from the original (rung 0)
 * to the most aggressively tightened. Each rung tightens one dimension a notch,
 * cycling spacing → line-height → font-size, clamped to bounds. The ladder ends
 * when every tunable dimension has reached its minimum.
 */
export function buildFitLadder(
  base: ThemeTokens,
  bounds: FitBounds = DEFAULT_FIT_BOUNDS,
  maxRungs = 40,
): ThemeTokens[] {
  const ladder: ThemeTokens[] = [clone(base)];
  let cur = clone(base);

  const atFloor = (t: ThemeTokens): boolean =>
    t.layout.bulletGapPx <= bounds.minBulletGapPx &&
    t.layout.entryGapPx <= bounds.minEntryGapPx &&
    t.layout.sectionGapPx <= bounds.minSectionGapPx &&
    t.layout.skillGapPx <= bounds.minSkillGapPx &&
    t.font.lineHeight <= bounds.minLineHeight &&
    t.font.baseSizePt <= bounds.minBaseSizePt;

  // Order of attack (one notch per rung), repeated until everything floors.
  const steps: Array<(t: ThemeTokens) => boolean> = [
    (t) => {
      const r = stepDown(t.layout.bulletGapPx, 1, bounds.minBulletGapPx);
      if (r === null) return false;
      t.layout.bulletGapPx = r;
      return true;
    },
    (t) => {
      const r = stepDown(t.layout.entryGapPx, 1, bounds.minEntryGapPx);
      if (r === null) return false;
      t.layout.entryGapPx = r;
      return true;
    },
    (t) => {
      const r = stepDown(t.layout.sectionGapPx, 1, bounds.minSectionGapPx);
      if (r === null) return false;
      t.layout.sectionGapPx = r;
      return true;
    },
    (t) => {
      const r = stepDown(t.layout.skillGapPx, 1, bounds.minSkillGapPx);
      if (r === null) return false;
      t.layout.skillGapPx = r;
      return true;
    },
    (t) => {
      const r = stepDown(t.font.lineHeight, 0.05, bounds.minLineHeight);
      if (r === null) return false;
      t.font.lineHeight = round1(r);
      return true;
    },
    (t) => {
      const r = stepDown(t.font.baseSizePt, 0.5, bounds.minBaseSizePt);
      if (r === null) return false;
      t.font.baseSizePt = round1(r);
      return true;
    },
  ];

  let guard = 0;
  while (!atFloor(cur) && guard < maxRungs) {
    const next = clone(cur);
    let changed = false;
    for (const s of steps) {
      if (s(next)) changed = true;
    }
    if (!changed) break;
    ladder.push(next);
    cur = next;
    guard++;
  }
  return ladder;
}

/** Returns the value lowered by one notch, or null if already at/below min. */
function stepDown(value: number, delta: number, min: number): number | null {
  if (value <= min) return null;
  return Math.max(min, value - delta);
}

export interface FitFailure {
  fits: false;
  reason: string;
  suggestion: string;
}
