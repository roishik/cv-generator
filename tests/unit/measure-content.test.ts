import { describe, it, expect } from "vitest";
import { measureDocument, MEASURE_BODY } from "@/lib/render-engine/measure-content";

// jsdom does not implement layout (getBoundingClientRect → zeros, scrollHeight →
// 0), so we cannot assert real pixel values here. Instead we assert the two
// invariants we actually care about: (1) measureDocument restores every inline
// style it tweaks, and (2) the string form (MEASURE_BODY, used by Playwright) and
// the function form (measureDocument, used by the live preview) agree on the same
// DOM — the anti-drift guard.

function buildDoc(): Document {
  const doc = document.implementation.createHTMLDocument("cv");
  doc.body.innerHTML = `
    <div class="cv-page" style="height:1123px">
      <div class="sidebar" style="min-height:1123px;height:1123px"></div>
      <div class="main-content" style="height:1123px">
        <section data-section="leadership" style="flex:1">L</section>
        <p class="references-line" style="margin-top:auto">refs</p>
      </div>
    </div>`;
  return doc;
}

describe("measureDocument", () => {
  it("returns A4 page height and a numeric content height", () => {
    const m = measureDocument(buildDoc());
    expect(m.pageHeightPx).toBe(1123);
    expect(typeof m.contentHeightPx).toBe("number");
  });

  it("restores every inline style it tweaks (DOM left unchanged)", () => {
    const doc = buildDoc();
    const before = {
      page: doc.querySelector<HTMLElement>(".cv-page")!.style.cssText,
      sidebar: doc.querySelector<HTMLElement>(".sidebar")!.style.cssText,
      main: doc.querySelector<HTMLElement>(".main-content")!.style.cssText,
      refs: doc.querySelector<HTMLElement>(".references-line")!.style.cssText,
      lead: doc.querySelector<HTMLElement>('[data-section="leadership"]')!.style.cssText,
      body: doc.body.style.cssText,
      html: doc.documentElement.style.cssText,
    };
    measureDocument(doc);
    expect(doc.querySelector<HTMLElement>(".cv-page")!.style.cssText).toBe(before.page);
    expect(doc.querySelector<HTMLElement>(".sidebar")!.style.cssText).toBe(before.sidebar);
    expect(doc.querySelector<HTMLElement>(".main-content")!.style.cssText).toBe(before.main);
    expect(doc.querySelector<HTMLElement>(".references-line")!.style.cssText).toBe(before.refs);
    expect(doc.querySelector<HTMLElement>('[data-section="leadership"]')!.style.cssText).toBe(
      before.lead,
    );
    expect(doc.body.style.cssText).toBe(before.body);
    expect(doc.documentElement.style.cssText).toBe(before.html);
  });

  it("is synchronous (returns a plain object, not a promise)", () => {
    const m = measureDocument(buildDoc());
    expect(m).not.toBeInstanceOf(Promise);
    expect(m).toHaveProperty("contentHeightPx");
  });

  it("string form (MEASURE_BODY) matches the function form on the same DOM", () => {
    const docA = buildDoc();
    const docB = buildDoc();
    const fromFn = measureDocument(docA);
    // Evaluate MEASURE_BODY with `document` bound to docB (mirrors page.evaluate,
    // which runs it with the page's global document).
    const fromStr = new Function("document", `return ${MEASURE_BODY};`)(docB) as {
      contentHeightPx: number;
      pageHeightPx: number;
    };
    expect(fromStr).toEqual(fromFn);
  });
});
