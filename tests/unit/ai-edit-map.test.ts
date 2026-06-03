import { describe, it, expect } from "vitest";
import { toLlmKb, fromExtraction } from "@/app/(app)/knowledge-base/ai-edit-map";
import { EditableKnowledgeBase, type EditableKnowledgeBase as EditableKb } from "@/app/(app)/knowledge-base/schema";
import { MockProvider } from "@/lib/ai/mock";

const EXP_ID = "11111111-1111-4111-8111-111111111111";

const editable: EditableKb = {
  narrative: "Builder.",
  header: { name: "Roi", title: "PM", summaryLong: "Builder." },
  contact: { email: "roi@example.com" },
  experiences: [
    {
      id: EXP_ID,
      company: "Acme",
      role: "PM",
      bulletsFull: ["Shipped the platform."],
      angles: [],
      tags: [],
    },
  ],
  education: [],
  skills: { professional: ["TypeScript"], soft: ["Comms"] },
};

describe("Edit-with-AI mapping", () => {
  it("toLlmKb produces a valid KnowledgeBase the LLM can consume", () => {
    const kb = toLlmKb(editable);
    expect(kb.experiences[0]!.id).toBe(EXP_ID);
    expect(kb.header.name).toBe("Roi");
  });

  it("round-trips through the mock and yields a savable editable KB, preserving the experience id", async () => {
    const kb = toLlmKb(editable);
    const result = await new MockProvider().editProfile({
      currentKb: kb,
      instruction: "add a bullet about mentoring",
    });
    const next = fromExtraction(result, editable);

    // The output must satisfy the editor's save schema.
    expect(EditableKnowledgeBase.safeParse(next).success).toBe(true);
    // Provenance: the retained Acme experience keeps its original id (so
    // existing tailored docs' kbExperienceId links survive a Save).
    const acme = next.experiences.find((e) => e.company === "Acme");
    expect(acme?.id).toBe(EXP_ID);
  });

  it("leaves brand-new entries without an id (so Save mints fresh rows)", async () => {
    const kb = toLlmKb(editable);
    const result = await new MockProvider().editProfile({
      currentKb: kb,
      instruction: "add a job at Globex",
    });
    const next = fromExtraction(result, editable);
    const globex = next.experiences.find((e) => /Globex/i.test(e.company));
    expect(globex).toBeTruthy();
    expect(globex?.id).toBeUndefined();
  });
});
