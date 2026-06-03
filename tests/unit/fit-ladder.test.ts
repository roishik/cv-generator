import { describe, it, expect } from "vitest";
import { buildFitLadder, nextFitStep, DEFAULT_FIT_BOUNDS } from "@/lib/render-engine/fit";
import { sidebarDefault, cleanDefault } from "@/lib/render-engine/themes/registry";

describe("buildFitLadder", () => {
  it("base rung is the original theme untouched", () => {
    const { rungs, baseIndex } = buildFitLadder(sidebarDefault);
    expect(rungs[baseIndex]).toEqual(sidebarDefault);
  });

  it("monotonically tightens above the base rung", () => {
    const { rungs, baseIndex } = buildFitLadder(sidebarDefault);
    for (let i = baseIndex + 1; i < rungs.length; i++) {
      const prev = rungs[i - 1]!;
      const cur = rungs[i]!;
      expect(cur.layout.bulletGapPx).toBeLessThanOrEqual(prev.layout.bulletGapPx);
      expect(cur.layout.entryGapPx).toBeLessThanOrEqual(prev.layout.entryGapPx);
      expect(cur.layout.sectionGapPx).toBeLessThanOrEqual(prev.layout.sectionGapPx);
      expect(cur.font.lineHeight).toBeLessThanOrEqual(prev.font.lineHeight);
      expect(cur.font.baseSizePt).toBeLessThanOrEqual(prev.font.baseSizePt);
    }
  });

  it("monotonically expands below the base rung", () => {
    const { rungs, baseIndex } = buildFitLadder(sidebarDefault);
    expect(baseIndex).toBeGreaterThan(0); // has expansion headroom
    for (let i = 1; i <= baseIndex; i++) {
      const looser = rungs[i - 1]!; // more expanded (lower index)
      const tighter = rungs[i]!;
      expect(looser.layout.sectionGapPx).toBeGreaterThanOrEqual(tighter.layout.sectionGapPx);
      expect(looser.layout.entryGapPx).toBeGreaterThanOrEqual(tighter.layout.entryGapPx);
      expect(looser.font.lineHeight).toBeGreaterThanOrEqual(tighter.font.lineHeight);
      expect(looser.font.baseSizePt).toBeGreaterThanOrEqual(tighter.font.baseSizePt);
    }
  });

  it("tightening floors at the configured min bounds", () => {
    const { rungs } = buildFitLadder(cleanDefault);
    const last = rungs[rungs.length - 1]!;
    expect(last.font.lineHeight).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minLineHeight - 1e-9);
    expect(last.font.baseSizePt).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minBaseSizePt - 1e-9);
    expect(last.layout.sectionGapPx).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minSectionGapPx);
    expect(last.layout.bulletGapPx).toBeGreaterThanOrEqual(DEFAULT_FIT_BOUNDS.minBulletGapPx);
    expect(last.font.baseSizePt).toBe(DEFAULT_FIT_BOUNDS.minBaseSizePt);
  });

  it("expansion ceils at the bounds AND the relative font/line-height clamp", () => {
    const { rungs } = buildFitLadder(sidebarDefault);
    const most = rungs[0]!; // most-expanded rung
    // font is clamped to base + 1.0pt regardless of the absolute max.
    expect(most.font.baseSizePt).toBeLessThanOrEqual(sidebarDefault.font.baseSizePt + 1.0 + 1e-9);
    expect(most.font.baseSizePt).toBeLessThanOrEqual(DEFAULT_FIT_BOUNDS.maxBaseSizePt + 1e-9);
    // line-height clamped to base + 0.10.
    expect(most.font.lineHeight).toBeLessThanOrEqual(sidebarDefault.font.lineHeight + 0.1 + 1e-9);
    expect(most.layout.sectionGapPx).toBeLessThanOrEqual(DEFAULT_FIT_BOUNDS.maxSectionGapPx);
    expect(most.layout.entryGapPx).toBeLessThanOrEqual(DEFAULT_FIT_BOUNDS.maxEntryGapPx);
  });

  it("has more than one rung and does not mutate the input theme", () => {
    const before = JSON.stringify(sidebarDefault);
    const { rungs } = buildFitLadder(sidebarDefault);
    expect(rungs.length).toBeGreaterThan(1);
    expect(JSON.stringify(sidebarDefault)).toBe(before);
  });
});

describe("nextFitStep", () => {
  const base = { last: 10, fillTol: 24 };
  const limit = 1111;

  it("base fits exactly → settle, report", () => {
    const r = nextFitStep({ ...base, fitRung: 5, phase: "init", h: 1108, limit });
    expect(r).toEqual({ fitRung: 5, phase: "settled", report: true });
  });

  it("base overflows → tighten one notch, no report", () => {
    const r = nextFitStep({ ...base, fitRung: 5, phase: "init", h: 1311, limit });
    expect(r).toEqual({ fitRung: 6, phase: "tightening", report: false });
  });

  it("first fitting rung while tightening → settle, report", () => {
    const r = nextFitStep({ ...base, fitRung: 7, phase: "tightening", h: 1100, limit });
    expect(r).toEqual({ fitRung: 7, phase: "settled", report: true });
  });

  it("big gap from init → expand one notch, no report", () => {
    const r = nextFitStep({ ...base, fitRung: 5, phase: "init", h: 811, limit });
    expect(r).toEqual({ fitRung: 4, phase: "expanding", report: false });
  });

  it("expanding overshoot → revert one tighter, settle, no report", () => {
    const r = nextFitStep({ ...base, fitRung: 3, phase: "expanding", h: 1130, limit });
    expect(r).toEqual({ fitRung: 4, phase: "settled", report: false });
  });

  it("honest overflow at the tightest rung → settle, report", () => {
    const r = nextFitStep({ ...base, fitRung: 10, phase: "tightening", h: 1200, limit });
    expect(r).toEqual({ fitRung: 10, phase: "settled", report: true });
  });

  it("never oscillates: tightening→fit settles and never re-expands", () => {
    // Simulate a content height that fits with a big gap, but we arrived via
    // tightening — must NOT flip to expanding.
    const r = nextFitStep({ ...base, fitRung: 8, phase: "tightening", h: 600, limit });
    expect(r.phase).toBe("settled");
    expect(r.fitRung).toBe(8);
  });

  it("converges to settled within rungs.length steps (expand path)", () => {
    // Drive the machine with a fixed small height so it expands repeatedly.
    let state: { fitRung: number; phase: import("@/lib/render-engine/fit").FitPhase } = {
      fitRung: 5,
      phase: "init",
    };
    let steps = 0;
    let reported = false;
    // height grows slightly as we expand but stays under (limit - fillTol)
    // until rung 0, then we settle.
    for (; steps < 20; steps++) {
      const r = nextFitStep({ ...base, fitRung: state.fitRung, phase: state.phase, h: 700, limit });
      state = { fitRung: r.fitRung, phase: r.phase };
      if (r.report) {
        reported = true;
        break;
      }
    }
    expect(reported).toBe(true);
    expect(state.phase).toBe("settled");
    expect(state.fitRung).toBe(0); // expanded all the way (height never reached fill)
    expect(steps).toBeLessThanOrEqual(11);
  });
});
