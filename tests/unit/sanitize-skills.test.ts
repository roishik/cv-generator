import { describe, it, expect } from "vitest";
import {
  sanitizeSkills,
  sanitizeSkillList,
  isMeaningfulSkill,
} from "@/lib/ai/sanitize-skills";

describe("sanitizeSkills", () => {
  it('drops the header-as-value "Soft Skills" (the real extraction bug)', () => {
    const out = sanitizeSkills({
      professional: ["TypeScript", "Postgres"],
      soft: ["Soft Skills"],
    });
    expect(out.soft).toEqual([]);
    expect(out.professional).toEqual(["TypeScript", "Postgres"]);
  });

  it("drops empty / whitespace / generic-header values", () => {
    expect(sanitizeSkillList(["", "  ", "Skills", "Professional Skills", "Go"])).toEqual([
      "Go",
    ]);
  });

  it("drops a value equal to its own category name", () => {
    expect(sanitizeSkillList(["professional", "Leadership"], "professional")).toEqual([
      "Leadership",
    ]);
  });

  it("de-dupes case-insensitively and trims", () => {
    expect(sanitizeSkillList([" React ", "react", "REACT"])).toEqual(["React"]);
  });

  it("keeps legitimate skills untouched", () => {
    expect(isMeaningfulSkill("Machine Learning")).toBe(true);
    expect(isMeaningfulSkill("Stakeholder Management")).toBe(true);
  });
});
