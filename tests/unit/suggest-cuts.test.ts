import { describe, it, expect } from "vitest";
import { suggestCuts } from "@/lib/tailor/suggest-cuts";
import { CvData } from "@/lib/schemas/cv-data";
import { EXP_NORTHSTAR, EXP_MAPLINE } from "./fixtures/ai-fixtures";

const B0 = "Led the Kubernetes platform migration cutting deploy time 40%."; // rel 2 (best)
const B1 = "Organized the annual team offsite in Lisbon."; // rel 0
const B2 = "Painted a mural in the office kitchen one weekend."; // rel 0
const B3 = "Shipped the data dashboard used across the org."; // rel 1 (data)
const C0 = "Maintained legacy billing scripts in Perl."; // rel 0
const C1 = "Built the Kubernetes CI pipeline for the data group."; // rel 3 (best)

const JD =
  "Platform engineer wanted: Kubernetes, CI/CD pipeline, and data infrastructure ownership.";

function fixture(): CvData {
  return CvData.parse({
    schemaVersion: 1,
    header: { name: "Dana", title: "Engineer", summary: "Builder." },
    contact: { email: "d@example.com" },
    summary: "Builder.",
    skills: { professional: ["Kubernetes"], soft: ["Mentoring"] },
    experience: [
      {
        kbExperienceId: EXP_NORTHSTAR,
        company: "Northstar AI",
        role: "Senior Engineer",
        bullets: [B0, B1, B2, B3],
      },
      {
        kbExperienceId: EXP_MAPLINE,
        company: "Mapline",
        role: "Engineer",
        bullets: [C0, C1],
      },
    ],
    education: [],
  });
}

const texts = (s: ReturnType<typeof suggestCuts>) => s.map((c) => c.text);

describe("suggestCuts (finding 1.4)", () => {
  it("never suggests cutting the highest-value bullet of an experience", () => {
    const cuts = suggestCuts(fixture(), JD);
    // B0 (best of exp0) and C1 (best of exp1) must be protected.
    expect(texts(cuts)).not.toContain(B0);
    expect(texts(cuts)).not.toContain(C1);
  });

  it("guarantees every experience keeps at least one bullet even if all cuts are taken", () => {
    const cuts = suggestCuts(fixture(), JD);
    for (const expIndex of [0, 1]) {
      const cutInExp = cuts.filter((c) => c.experienceIndex === expIndex).length;
      const totalInExp = expIndex === 0 ? 4 : 2;
      expect(cutInExp).toBeLessThanOrEqual(totalInExp - 1);
    }
  });

  it("cuts by signal, not by section: a 0-relevance recent bullet outranks a relevant one", () => {
    const cuts = texts(suggestCuts(fixture(), JD));
    // B1/B2 (relevance 0) must rank ahead of B3 (relevance 1) for cutting.
    expect(cuts.indexOf(B1)).toBeLessThan(cuts.indexOf(B3));
    expect(cuts.indexOf(B2)).toBeLessThan(cuts.indexOf(B3));
  });

  it("ranks a 0-relevance OLDER bullet ahead of a relevant RECENT bullet (cross-section)", () => {
    const cuts = texts(suggestCuts(fixture(), JD));
    // C0 sits in the older experience; B3 in the recent one. Relevance wins.
    expect(cuts.indexOf(C0)).toBeGreaterThanOrEqual(0);
    expect(cuts.indexOf(C0)).toBeLessThan(cuts.indexOf(B3));
  });

  it("annotates each suggestion with relevance + a human reason", () => {
    const cuts = suggestCuts(fixture(), JD);
    const first = cuts[0]!;
    expect(typeof first.relevance).toBe("number");
    expect(first.reason.length).toBeGreaterThan(0);
    expect(first.path).toMatch(/^experience\[\d+\]\.bullets\[\d+\]$/);
  });

  it("favors a duplicated bullet for cutting over a unique one of equal relevance", () => {
    const cv = CvData.parse({
      schemaVersion: 1,
      header: { name: "Dana", title: "Engineer", summary: "Builder." },
      contact: { email: "d@example.com" },
      summary: "Builder.",
      skills: { professional: ["X"], soft: [] },
      experience: [
        {
          kbExperienceId: EXP_NORTHSTAR,
          company: "Northstar AI",
          role: "Engineer",
          bullets: [
            "Owned the customer onboarding redesign end to end.", // best (protected)
            "Ran the quarterly hackathon for the office.", // unique, rel 0
            "Ran the quarterly hackathon for the office again.", // near-duplicate, rel 0
          ],
        },
      ],
      education: [],
    });
    const cuts = suggestCuts(cv, "Backend role with database tuning.");
    const dup = cuts.find((c) => c.duplicated);
    expect(dup).toBeTruthy();
    // the duplicated bullet should rank first among the cuts
    expect(cuts[0]!.duplicated).toBe(true);
  });

  it("returns suggestions for an empty JD without throwing (ranks by duplication/length)", () => {
    expect(() => suggestCuts(fixture(), "")).not.toThrow();
    expect(suggestCuts(fixture(), "").length).toBeGreaterThan(0);
  });

  it("returns [] when every experience has a single bullet (nothing safe to cut)", () => {
    const cv = CvData.parse({
      schemaVersion: 1,
      header: { name: "Dana", title: "Engineer", summary: "Builder." },
      contact: { email: "d@example.com" },
      summary: "Builder.",
      skills: { professional: ["X"], soft: [] },
      experience: [
        { kbExperienceId: EXP_NORTHSTAR, company: "A", role: "R", bullets: ["Only bullet here."] },
        { kbExperienceId: EXP_MAPLINE, company: "B", role: "R", bullets: ["Only bullet there."] },
      ],
      education: [],
    });
    expect(suggestCuts(cv, JD)).toEqual([]);
  });
});
