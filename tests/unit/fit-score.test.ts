import { describe, it, expect } from "vitest";
import { computeFitAssessment, fitVerdict } from "@/lib/tailor/fit-score";
import { SAMPLE_KB, SAMPLE_JD } from "./fixtures/ai-fixtures";

const NURSING_JD =
  "Registered nurse for the ICU ward. Phlebotomy, patient triage, IV therapy, and electronic health records charting in a busy hospital.";

describe("fitVerdict thresholds (finding 2.1, from 04-job-evaluation.md)", () => {
  it("maps scores to the rubric's bands", () => {
    expect(fitVerdict(80)).toBe("Strong fit"); // 75+
    expect(fitVerdict(75)).toBe("Strong fit");
    expect(fitVerdict(70)).toBe("Good fit"); // 60-74
    expect(fitVerdict(60)).toBe("Good fit");
    expect(fitVerdict(50)).toBe("Moderate fit"); // 45-59
    expect(fitVerdict(35)).toBe("Weak fit"); // 30-44
    expect(fitVerdict(10)).toBe("Poor fit"); // <30
  });
});

describe("computeFitAssessment (finding 2.1)", () => {
  it("returns null for an absent / too-short JD (instructions-only run)", () => {
    expect(computeFitAssessment(SAMPLE_KB, "")).toBeNull();
    expect(computeFitAssessment(SAMPLE_KB, "short")).toBeNull();
  });

  it("rates a well-matched PM/platform JD a strong-or-good fit", () => {
    const fit = computeFitAssessment(SAMPLE_KB, SAMPLE_JD)!;
    expect(fit).not.toBeNull();
    expect(["Strong fit", "Good fit"]).toContain(fit.verdict);
    expect(fit.overall).toBeGreaterThanOrEqual(60);
    expect(fit.method).toBe("keyword-overlap");
  });

  it("surfaces a real JD requirement absent from the KB as a gap (Kubernetes)", () => {
    const fit = computeFitAssessment(SAMPLE_KB, SAMPLE_JD)!;
    expect(fit.gaps.join(" ").toLowerCase()).toContain("kubernetes");
  });

  it("surfaces matched JD signals as strengths (platform/product)", () => {
    const fit = computeFitAssessment(SAMPLE_KB, SAMPLE_JD)!;
    const s = fit.strengths.join(" ").toLowerCase();
    expect(s.includes("platform") || s.includes("product")).toBe(true);
    expect(fit.strengths.length).toBeGreaterThan(0);
  });

  it("rates a completely unrelated JD a weak/poor fit with many gaps", () => {
    const fit = computeFitAssessment(SAMPLE_KB, NURSING_JD)!;
    expect(["Weak fit", "Poor fit", "Moderate fit"]).toContain(fit.verdict);
    expect(fit.overall).toBeLessThan(SAMPLE_KB ? 60 : 0);
    expect(fit.gaps.length).toBeGreaterThan(0);
  });

  it("keeps every score in [0,100] and overall as a weighted blend of the dims", () => {
    const fit = computeFitAssessment(SAMPLE_KB, SAMPLE_JD)!;
    for (const n of [fit.skillsMatch, fit.experienceMatch, fit.overall]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
    // weighted average lies within [min, max] of its components (± rounding).
    const lo = Math.min(fit.skillsMatch, fit.experienceMatch);
    const hi = Math.max(fit.skillsMatch, fit.experienceMatch);
    expect(fit.overall).toBeGreaterThanOrEqual(lo - 1);
    expect(fit.overall).toBeLessThanOrEqual(hi + 1);
  });

  it("caps the strengths/gaps lists so the UI stays scannable", () => {
    const fit = computeFitAssessment(SAMPLE_KB, NURSING_JD)!;
    expect(fit.gaps.length).toBeLessThanOrEqual(8);
    expect(fit.strengths.length).toBeLessThanOrEqual(8);
  });
});
