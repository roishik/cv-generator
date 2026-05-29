import { describe, it, expect } from "vitest";
import { renderCvToHtml } from "@/lib/render-engine/render";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { sidebarDefault, cleanDefault } from "@/lib/render-engine/themes/registry";
import type { CvData } from "@/lib/schemas/cv-data";

describe("renderCvToHtml — sidebar (Type 1)", () => {
  const html = renderCvToHtml(sampleCvData, "sidebar");

  it("contains the navy sidebar fill (layout-integrity)", () => {
    expect(html.toLowerCase()).toContain("#323b4c");
    expect(html).toContain('class="sidebar"');
  });

  it("renders contact icons, diamond skill bullets, leadership, timeline", () => {
    expect(html).toContain("contact-icon");
    expect(html).toContain("skill-bullet");
    expect(html).toContain('data-section="leadership"');
    expect(html).toContain("experience-list");
    expect(html).toContain("References available upon request");
  });

  it("falls back to a monogram when no photo is present", () => {
    expect(html).toContain("photo-monogram");
    expect(html).toContain(">DW<");
    expect(html).not.toContain("<img");
  });

  it("renders a circular photo img when photoUrl is present", () => {
    const withPhoto: CvData = { ...sampleCvData, photoUrl: "files/x/photo.jpg" };
    const h = renderCvToHtml(withPhoto, "sidebar");
    expect(h).toContain('src="files/x/photo.jpg"');
    // The monogram <span> element is absent (the .photo-monogram CSS rule is
    // always emitted, but no element uses it when a photo is present).
    expect(h).not.toContain('class="photo-monogram"');
    expect(html).toContain('class="photo-monogram"'); // baseline: monogram-only fixture has it
  });

  it("self-hosts fonts (no Google CDN, inlined data: woff2)", () => {
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("font-family:'Lato'");
  });
});

describe("renderCvToHtml — clean (Type 2)", () => {
  const html = renderCvToHtml(sampleCvData, "clean");

  it("must NOT contain the navy sidebar fill (layout-integrity)", () => {
    expect(html.toLowerCase()).not.toContain("#323b4c");
    expect(html).not.toContain('class="sidebar"');
  });

  it("renders centered header, ruled titles, languages, inline skills", () => {
    expect(html).toContain('class="section-title"');
    expect(html).toContain("languages-line");
    expect(html).toContain("English (Native), Spanish (Professional)");
    expect(html).toContain("skills-inline");
    expect(html).toContain("Source Sans 3");
  });

  it("ignores photo and leadership (clean-only fields)", () => {
    expect(html).not.toContain("photo-circle");
    expect(html).not.toContain("Leadership");
  });
});

describe("renderCvToHtml — escaping & guards", () => {
  it("escapes HTML-significant characters in content", () => {
    const evil: CvData = {
      ...sampleCvData,
      header: { ...sampleCvData.header, name: "A <script> & B" },
    };
    const h = renderCvToHtml(evil, "clean");
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
  });

  it("throws on theme/template mismatch", () => {
    expect(() => renderCvToHtml(sampleCvData, "clean", sidebarDefault)).toThrow();
    expect(() => renderCvToHtml(sampleCvData, "sidebar", cleanDefault)).toThrow();
  });
});
