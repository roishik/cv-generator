import { describe, it, expect } from "vitest";
import { MockProvider } from "@/lib/ai/mock";
import { KnowledgeBase } from "@/lib/schemas/knowledge-base";
import { tailorCacheKey } from "@/lib/tailor/cache";
import { buildTailorUserPrompt } from "@/lib/ai/prompts/tailor";

const kb = KnowledgeBase.parse({
  narrative: "x",
  header: { name: "Roi", title: "PM", summaryLong: "x" },
  contact: { email: "roi@example.com" },
  experiences: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company: "Acme",
      role: "PM",
      bulletsFull: ["Shipped things."],
      angles: [],
      tags: [],
    },
  ],
  education: [],
  leadership: [],
  skills: { professional: ["TS"], soft: [] },
  languages: [],
});

describe("mock editProfile (LLM call #3)", () => {
  it("adds a placeholder education entry for an 'add education' instruction, preserving existing data", async () => {
    const p = new MockProvider();
    const out = await p.editProfile({ currentKb: kb, instruction: "add my MSc in CS" });
    expect(out.experiences).toHaveLength(1); // unchanged
    expect(out.experiences[0]!.company).toBe("Acme");
    expect(out.education.length).toBe(1); // appended
  });

  it("adds a placeholder experience for an 'add experience' instruction", async () => {
    const p = new MockProvider();
    const out = await p.editProfile({ currentKb: kb, instruction: "add a job at Globex" });
    expect(out.experiences.length).toBe(2);
  });

  it("records a free-form instruction as a professional skill (visible change)", async () => {
    const p = new MockProvider();
    const out = await p.editProfile({ currentKb: kb, instruction: "mention Kubernetes" });
    expect(out.skills.professional).toContain("mention Kubernetes");
  });
});

describe("tailorCacheKey with instructions", () => {
  it("is unchanged when no instructions (back-compat)", () => {
    const a = tailorCacheKey({ kbVersion: 1, jobDescription: "Build ML", templateId: "sidebar" });
    const b = tailorCacheKey({
      kbVersion: 1,
      jobDescription: "Build ML",
      templateId: "sidebar",
      instructions: "",
    });
    expect(a).toBe(b);
  });
  it("differs when instructions are provided", () => {
    const a = tailorCacheKey({ kbVersion: 1, jobDescription: "Build ML", templateId: "sidebar" });
    const b = tailorCacheKey({
      kbVersion: 1,
      jobDescription: "Build ML",
      templateId: "sidebar",
      instructions: "drop bullet 3",
    });
    expect(a).not.toBe(b);
  });
});

describe("buildTailorUserPrompt", () => {
  it("includes user instructions when present", () => {
    const prompt = buildTailorUserPrompt({
      knowledgeBase: kb,
      jdText: "A job",
      templateId: "sidebar",
      instructions: "Emphasize leadership",
    });
    expect(prompt).toContain("Emphasize leadership");
    expect(prompt).toMatch(/Additional user instructions/i);
  });
  it("omits the instructions block when absent", () => {
    const prompt = buildTailorUserPrompt({ knowledgeBase: kb, jdText: "A job", templateId: "sidebar" });
    expect(prompt).not.toMatch(/Additional user instructions/i);
  });
});
