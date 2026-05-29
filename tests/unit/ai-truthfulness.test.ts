import { describe, it, expect } from "vitest";
import { verifyTruthfulness } from "@/lib/ai/truthfulness";
import { CvData } from "@/lib/schemas/cv-data";
import { SAMPLE_KB, EXP_NORTHSTAR, EXP_MAPLINE } from "./fixtures/ai-fixtures";

/** A clean, fully-provenanced tailored CvData built from SAMPLE_KB. */
function cleanCv(): CvData {
  return CvData.parse({
    schemaVersion: 1,
    header: {
      name: "Dana Whitfield",
      title: "Senior Product Manager",
      summary: "Product leader.",
    },
    contact: { email: "dana@example.com" },
    summary: "Product leader.",
    skills: {
      professional: ["Product Strategy", "ML/AI Products", "Developer Platforms"],
      soft: ["Mentoring"],
    },
    experience: [
      {
        kbExperienceId: EXP_NORTHSTAR,
        company: "Northstar AI",
        role: "Senior Product Manager",
        period: "2021 — Present",
        bullets: [
          "Led the 0 to 1 launch of an LLM developer platform, growing to 40,000 monthly active developers in 14 months.",
        ],
      },
      {
        kbExperienceId: EXP_MAPLINE,
        company: "Mapline",
        role: "Product Manager",
        bullets: ["Owned the geospatial analytics suite used by 300+ enterprise customers."],
      },
    ],
    education: [],
  });
}

describe("verifyTruthfulness", () => {
  it("passes a clean, fully-provenanced tailored CV", () => {
    const report = verifyTruthfulness(cleanCv(), SAMPLE_KB);
    expect(report.ok).toBe(true);
    expect(report.flags.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("catches a fabricated employer / unknown kbExperienceId (ERROR)", () => {
    const cv = cleanCv();
    cv.experience.push({
      kbExperienceId: "99999999-9999-4999-8999-999999999999",
      company: "Fabricated Corp",
      role: "VP",
      bullets: ["Did things that never happened."],
    });
    const report = verifyTruthfulness(cv, SAMPLE_KB);
    expect(report.ok).toBe(false);
    const kinds = report.flags.map((f) => f.kind);
    expect(kinds).toContain("unknown-kb-experience-id");
    expect(kinds).toContain("new-employer");
  });

  it("catches a company swapped under a real id (ERROR)", () => {
    const cv = cleanCv();
    cv.experience[0]!.company = "Google"; // real id, wrong company
    const report = verifyTruthfulness(cv, SAMPLE_KB);
    expect(report.ok).toBe(false);
    expect(report.flags.some((f) => f.kind === "company-mismatch")).toBe(true);
  });

  it("catches a period swapped under a real id (ERROR)", () => {
    const cv = cleanCv();
    cv.experience[0]!.period = "1999 — 2000";
    const report = verifyTruthfulness(cv, SAMPLE_KB);
    expect(report.flags.some((f) => f.kind === "period-mismatch")).toBe(true);
  });

  it("flags a novel skill not derivable from the KB (WARNING, not error)", () => {
    const cv = cleanCv();
    cv.skills.professional.push("Kubernetes");
    const report = verifyTruthfulness(cv, SAMPLE_KB);
    expect(report.flags.some((f) => f.kind === "novel-skill")).toBe(true);
    // skill containment is soft → still ok unless a real provenance error exists
    expect(report.ok).toBe(true);
  });

  it("flags a fabricated metric not present in the KB source bullets (WARNING)", () => {
    const cv = cleanCv();
    cv.experience[0]!.bullets = ["Grew revenue 500% to $99M."];
    const report = verifyTruthfulness(cv, SAMPLE_KB);
    expect(report.flags.some((f) => f.kind === "unverified-metric")).toBe(true);
  });

  it("does not flag a metric that IS present in the KB source bullets", () => {
    const cv = cleanCv();
    cv.experience[0]!.bullets = ["Reached 40,000 monthly active developers."];
    const report = verifyTruthfulness(cv, SAMPLE_KB);
    expect(report.flags.some((f) => f.kind === "unverified-metric")).toBe(false);
  });
});
