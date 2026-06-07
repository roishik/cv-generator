import { describe, it, expect } from "vitest";
import { reconcile, type ReconcileSource } from "@/lib/ai/reconcile";

const cv: ReconcileSource = {
  label: "resume.pdf",
  experiences: [{ company: "Acme Corp", role: "Senior Product Manager", period: "2020 — 2023" }],
  education: [{ institution: "MIT", degree: "BSc Physics", period: "2014 — 2018" }],
};

describe("reconcile (finding 2.3)", () => {
  it("returns [] for a single source (nothing to cross-reference)", () => {
    expect(reconcile([cv])).toEqual([]);
  });

  it("returns [] when two sources fully agree", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Acme Corp", role: "Senior Product Manager", period: "2020 — 2023" }],
    };
    expect(reconcile([cv, linkedin])).toEqual([]);
  });

  it("flags a title mismatch for the same employer across sources", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Acme Corp", role: "Product Manager", period: "2020 — 2023" }],
    };
    const flags = reconcile([cv, linkedin]);
    const f = flags.find((x) => x.kind === "title-mismatch");
    expect(f).toBeTruthy();
    const vals = f!.values.map((v) => v.value);
    expect(vals).toContain("Senior Product Manager");
    expect(vals).toContain("Product Manager");
    expect(f!.values.map((v) => v.source).sort()).toEqual(["linkedin", "resume.pdf"]);
  });

  it("flags a period (date) mismatch for the same role", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Acme Corp", role: "Senior Product Manager", period: "2019 — 2023" }],
    };
    const flags = reconcile([cv, linkedin]);
    expect(flags.some((f) => f.kind === "period-mismatch")).toBe(true);
  });

  it("flags an employer-name variant (same employer, different spelling) and NOT a title mismatch", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Acme, Inc.", role: "Senior Product Manager", period: "2020 — 2023" }],
    };
    const flags = reconcile([cv, linkedin]);
    expect(flags.some((f) => f.kind === "employer-variant")).toBe(true);
    expect(flags.some((f) => f.kind === "title-mismatch")).toBe(false);
    expect(flags.some((f) => f.kind === "period-mismatch")).toBe(false);
  });

  it("flags a graduation-date mismatch for the same degree + institution", () => {
    const diploma: ReconcileSource = {
      label: "diploma",
      education: [{ institution: "MIT", degree: "BSc Physics", period: "2014 — 2019" }],
    };
    const flags = reconcile([cv, diploma]);
    expect(flags.some((f) => f.kind === "grad-date-mismatch")).toBe(true);
  });

  it("flags a degree-name mismatch for the same institution", () => {
    const diploma: ReconcileSource = {
      label: "diploma",
      education: [{ institution: "MIT", degree: "BEng Physics", period: "2014 — 2018" }],
    };
    const flags = reconcile([cv, diploma]);
    expect(flags.some((f) => f.kind === "degree-mismatch")).toBe(true);
  });

  it("does not flag experiences at genuinely different employers", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Globex", role: "Engineer", period: "2018 — 2020" }],
    };
    expect(reconcile([cv, linkedin])).toEqual([]);
  });

  it("ignores an undefined period (cannot conflict with a known one)", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Acme Corp", role: "Senior Product Manager" }], // no period
    };
    expect(reconcile([cv, linkedin]).some((f) => f.kind === "period-mismatch")).toBe(false);
  });

  it("each flag names the entity and lists the conflicting per-source values", () => {
    const linkedin: ReconcileSource = {
      label: "linkedin",
      experiences: [{ company: "Acme Corp", role: "Product Manager", period: "2020 — 2023" }],
    };
    const f = reconcile([cv, linkedin]).find((x) => x.kind === "title-mismatch")!;
    expect(f.entity.length).toBeGreaterThan(0);
    expect(f.message.length).toBeGreaterThan(0);
    expect(f.values.length).toBe(2);
  });
});
