/**
 * Unit tests — template heuristic edge cases not yet covered.
 *
 * The main heuristic tests live in tests/unit/tailor.test.ts; these extend
 * coverage to boundary conditions: empty JD, all-clean, all-sidebar, tie-break
 * edge case, explicit override combinations, and the resolveTemplate path.
 */

import { describe, it, expect } from "vitest";
import { recommendTemplate, resolveTemplate } from "@/lib/tailor/template-heuristic";

describe("recommendTemplate — edge cases", () => {
  it("returns sidebar for an empty string (default)", () => {
    const r = recommendTemplate("");
    expect(r.templateId).toBe("sidebar");
    expect(r.signals.clean).toBe(0);
    expect(r.signals.sidebar).toBe(0);
  });

  it("returns sidebar for a single-word non-signal JD", () => {
    const r = recommendTemplate("programmer");
    expect(r.templateId).toBe("sidebar");
  });

  it("returns clean when clean strictly dominates sidebar", () => {
    const r = recommendTemplate(
      "Senior investment banking associate at Goldman Sachs with accounting and compliance focus.",
    );
    expect(r.templateId).toBe("clean");
    expect(r.signals.clean).toBeGreaterThan(r.signals.sidebar);
  });

  it("returns sidebar when signals are tied (tie → sidebar default)", () => {
    // One clean + one sidebar → clean does NOT strictly dominate → sidebar
    const r = recommendTemplate("startup finance role");
    // "startup" → sidebar, "finance" → clean; tie or sidebar wins
    expect(r.templateId).toBe("sidebar");
  });

  it("returns sidebar when clean has 1 signal and sidebar has 1 signal (clean=1, sidebar=1)", () => {
    const r = recommendTemplate("software consulting role");
    // sidebar=1 ("software"), clean=1 ("consulting") → not clean > sidebar → sidebar
    expect(r.templateId).toBe("sidebar");
  });

  it("includes signal counts in the result", () => {
    const r = recommendTemplate(
      "machine learning SaaS startup product manager full-stack cloud",
    );
    expect(r.signals.sidebar).toBeGreaterThanOrEqual(3);
    expect(r.signals.clean).toBe(0);
    expect(r.templateId).toBe("sidebar");
  });

  it("reason string is non-empty", () => {
    expect(recommendTemplate("anything").reason.length).toBeGreaterThan(0);
  });

  it("case-insensitive matching (uppercase JD)", () => {
    const upper = recommendTemplate("INVESTMENT BANKING PRIVATE EQUITY GOVERNMENT COMPLIANCE");
    const lower = recommendTemplate("investment banking private equity government compliance");
    expect(upper.templateId).toBe("clean");
    expect(upper.signals.clean).toBe(lower.signals.clean);
  });
});

describe("resolveTemplate — edge cases", () => {
  it("sidebar override on a clean-leaning JD wins", () => {
    const r = resolveTemplate("investment banking consulting mckinsey", "sidebar");
    expect(r.templateId).toBe("sidebar");
    expect(r.overridden).toBe(true);
  });

  it("clean override on a tech JD wins", () => {
    const r = resolveTemplate("startup machine learning SaaS engineer", "clean");
    expect(r.templateId).toBe("clean");
    expect(r.overridden).toBe(true);
  });

  it("no override falls back to recommendation with overridden=false", () => {
    const r = resolveTemplate("government policy compliance analyst");
    expect(r.overridden).toBe(false);
    // The recommendation is clean given the formal signals
    expect(r.templateId).toBe("clean");
  });

  it("signals from the recommendation are preserved in the overridden result", () => {
    const r = resolveTemplate("startup machine learning cloud react", "clean");
    expect(r.signals.sidebar).toBeGreaterThanOrEqual(2);
  });
});
