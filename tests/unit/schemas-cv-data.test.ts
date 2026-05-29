import { describe, it, expect } from "vitest";
import { CvData, ThemeTokens } from "@/lib/schemas/cv-data";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { sidebarDefault, cleanDefault } from "@/lib/render-engine/themes/registry";

describe("CvData schema", () => {
  it("round-trips the sample fixture", () => {
    const parsed = CvData.parse(sampleCvData);
    expect(parsed.header.name).toBe("Dana Whitfield");
    expect(parsed.experience).toHaveLength(2);
    expect(parsed.leadership).toHaveLength(1);
    expect(parsed.languages).toHaveLength(2);
  });

  it("defaults leadership/languages to []", () => {
    const minimal = CvData.parse({
      schemaVersion: 1,
      header: { name: "A B", title: "PM", summary: "x" },
      contact: {},
      summary: "x",
      skills: { professional: [], soft: [] },
      experience: [
        {
          kbExperienceId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
          company: "Co",
          role: "PM",
          bullets: ["did a thing"],
        },
      ],
      education: [],
    });
    expect(minimal.leadership).toEqual([]);
    expect(minimal.languages).toEqual([]);
  });

  it("rejects invalid kbExperienceId (provenance shape)", () => {
    const bad = { ...sampleCvData, experience: [{ ...sampleCvData.experience[0], kbExperienceId: "not-a-uuid" }] };
    expect(CvData.safeParse(bad).success).toBe(false);
  });

  it("rejects an experience with zero bullets", () => {
    const bad = { ...sampleCvData, experience: [{ ...sampleCvData.experience[0], bullets: [] }] };
    expect(CvData.safeParse(bad).success).toBe(false);
  });

  it("rejects a bad email", () => {
    const bad = { ...sampleCvData, contact: { ...sampleCvData.contact, email: "nope" } };
    expect(CvData.safeParse(bad).success).toBe(false);
  });
});

describe("ThemeTokens schema", () => {
  it("validates both default themes 1:1 from the master plan", () => {
    expect(ThemeTokens.parse(sidebarDefault).color.primary).toBe("#323B4C");
    expect(ThemeTokens.parse(sidebarDefault).bullet.style).toBe("diamond");
    expect(ThemeTokens.parse(sidebarDefault).layout.sidebarWidthPx).toBe(206);
    expect(ThemeTokens.parse(cleanDefault).font.family).toBe("Source Sans 3");
    expect(ThemeTokens.parse(cleanDefault).bullet.style).toBe("disc");
    expect(ThemeTokens.parse(cleanDefault).page.widthPx).toBe(794);
  });
});
