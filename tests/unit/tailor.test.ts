import { describe, it, expect } from "vitest";
import { recommendTemplate, resolveTemplate } from "@/lib/tailor/template-heuristic";
import { tailorCacheKey, jdHash, normalizeJd } from "@/lib/tailor/cache";
import { computeStructuredDiff } from "@/lib/tailor/diff";
import type { CvData } from "@/lib/schemas/cv-data";

const baseExp = {
  kbExperienceId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
  company: "Northstar AI",
  role: "Senior PM",
  period: "2021 — Present",
  bullets: [
    "Led the launch of an LLM developer platform.",
    "Defined the API roadmap with eng leadership.",
    "Ran weekly experiments lifting activation.",
  ],
};
const baseExp2 = {
  kbExperienceId: "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  company: "Mapline",
  role: "PM",
  bullets: ["Owned the geospatial analytics suite.", "Shipped self-serve onboarding."],
};

const baseline: CvData = {
  schemaVersion: 1,
  header: { name: "Dana", title: "Senior PM", summary: "Old summary." },
  contact: { email: "d@example.com" },
  summary: "Old summary.",
  skills: { professional: ["Strategy", "SQL", "Roadmapping"], soft: ["Leadership"] },
  experience: [baseExp, baseExp2],
  education: [],
  leadership: [],
  languages: [],
};

describe("recommendTemplate", () => {
  it("defaults to sidebar with no signal", () => {
    expect(recommendTemplate("Generic job posting about doing things.").templateId).toBe("sidebar");
  });
  it("picks sidebar for tech/AI/startup JDs", () => {
    expect(recommendTemplate("Startup hiring a software engineer for our ML platform.").templateId).toBe("sidebar");
  });
  it("picks clean for consulting/finance/government JDs", () => {
    expect(recommendTemplate("Management consulting firm; investment banking background preferred.").templateId).toBe("clean");
    expect(recommendTemplate("Government public-sector policy analyst, regulatory compliance focus.").templateId).toBe("clean");
  });
  it("keeps sidebar default when a lone finance word sits in a tech JD", () => {
    // one clean signal, multiple tech signals → tech wins.
    const r = recommendTemplate("Software engineer building financial dashboards in a SaaS startup with cloud and react.");
    expect(r.templateId).toBe("sidebar");
  });
});

describe("resolveTemplate", () => {
  it("honors an explicit override over the recommendation", () => {
    const r = resolveTemplate("Startup software engineer ML platform.", "clean");
    expect(r.templateId).toBe("clean");
    expect(r.overridden).toBe(true);
  });
  it("falls back to the recommendation with no override", () => {
    const r = resolveTemplate("Startup software engineer ML platform.");
    expect(r.templateId).toBe("sidebar");
    expect(r.overridden).toBe(false);
  });
});

describe("tailorCacheKey", () => {
  it("is stable for identical inputs and JD whitespace/case variants", () => {
    const a = tailorCacheKey({ kbVersion: 1, jobDescription: "Build  ML\nplatform", templateId: "sidebar" });
    const b = tailorCacheKey({ kbVersion: 1, jobDescription: "build ml platform", templateId: "sidebar" });
    expect(a).toBe(b);
  });
  it("differs by kbVersion, templateId, and JD content", () => {
    const base = { kbVersion: 1, jobDescription: "Build ML platform", templateId: "sidebar" as const };
    expect(tailorCacheKey(base)).not.toBe(tailorCacheKey({ ...base, kbVersion: 2 }));
    expect(tailorCacheKey(base)).not.toBe(tailorCacheKey({ ...base, templateId: "clean" }));
    expect(tailorCacheKey(base)).not.toBe(tailorCacheKey({ ...base, jobDescription: "Different role" }));
  });
  it("jdHash normalizes and is deterministic", () => {
    expect(jdHash("A  B")).toBe(jdHash("a b"));
    expect(normalizeJd("  Hi   There  ")).toBe("hi there");
  });
});

describe("computeStructuredDiff", () => {
  it("detects rewritten/added/removed/reordered bullets and field changes", () => {
    const tailored: CvData = {
      ...baseline,
      header: { ...baseline.header, title: "AI Product Lead", summary: "New JD-targeted summary." },
      summary: "New JD-targeted summary.",
      skills: { professional: ["SQL", "Strategy", "Roadmapping"], soft: ["Leadership"] }, // reordered
      experience: [
        // reordered: Mapline now first
        baseExp2,
        {
          ...baseExp,
          bullets: [
            "Led the 0→1 launch of an LLM developer platform to 40k users.", // rewritten (overlaps "Led the launch of an LLM developer platform")
            "Ran weekly experiments lifting activation.", // unchanged
            // dropped: "Defined the API roadmap..."
          ],
        },
      ],
    };

    const diff = computeStructuredDiff(baseline, tailored);
    expect(diff.summary.rewritten).toBeGreaterThanOrEqual(1);
    expect(diff.summary.removed).toBeGreaterThanOrEqual(1);
    expect(diff.summary.reordered).toBeGreaterThanOrEqual(1);

    const paths = diff.entries.map((e) => e.path);
    expect(paths).toContain("header.title");
    expect(paths).toContain("summary");
    // skills reordered (same members, different order)
    expect(diff.entries.find((e) => e.path === "skills.professional")?.kind).toBe("reordered");
    // no unchanged entries leak into the payload
    expect(diff.entries.every((e) => e.kind !== "unchanged")).toBe(true);
  });

  it("produces an empty diff for identical CvData", () => {
    const diff = computeStructuredDiff(baseline, baseline);
    expect(diff.entries.length).toBe(0);
  });
});
