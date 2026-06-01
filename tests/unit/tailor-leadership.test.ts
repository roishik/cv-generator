import { describe, it, expect } from "vitest";
import { tailorCv } from "@/lib/ai/pipeline";
import type { LLMProvider } from "@/lib/ai/provider";
import type { TailorResult } from "@/lib/schemas/llm-contracts";
import type { CvData } from "@/lib/schemas/cv-data";
import type { KnowledgeBase } from "@/lib/schemas/knowledge-base";

const EXP_ID = "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f";
const LEAD_ID = "11112222-3333-4444-5555-666677778888";

const kb: KnowledgeBase = {
  narrative: "Builder.",
  header: { name: "Roi", title: "PM", summaryLong: "Builder." },
  contact: { email: "roi@example.com" },
  experiences: [
    {
      id: EXP_ID,
      company: "Acme",
      role: "PM",
      bulletsFull: ["Shipped the platform.", "Grew activation."],
      angles: [],
      tags: [],
    },
  ],
  education: [],
  leadership: [
    { id: LEAD_ID, name: "Locals App", description: "Built an app for local businesses.", tags: [] },
  ],
  skills: { professional: ["Roadmapping"], soft: ["Communication"] },
  languages: [],
};

const baseline: CvData = {
  schemaVersion: 1,
  header: { name: "Roi", title: "PM", summary: "Builder." },
  contact: { email: "roi@example.com" },
  summary: "Builder.",
  skills: { professional: ["Roadmapping"], soft: ["Communication"] },
  experience: [{ kbExperienceId: EXP_ID, company: "Acme", role: "PM", bullets: ["Shipped the platform."] }],
  education: [],
  leadership: [{ kbLeadershipId: LEAD_ID, name: "Locals App", description: "Built an app for local businesses." }],
  languages: [],
  photoUrl: "data:image/png;base64,AAAA",
  sectionTitles: { leadership: "Side Projects" },
};

/** A provider that drops leadership and emits a header-as-value soft skill — the exact failure we saw live. */
function makeBadProvider(): LLMProvider {
  const result: TailorResult = {
    cvData: {
      header: { name: "Roi", title: "PM", summary: "Tailored." },
      contact: { email: "roi@example.com" },
      summary: "Tailored.",
      skills: { professional: ["Roadmapping"], soft: ["Soft Skills"] },
      experience: [{ kbExperienceId: EXP_ID, company: "Acme", role: "PM", bullets: ["Shipped the platform."] }],
      education: [],
      // leadership intentionally omitted (undefined)
    },
    rationale: [],
    templateSuggestion: "sidebar",
    warnings: [],
  };
  return {
    id: "mock",
    validateKey: async () => ({ ok: true }),
    extractProfile: async () => {
      throw new Error("not used");
    },
    tailor: async () => result,
  };
}

describe("tailorCv — section preservation", () => {
  it("carries baseline leadership forward when the provider omits it", async () => {
    const out = await tailorCv(makeBadProvider(), {
      knowledgeBase: kb,
      jobDescription: "Looking for a builder PM for our platform team.",
      templateId: "sidebar",
      baselineCvData: baseline,
    });
    expect(out.cvData.leadership).toHaveLength(1);
    expect(out.cvData.leadership[0]!.name).toBe("Locals App");
  });

  it('drops the degenerate "Soft Skills" header value from tailored skills', async () => {
    const out = await tailorCv(makeBadProvider(), {
      knowledgeBase: kb,
      jobDescription: "Looking for a builder PM for our platform team.",
      templateId: "sidebar",
      baselineCvData: baseline,
    });
    expect(out.cvData.skills.soft).toEqual([]);
  });

  it("carries the photo and custom section titles forward from the baseline", async () => {
    const out = await tailorCv(makeBadProvider(), {
      knowledgeBase: kb,
      jobDescription: "Looking for a builder PM for our platform team.",
      templateId: "sidebar",
      baselineCvData: baseline,
    });
    expect(out.cvData.photoUrl).toBe("data:image/png;base64,AAAA");
    expect(out.cvData.sectionTitles?.leadership).toBe("Side Projects");
  });
});
