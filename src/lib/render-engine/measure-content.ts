// Single source of truth for one-page content-height measurement.
//
// Both CV templates use full-height shells by design: the navy sidebar is a
// fixed 1123px column, and the main column is a flex column whose
// `references-line` (margin-top:auto) deliberately sinks to the page bottom.
// Those intentional fillers are NOT overflow. To measure real content height we
// neutralise the full-height constraints (so flex/auto-margins collapse to
// natural flow), read the deepest leaf content edge, then restore the layout.
// This is robust against `overflow:hidden` clipping (which scrollHeight hides).
//
// Two consumers share this logic from ONE definition:
//   • server (PDF): Playwright `page.evaluate(MEASURE_BODY)` — needs a STRING,
//     because tsx/esbuild keepNames injects a `__name` helper into compiled
//     functions that does not exist in the browser context.
//   • client (preview): `measureDocument(iframe.contentDocument)` runs in the
//     PARENT realm against the iframe's document. The preview iframe is
//     sandboxed `allow-same-origin` WITHOUT `allow-scripts`, so we cannot eval
//     inside it — but the parent can read/mutate its same-origin DOM directly
//     (which is exactly how the React portal renders into it).
//
// The two forms are kept in lock-step by a unit test that runs both against the
// same fixture DOM and asserts equal results.

export interface ContentMetrics {
  /** Lowest content bottom edge, in CSS px (the real one-page-fit signal). */
  contentHeightPx: number;
  /** A4 height (1123). */
  pageHeightPx: number;
}

/**
 * Synchronously measures the bottom-most intrinsic content edge of a rendered CV
 * `doc`. Mutates inline styles to neutralise the full-height shells, measures,
 * then restores every tweak in a `finally` so the live DOM is never left altered.
 * MUST stay fully synchronous (no `await`) so React cannot unmount between the
 * mutate and the restore.
 */
export function measureDocument(doc: Document): ContentMetrics {
  const pageHeightPx = 1123;
  const tweaks: Array<{ el: HTMLElement; prop: string; prev: string }> = [];
  const setTmp = (el: Element | null, prop: string, val: string): void => {
    if (!el) return;
    const h = el as HTMLElement;
    tweaks.push({ el: h, prop, prev: h.style.getPropertyValue(prop) });
    h.style.setProperty(prop, val);
  };
  try {
    setTmp(doc.querySelector(".cv-page"), "height", "auto");
    setTmp(doc.querySelector(".sidebar"), "min-height", "0");
    setTmp(doc.querySelector(".sidebar"), "height", "auto");
    setTmp(doc.querySelector(".main-content"), "height", "auto");
    setTmp(doc.querySelector(".references-line"), "margin-top", "10px");
    setTmp(doc.querySelector('[data-section="leadership"]'), "flex", "none");
    setTmp(doc.body, "height", "auto");
    setTmp(doc.body, "min-height", "0");
    setTmp(doc.body, "overflow", "visible");
    setTmp(doc.documentElement, "height", "auto");
    setTmp(doc.documentElement, "overflow", "visible");
    void doc.body.offsetHeight; // force reflow

    let maxBottom = 0;
    const all = doc.body.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i] as HTMLElement;
      const cls = el.className;
      if (typeof cls === "string" && /(^|\s)(cv-page|sidebar|main-content)(\s|$)/.test(cls)) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      if (r.bottom > maxBottom) maxBottom = r.bottom;
    }
    const bodyScroll = doc.body.scrollHeight;
    const contentHeightPx = Math.max(maxBottom, bodyScroll || 0);
    return { contentHeightPx, pageHeightPx };
  } finally {
    for (const t of tweaks) {
      if (t.prev) t.el.style.setProperty(t.prop, t.prev);
      else t.el.style.removeProperty(t.prop);
    }
  }
}

/**
 * The same measurement as {@link measureDocument}, but as a self-contained IIFE
 * STRING for Playwright `page.evaluate`. Operates on the page's global
 * `document`. Keep behaviour identical to `measureDocument` — the parity test
 * (`measure-content.test.ts`) guards against drift.
 */
export const MEASURE_BODY = `(() => {
  var pageHeightPx = 1123;
  var tweaks = [];
  var setTmp = function (el, prop, val) {
    if (!el) return;
    tweaks.push({ el: el, prop: prop, prev: el.style.getPropertyValue(prop) });
    el.style.setProperty(prop, val);
  };
  try {
    setTmp(document.querySelector('.cv-page'), 'height', 'auto');
    setTmp(document.querySelector('.sidebar'), 'min-height', '0');
    setTmp(document.querySelector('.sidebar'), 'height', 'auto');
    setTmp(document.querySelector('.main-content'), 'height', 'auto');
    setTmp(document.querySelector('.references-line'), 'margin-top', '10px');
    setTmp(document.querySelector('[data-section="leadership"]'), 'flex', 'none');
    setTmp(document.body, 'height', 'auto');
    setTmp(document.body, 'min-height', '0');
    setTmp(document.body, 'overflow', 'visible');
    setTmp(document.documentElement, 'height', 'auto');
    setTmp(document.documentElement, 'overflow', 'visible');
    void document.body.offsetHeight;
    var maxBottom = 0;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var cls = el.className;
      if (typeof cls === 'string' && /(^|\\s)(cv-page|sidebar|main-content)(\\s|$)/.test(cls)) continue;
      var r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      if (r.bottom > maxBottom) maxBottom = r.bottom;
    }
    var bodyScroll = document.body.scrollHeight;
    return { contentHeightPx: Math.max(maxBottom, bodyScroll || 0), pageHeightPx: pageHeightPx };
  } finally {
    for (var j = 0; j < tweaks.length; j++) {
      var t = tweaks[j];
      if (t.prev) t.el.style.setProperty(t.prop, t.prev);
      else t.el.style.removeProperty(t.prop);
    }
  }
})()`;
