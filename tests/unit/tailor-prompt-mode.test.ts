import { describe, it, expect } from "vitest";
import {
  buildTailorPrompts,
  TAILOR_SYSTEM_PROMPT,
  TAILOR_EDIT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/tailor";
import { KnowledgeBaseForLLM } from "@/lib/schemas/knowledge-base";
import type { CvData } from "@/lib/schemas/cv-data";

const kb = KnowledgeBaseForLLM.parse({ header: { name: "Dana" } });

const baseline: CvData = {
  schemaVersion: 1,
  header: { name: "Dana", title: "Senior PM", summary: "S." },
  contact: { email: "d@example.com" },
  summary: "S.",
  skills: { professional: ["Strategy"], soft: ["Leadership"] },
  experience: [
    {
      kbExperienceId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      company: "Northstar AI",
      role: "Senior PM",
      period: "2021 — Present",
      bullets: ["b1", "b2", "b3"],
    },
  ],
  education: [],
  leadership: [],
  languages: [],
};

const JD =
  "We are hiring a Senior Product Manager to own our AI developer platform roadmap and GTM.";

describe("buildTailorPrompts", () => {
  it("uses minimal-edit mode (edit system prompt + embedded current CV) when instructions are given without a JD", () => {
    const { system, user } = buildTailorPrompts({
      knowledgeBase: kb,
      jdText: "",
      templateId: "sidebar",
      instructions: "change the product manager points from 3 to 2",
      baselineCvData: baseline,
    });
    expect(system).toBe(TAILOR_EDIT_SYSTEM_PROMPT);
    // the current CV is embedded so the model edits it rather than rebuilding.
    expect(user).toContain("CURRENT CV");
    expect(user).toContain("Northstar AI");
    expect(user).toContain("change the product manager points from 3 to 2");
    // the edit prompt must not invite a JD-driven rebuild.
    expect(user).not.toContain("strong, well-rounded one-page CV");
  });

  it("uses full tailor mode (tailor system prompt) when a real JD is present", () => {
    const { system, user } = buildTailorPrompts({
      knowledgeBase: kb,
      jdText: JD,
      templateId: "sidebar",
      instructions: "emphasize leadership",
      baselineCvData: baseline,
    });
    expect(system).toBe(TAILOR_SYSTEM_PROMPT);
    expect(user).toContain("Job description to tailor toward:");
    expect(user).toContain("emphasize leadership"); // instructions still appended
  });

  it("treats a too-short JD with no instructions as the non-edit fallback (no current-CV embed)", () => {
    const { system } = buildTailorPrompts({
      knowledgeBase: kb,
      jdText: "short",
      templateId: "clean",
    });
    // no instructions → not edit mode → standard tailor system prompt.
    expect(system).toBe(TAILOR_SYSTEM_PROMPT);
  });
});
