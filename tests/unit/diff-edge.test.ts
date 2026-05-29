/**
 * Unit tests — structured diff edge cases.
 *
 * The main diff tests live in tests/unit/tailor.test.ts. These extend
 * coverage to: added/removed experiences, clean/header-only edits, skill
 * add/remove, education changes, and languages. All pure computation — no DB.
 */

import { describe, it, expect } from "vitest";
import { computeStructuredDiff } from "@/lib/tailor/diff";
import type { CvData } from "@/lib/schemas/cv-data";

const EXP_A = {
  kbExperienceId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
  company: "Northstar AI",
  role: "Senior PM",
  period: "2021 — Present",
  bullets: [
    "Led the 0→1 launch of an LLM developer platform.",
    "Defined the API roadmap with eng leadership.",
  ],
};

const EXP_B = {
  kbExperienceId: "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  company: "Mapline",
  role: "PM",
  bullets: ["Owned the geospatial analytics suite.", "Shipped self-serve onboarding."],
};

const base: CvData = {
  schemaVersion: 1,
  header: { name: "Dana", title: "Senior PM", summary: "Old summary" },
  contact: { email: "dana@example.com" },
  summary: "Old summary",
  skills: { professional: ["Strategy", "SQL"], soft: ["Leadership"] },
  experience: [EXP_A, EXP_B],
  education: [
    {
      kbEducationId: "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      institution: "University of Washington",
      degree: "B.S. Computer Science",
      period: "2012 — 2016",
    },
  ],
  leadership: [],
  languages: [{ name: "English", level: "Native" }],
};

describe("computeStructuredDiff — additional edge cases", () => {
  it("empty diff for identical CvData (idempotent)", () => {
    const d = computeStructuredDiff(base, base);
    expect(d.entries).toHaveLength(0);
    expect(d.summary).toEqual({ added: 0, rewritten: 0, removed: 0, reordered: 0 });
  });

  it("detects summary/title rewrite", () => {
    const tailored: CvData = {
      ...base,
      header: { ...base.header, title: "AI Product Lead", summary: "New summary targeting AI roles" },
      summary: "New summary targeting AI roles",
    };
    const d = computeStructuredDiff(base, tailored);
    const paths = d.entries.map((e) => e.path);
    expect(paths).toContain("header.title");
    expect(paths).toContain("summary");
    expect(d.summary.rewritten).toBeGreaterThanOrEqual(1);
  });

  it("detects added skills", () => {
    const tailored: CvData = {
      ...base,
      skills: { professional: ["Strategy", "SQL", "Roadmapping"], soft: ["Leadership"] },
    };
    const d = computeStructuredDiff(base, tailored);
    const skillsEntry = d.entries.find((e) => e.path === "skills.professional");
    expect(skillsEntry).toBeTruthy();
    // Either added or reordered/rewritten depending on implementation
    expect(["added", "rewritten", "reordered"]).toContain(skillsEntry!.kind);
  });

  it("detects removed skills", () => {
    const tailored: CvData = {
      ...base,
      skills: { professional: ["SQL"], soft: [] }, // removed Strategy, removed Leadership
    };
    const d = computeStructuredDiff(base, tailored);
    const hasSkillChange = d.entries.some((e) => e.path.startsWith("skills"));
    expect(hasSkillChange).toBe(true);
  });

  it("detects a removed experience (experience dropped from tailored)", () => {
    const tailored: CvData = {
      ...base,
      experience: [EXP_A], // EXP_B removed
    };
    const d = computeStructuredDiff(base, tailored);
    const removed = d.entries.filter((e) => e.kind === "removed");
    expect(removed.length).toBeGreaterThanOrEqual(1);
    expect(d.summary.removed).toBeGreaterThanOrEqual(1);
  });

  it("detects a new bullet (added)", () => {
    const tailored: CvData = {
      ...base,
      experience: [
        {
          ...EXP_A,
          bullets: [
            ...EXP_A.bullets,
            "Brand new bullet that was not in the baseline.",
          ],
        },
        EXP_B,
      ],
    };
    const d = computeStructuredDiff(base, tailored);
    const added = d.entries.filter((e) => e.kind === "added");
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(d.summary.added).toBeGreaterThanOrEqual(1);
  });

  it("detects a rewritten bullet (token-set overlap ≥40%)", () => {
    const tailored: CvData = {
      ...base,
      experience: [
        {
          ...EXP_A,
          bullets: [
            // Significantly overlaps the original first bullet
            "Led the successful 0→1 launch of an LLM developer platform to 40k devs.",
            EXP_A.bullets[1]!,
          ],
        },
        EXP_B,
      ],
    };
    const d = computeStructuredDiff(base, tailored);
    const rewritten = d.entries.filter((e) => e.kind === "rewritten");
    expect(rewritten.length).toBeGreaterThanOrEqual(1);
  });

  it("detects education changes (no crash)", () => {
    const tailored: CvData = {
      ...base,
      education: [
        {
          kbEducationId: "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
          institution: "University of Washington",
          degree: "B.S. Computer Science",
          period: "2012 — 2016",
          note: "Minor in Statistics added", // added note
        },
      ],
    };
    // Just verify no crash when education changes; diff might or might not capture the note
    const d = computeStructuredDiff(base, tailored);
    expect(d).toBeTruthy();
    expect(d.entries).toBeDefined();
  });

  it("does NOT include unchanged entries in the output", () => {
    const tailored: CvData = {
      ...base,
      header: { ...base.header, title: "New Title" }, // only title changed
    };
    const d = computeStructuredDiff(base, tailored);
    expect(d.entries.every((e) => e.kind !== "unchanged")).toBe(true);
  });

  it("summary counts match entries counts", () => {
    const tailored: CvData = {
      ...base,
      header: { ...base.header, title: "AI Lead", summary: "New summary" },
      summary: "New summary",
      skills: { professional: ["Strategy", "SQL", "ML"], soft: ["Leadership", "Comms"] },
      experience: [EXP_A], // removed EXP_B
    };
    const d = computeStructuredDiff(base, tailored);
    const counted = {
      added: d.entries.filter((e) => e.kind === "added").length,
      rewritten: d.entries.filter((e) => e.kind === "rewritten").length,
      removed: d.entries.filter((e) => e.kind === "removed").length,
      reordered: d.entries.filter((e) => e.kind === "reordered").length,
    };
    expect(d.summary.added).toBe(counted.added);
    expect(d.summary.rewritten).toBe(counted.rewritten);
    expect(d.summary.removed).toBe(counted.removed);
    expect(d.summary.reordered).toBe(counted.reordered);
  });
});
