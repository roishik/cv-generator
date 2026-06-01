import { describe, it, expect } from "vitest";
import { readPath, writePath } from "@/lib/tailor/cv-path";
import { sectionTitle, DEFAULT_SECTION_TITLES, type CvData } from "@/lib/schemas/cv-data";

const data: CvData = {
  schemaVersion: 1,
  header: { name: "Roi", title: "PM", summary: "x", website: "roi.dev" },
  contact: { email: "roi@example.com", phone: "+1 555", location: "TLV", linkedin: "in/roi" },
  summary: "x",
  skills: { professional: ["TS"], soft: ["Comms"] },
  experience: [{ kbExperienceId: "11111111-1111-4111-8111-111111111111", company: "Acme", role: "PM", bullets: ["Did things."] }],
  education: [],
  leadership: [{ kbLeadershipId: "22222222-2222-4222-8222-222222222222", name: "Locals App", description: "Built it.", url: "bit.ly/x" }],
  languages: [],
};

describe("readPath — left-panel fields", () => {
  it("reads contact fields", () => {
    expect(readPath(data, "contact.email")?.value).toBe("roi@example.com");
    expect(readPath(data, "contact.linkedin")?.value).toBe("in/roi");
  });
  it("reads leadership name/description/url", () => {
    expect(readPath(data, "leadership[0].name")?.value).toBe("Locals App");
    expect(readPath(data, "leadership[0].description")?.value).toBe("Built it.");
    expect(readPath(data, "leadership[0].url")?.value).toBe("bit.ly/x");
  });
  it("reads website", () => {
    expect(readPath(data, "header.website")?.value).toBe("roi.dev");
  });
  it("reads a section title, defaulting when unset", () => {
    expect(readPath(data, "sectionTitles.leadership")?.value).toBe(
      DEFAULT_SECTION_TITLES.leadership,
    );
  });
});

describe("writePath — left-panel fields", () => {
  it("writes a contact field and clears it when emptied", () => {
    expect(writePath(data, "contact.phone", "+44 1").contact.phone).toBe("+44 1");
    expect(writePath(data, "contact.phone", "  ").contact.phone).toBeUndefined();
  });
  it("writes leadership fields without touching the header", () => {
    const next = writePath(data, "leadership[0].name", "Open Project");
    expect(next.leadership[0]!.name).toBe("Open Project");
    expect(next.header.name).toBe("Roi"); // regression: must NOT mis-map to header.name
  });
  it("sets a custom section title, and clearing/default removes the override", () => {
    const renamed = writePath(data, "sectionTitles.leadership", "Side Projects");
    expect(renamed.sectionTitles?.leadership).toBe("Side Projects");
    expect(sectionTitle(renamed, "leadership")).toBe("Side Projects");
    const reset = writePath(renamed, "sectionTitles.leadership", DEFAULT_SECTION_TITLES.leadership);
    expect(reset.sectionTitles?.leadership).toBeUndefined();
    expect(sectionTitle(reset, "leadership")).toBe(DEFAULT_SECTION_TITLES.leadership);
  });
});
