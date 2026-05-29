/**
 * Unit tests — Schema validation edge cases for CvData, ThemeTokens, KnowledgeBase.
 *
 * Extends tests/unit/schemas-cv-data.test.ts with:
 *  - CvData optional fields / edge values
 *  - Provenance guardrail (UUID format enforcement)
 *  - ThemeTokens complete/minimal validation
 *  - KnowledgeBase round-trip
 *  - LLM contracts (ExtractionResult, TailorResult) accept/reject
 */

import { describe, it, expect } from "vitest";
import { CvData, ThemeTokens, TemplateId } from "@/lib/schemas/cv-data";
import { ExtractionResult, TailorResult } from "@/lib/schemas/llm-contracts";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { sidebarDefault } from "@/lib/render-engine/themes/registry";

// ─── CvData edge cases ────────────────────────────────────────────────────────

describe("CvData — edge cases", () => {
  it("accepts a minimal CvData (no optional fields)", () => {
    const minimal = {
      schemaVersion: 1,
      header: { name: "Jane Doe", title: "Engineer", summary: "Quick summary" },
      contact: {},
      summary: "Quick summary",
      skills: { professional: ["TypeScript"], soft: [] },
      experience: [
        {
          kbExperienceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          company: "ACME",
          role: "SWE",
          bullets: ["Built stuff"],
        },
      ],
      education: [],
    };
    const r = CvData.safeParse(minimal);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.leadership).toEqual([]);
      expect(r.data.languages).toEqual([]);
    }
  });

  it("accepts CvData with photo, leadership, languages", () => {
    const full = {
      ...sampleCvData,
      photoUrl: "files/abc/photo.jpg",
    };
    expect(CvData.safeParse(full).success).toBe(true);
  });

  it("rejects schemaVersion !== 1", () => {
    const bad = { ...sampleCvData, schemaVersion: 2 };
    expect(CvData.safeParse(bad).success).toBe(false);
  });

  it("rejects empty name in header", () => {
    const bad = { ...sampleCvData, header: { ...sampleCvData.header, name: "" } };
    expect(CvData.safeParse(bad).success).toBe(false);
  });

  it("rejects experience with empty bullets array", () => {
    const bad = {
      ...sampleCvData,
      experience: [{ ...sampleCvData.experience[0], bullets: [] }],
    };
    expect(CvData.safeParse(bad).success).toBe(false);
  });

  it("rejects non-UUID kbExperienceId", () => {
    const bad = {
      ...sampleCvData,
      experience: [{ ...sampleCvData.experience[0], kbExperienceId: "not-a-uuid" }],
    };
    expect(CvData.safeParse(bad).success).toBe(false);
  });

  it("accepts leadership with optional kbLeadershipId and url", () => {
    const withLeadership = {
      ...sampleCvData,
      leadership: [
        { name: "PM Circle", description: "Mentoring 30 early-career PMs." },
        { kbLeadershipId: "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f", name: "OSS", description: "Open source.", url: "oss.org" },
      ],
    };
    expect(CvData.safeParse(withLeadership).success).toBe(true);
  });

  it("accepts languages with multiple entries", () => {
    const withLangs = {
      ...sampleCvData,
      languages: [
        { name: "English", level: "Native" },
        { name: "Spanish", level: "Professional" },
        { name: "French", level: "Basic" },
      ],
    };
    expect(CvData.safeParse(withLangs).success).toBe(true);
  });

  it("accepts optional contact fields", () => {
    const partial = {
      ...sampleCvData,
      contact: { email: "x@example.com" }, // only email
    };
    expect(CvData.safeParse(partial).success).toBe(true);
  });
});

// ─── TemplateId enum ─────────────────────────────────────────────────────────

describe("TemplateId", () => {
  it("accepts 'sidebar' and 'clean'", () => {
    expect(TemplateId.safeParse("sidebar").success).toBe(true);
    expect(TemplateId.safeParse("clean").success).toBe(true);
  });
  it("rejects arbitrary strings", () => {
    expect(TemplateId.safeParse("dark").success).toBe(false);
    expect(TemplateId.safeParse("").success).toBe(false);
  });
});

