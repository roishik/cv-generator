import { describe, it, expect } from "vitest";
import { lintStyle, CLICHES } from "@/lib/ai/style-lint";
import { CvData } from "@/lib/schemas/cv-data";
import { EXP_NORTHSTAR, EXP_MAPLINE } from "./fixtures/ai-fixtures";

/**
 * Build a CvData with the given experience bullets + optional summary. Defaults
 * are clean (no style smells) so each test introduces exactly one problem.
 */
function cv(opts: {
  summary?: string;
  northstarBullets?: string[];
  maplineBullets?: string[];
}): CvData {
  return CvData.parse({
    schemaVersion: 1,
    header: { name: "Dana Whitfield", title: "Senior PM", summary: opts.summary ?? "Product leader." },
    contact: { email: "dana@example.com" },
    summary: opts.summary ?? "Product leader.",
    skills: { professional: ["Product Strategy"], soft: ["Mentoring"] },
    experience: [
      {
        kbExperienceId: EXP_NORTHSTAR,
        company: "Northstar AI",
        role: "Senior Product Manager",
        period: "2021 — Present",
        bullets: opts.northstarBullets ?? ["Led the launch of an LLM platform to 40,000 developers."],
      },
      {
        kbExperienceId: EXP_MAPLINE,
        company: "Mapline",
        role: "Product Manager",
        bullets: opts.maplineBullets ?? ["Owned the geospatial analytics suite for 300 customers."],
      },
    ],
    education: [],
  });
}

describe("lintStyle (finding 1.3)", () => {
  it("passes a clean CV with no flags", () => {
    const report = lintStyle(cv({}));
    expect(report.flags).toHaveLength(0);
    expect(report.ok).toBe(true);
  });

  it("never emits an error-severity flag (warnings only, never blocks)", () => {
    const report = lintStyle(
      cv({
        summary: "I am passionate about synergies.",
        northstarBullets: ["Responsible for things — and more things."],
      }),
    );
    expect(report.flags.length).toBeGreaterThan(0);
    expect(report.flags.every((f) => f.severity === "warning")).toBe(true);
  });

  it("flags an em-dash in a bullet", () => {
    const report = lintStyle(cv({ northstarBullets: ["Shipped the API — fast."] }));
    const f = report.flags.find((x) => x.kind === "em-dash");
    expect(f).toBeTruthy();
    expect(f!.path).toBe("experience[0].bullets[0]");
  });

  it("flags a literal double-hyphen em-dash too", () => {
    const report = lintStyle(cv({ summary: "Built things -- shipped things." }));
    expect(report.flags.some((f) => f.kind === "em-dash")).toBe(true);
  });

  it("does NOT flag an en-dash inside a period range (period field is not scanned)", () => {
    // The period "2021 — Present" must not be linted (it legitimately uses a dash).
    const report = lintStyle(cv({}));
    expect(report.flags.some((f) => f.kind === "em-dash")).toBe(false);
  });

  it("flags clichés from the blocklist in the summary", () => {
    const report = lintStyle(cv({ summary: "A team player who is passionate about driving synergies." }));
    const cliches = report.flags.filter((f) => f.kind === "cliche");
    expect(cliches.length).toBeGreaterThanOrEqual(2);
    expect(cliches.some((f) => f.value === "passionate about")).toBe(true);
    expect(cliches.some((f) => f.value === "team player")).toBe(true);
  });

  it("flags 'leverage my skills' but not a legitimate 'leveraged <tool>'", () => {
    const bad = lintStyle(cv({ summary: "I leverage my skills daily." }));
    expect(bad.flags.some((f) => f.kind === "cliche")).toBe(true);

    const good = lintStyle(cv({ northstarBullets: ["Leveraged Postgres to cut query time 40%."] }));
    expect(good.flags.some((f) => f.kind === "cliche")).toBe(false);
  });

  it("flags weak / passive bullet openers", () => {
    const report = lintStyle(
      cv({ northstarBullets: ["Responsible for the API roadmap and developer relations."] }),
    );
    const f = report.flags.find((x) => x.kind === "weak-opener");
    expect(f).toBeTruthy();
    expect(f!.value?.toLowerCase()).toContain("responsible for");
  });

  it("flags 'Helped with' and 'Worked on' as weak openers", () => {
    const report = lintStyle(
      cv({
        northstarBullets: ["Helped with onboarding.", "Worked on the dashboard."],
      }),
    );
    expect(report.flags.filter((f) => f.kind === "weak-opener")).toHaveLength(2);
  });

  it("flags duplicate bullet openers within one experience", () => {
    const report = lintStyle(
      cv({
        northstarBullets: [
          "Led the platform launch.",
          "Led the experimentation program.",
          "Led the API redesign.",
        ],
      }),
    );
    const dups = report.flags.filter((f) => f.kind === "duplicate-opener");
    // 3 bullets, same opener "Led" → 2 flagged (the 2nd and 3rd).
    expect(dups).toHaveLength(2);
  });

  it("does NOT treat the same opener across DIFFERENT experiences as a duplicate", () => {
    const report = lintStyle(
      cv({
        northstarBullets: ["Led the platform launch."],
        maplineBullets: ["Led the analytics suite."],
      }),
    );
    expect(report.flags.some((f) => f.kind === "duplicate-opener")).toBe(false);
  });

  it("exports a non-empty cliché dictionary for tuning/tests", () => {
    expect(Array.isArray(CLICHES)).toBe(true);
    expect(CLICHES).toContain("passionate about");
    expect(CLICHES).toContain("hit the ground running");
  });
});
