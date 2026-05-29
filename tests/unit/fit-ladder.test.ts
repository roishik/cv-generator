import { describe, it, expect } from "vitest";
import { buildFitLadder, DEFAULT_FIT_BOUNDS } from "@/lib/render-engine/fit";
import { sidebarDefault, cleanDefault } from "@/lib/render-engine/themes/registry";

describe("buildFitLadder", () => {
  it("rung 0 is the original theme untouched", () => {
    const ladder = buildFitLadder(sidebarDefault);
    expect(ladder[0]).toEqual(sidebarDefault);
  });

  it("monotonically tightens spacing/line-height/font-size", () => {
    const ladder = buildFitLadder(sidebarDefault);
    for (let i = 1; i < ladder.length; i++) {
      const prev = ladder[i - 1]!;
      const cur = ladder[i]!;
      expect(cur.layout.bulletGapPx).toBeLessThanOrEqual(prev.layout.bulletGapPx);
      expect(cur.layout.entryGapPx).toBeLessThanOrEqual(prev.layout.entryGapPx);
      expect(cur.layout.sectionGapPx).toBeLessThanOrEqual(prev.layout.sectionGapPx);
      expect(cur.font.lineHeight).toBeLessThanOrEqual(prev.font.lineHeight);
      expect(cur.font.baseSizePt).toBeLessThanOrEqual(prev.font.baseSizePt);
    }
  });

  it("never goes below the configured min bounds", () => {
    const ladder = buildFitLadder(cleanDefault);
    const last = ladder[ladder.length - 1]!;
    expect(last.font.lineHeight).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minLineHeight - 1e-9);
    expect(last.font.baseSizePt).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minBaseSizePt - 1e-9);
    expect(last.layout.sectionGapPx).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minSectionGapPx);
    expect(last.layout.bulletGapPx).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minBulletGapPx);
  });

  it("terminates at a floored final rung", () => {
    const ladder = buildFitLadder(sidebarDefault);
    expect(ladder.length).toBeGreaterThan(1);
    const last = ladder[ladder.length - 1]!;
    expect(last.font.baseSizePt).toBe(DEFAULT_FIT_BOUNDS.minBaseSizePt);
  });

  it("does not mutate the input theme", () => {
    const before = JSON.stringify(sidebarDefault);
    buildFitLadder(sidebarDefault);
    expect(JSON.stringify(sidebarDefault)).toBe(before);
  });
});