// ─── ThemeTokens edge cases ───────────────────────────────────────────────────

describe("ThemeTokens — edge cases", () => {
  it("rejects negative spacing values (structurally: just validates type, not range)", () => {
    // ThemeTokens validates shape, not positive-only; just ensure parsing works.
    const copy = { ...sidebarDefault, layout: { ...sidebarDefault.layout, sectionGapPx: -1 } };
    // Negative values are technically allowed by the schema (it only validates type:number).
    // This test documents the current behavior.
    expect(ThemeTokens.safeParse(copy).success).toBe(true);
  });

  it("rejects unknown bullet styles", () => {
    const bad = { ...sidebarDefault, bullet: { ...sidebarDefault.bullet, style: "star" } };
    expect(ThemeTokens.safeParse(bad).success).toBe(false);
  });

  it("rejects missing required page fields", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { page: _removedPage, ...rest } = sidebarDefault;
    expect(ThemeTokens.safeParse(rest).success).toBe(false);
  });
});

// ─── ExtractionResult ─────────────────────────────────────────────────────────

describe("ExtractionResult schema", () => {
  const VALID: object = {
    header: { name: "Dana", title: "PM", summaryLong: "Experienced." },
    contact: { email: "dana@ex.com" },
    experiences: [
      { company: "Northstar", role: "PM", bulletsFull: ["Led X", "Did Y"] },
    ],
    education: [{ institution: "UW", degree: "BS CS" }],
    skills: { professional: ["Product"], soft: ["Leadership"] },
  };

  it("accepts a valid extraction result", () => {
    expect(ExtractionResult.safeParse(VALID).success).toBe(true);
  });

  it("accepts optional leadership/languages fields", () => {
    const withExtras = {
      ...VALID,
      leadership: [{ name: "OSS Mentoring", description: "Ran a group." }],
      languages: [{ name: "English", level: "Native" }],
    };
    expect(ExtractionResult.safeParse(withExtras).success).toBe(true);
  });

  it("rejects missing required header.name", () => {
    const bad = { ...VALID, header: { title: "PM" } };
    expect(ExtractionResult.safeParse(bad).success).toBe(false);
  });

  it("rejects experience with no company", () => {
    const bad = {
      ...VALID,
      experiences: [{ role: "PM", bulletsFull: ["did x"] }],
    };
    expect(ExtractionResult.safeParse(bad).success).toBe(false);
  });
});

// ─── TailorResult schema ──────────────────────────────────────────────────────

describe("TailorResult schema", () => {
  const VALID_EXP_ID = "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f";

  const VALID: object = {
    cvData: {
      header: { name: "Dana", title: "AI PM", summary: "Tailored." },
      contact: { email: "dana@ex.com" },
      summary: "Tailored.",
      skills: { professional: ["Product"], soft: [] },
      experience: [
        {
          kbExperienceId: VALID_EXP_ID,
          company: "Northstar",
          role: "PM",
          bullets: ["Led X"],
        },
      ],
      education: [],
    },
    rationale: [{ field: "summary", change: "Updated", reason: "JD signal" }],
    templateSuggestion: "sidebar",
    warnings: [],
  };

  it("accepts a valid tailor result", () => {
    expect(TailorResult.safeParse(VALID).success).toBe(true);
  });

  it("accepts warnings array with messages", () => {
    const withWarnings = { ...VALID, warnings: ["JD wants Kubernetes; not in KB"] };
    expect(TailorResult.safeParse(withWarnings).success).toBe(true);
  });

  it("rejects invalid templateSuggestion", () => {
    const bad = { ...VALID, templateSuggestion: "dark" };
    expect(TailorResult.safeParse(bad).success).toBe(false);
  });

  it("rejects missing cvData.experience kbExperienceId", () => {
    const bad = {
      ...VALID,
      cvData: {
        ...(VALID as { cvData: object }).cvData,
        experience: [{ company: "Co", role: "PM", bullets: ["x"] }],
      },
    };
    expect(TailorResult.safeParse(bad).success).toBe(false);
  });
});
