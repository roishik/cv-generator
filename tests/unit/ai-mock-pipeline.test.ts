import { describe, it, expect } from "vitest";
import { MockProvider } from "@/lib/ai/mock";
import { extractProfile, tailorCv } from "@/lib/ai/pipeline";
import { CvData } from "@/lib/schemas/cv-data";
import {
  ExtractionResult,
  TailorResult,
} from "@/lib/schemas/llm-contracts";
import { SAMPLE_KB, SAMPLE_JD, SAMPLE_RESUME_TEXT } from "./fixtures/ai-fixtures";

const provider = new MockProvider();

describe("MockProvider — extraction contract", () => {
  it("returns a schema-valid ExtractionResult with no network", async () => {
    const res = await provider.extractProfile({ rawText: SAMPLE_RESUME_TEXT });
    expect(() => ExtractionResult.parse(res)).not.toThrow();
    expect(res.header.name).toBe("Dana Whitfield");
    expect(res.contact.email).toBe("dana@example.com");
    expect(res.experiences.length).toBeGreaterThan(0);
  });

  it("is deterministic (same input → same output)", async () => {
    const a = await provider.extractProfile({ rawText: SAMPLE_RESUME_TEXT });
    const b = await provider.extractProfile({ rawText: SAMPLE_RESUME_TEXT });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("extractProfile() contract", () => {
  it("produces a persistable KnowledgeBase with stable ids", async () => {
    let n = 0;
    const { knowledgeBase, profile } = await extractProfile(
      provider,
      SAMPLE_RESUME_TEXT,
      { idFor: () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}` },
    );
    expect(profile.header.name).toBe("Dana Whitfield");
    expect(knowledgeBase.experiences.every((e) => e.id.length === 36)).toBe(true);
    expect(knowledgeBase.header.name).toBe("Dana Whitfield");
  });
});

describe("MockProvider — tailoring contract", () => {
  it("returns a schema-valid TailorResult", async () => {
    const res = await provider.tailor({
      knowledgeBase: SAMPLE_KB,
      jdText: SAMPLE_JD,
      templateId: "clean",
    });
    expect(() => TailorResult.parse(res)).not.toThrow();
  });

  it("echoes real kbExperienceIds and never invents employers", async () => {
    const res = await provider.tailor({
      knowledgeBase: SAMPLE_KB,
      jdText: SAMPLE_JD,
      templateId: "clean",
    });
    const kbIds = new Set(SAMPLE_KB.experiences.map((e) => e.id));
    const kbCompanies = new Set(SAMPLE_KB.experiences.map((e) => e.company));
    for (const exp of res.cvData.experience) {
      expect(kbIds.has(exp.kbExperienceId)).toBe(true);
      expect(kbCompanies.has(exp.company)).toBe(true);
    }
  });

  it("flags JD requirements absent from the KB in warnings", async () => {
    const res = await provider.tailor({
      knowledgeBase: SAMPLE_KB,
      jdText: SAMPLE_JD,
      templateId: "clean",
    });
    expect(res.warnings.join(" ").toLowerCase()).toContain("kubernetes");
  });
});

describe("tailorCv() contract — full pipeline", () => {
  it("returns canonical CvData that passes the truthfulness guardrail", async () => {
    const out = await tailorCv(provider, {
      knowledgeBase: SAMPLE_KB,
      jobDescription: SAMPLE_JD,
      templateId: "clean",
    });
    expect(() => CvData.parse(out.cvData)).not.toThrow();
    expect(out.cvData.schemaVersion).toBe(1);
    expect(out.cvData.summary).toBe(out.cvData.header.summary);
    expect(out.truthfulness.ok).toBe(true);
    expect(out.truthfulness.flags.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("returns a deterministic style-lint report (finding 1.3, warnings only)", async () => {
    const out = await tailorCv(provider, {
      knowledgeBase: SAMPLE_KB,
      jobDescription: SAMPLE_JD,
      templateId: "clean",
    });
    expect(out.style).toBeDefined();
    expect(Array.isArray(out.style.flags)).toBe(true);
    // Style never blocks: there must be no error-severity flag.
    expect(out.style.flags.every((f) => f.severity === "warning")).toBe(true);
  });

  it("computes a diff against a baseline", async () => {
    const baseline = await tailorCv(provider, {
      knowledgeBase: SAMPLE_KB,
      jobDescription: "Generic role",
      templateId: "clean",
    });
    const tailored = await tailorCv(provider, {
      knowledgeBase: SAMPLE_KB,
      jobDescription: SAMPLE_JD,
      templateId: "clean",
      baselineCvData: baseline.cvData,
    });
    expect(Array.isArray(tailored.diff)).toBe(true);
  });
});
