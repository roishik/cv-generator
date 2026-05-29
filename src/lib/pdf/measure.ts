import type { Page } from "playwright";

// In-page content-height measurement. Returns the lowest pixel occupied by real
// content so the fit loop knows whether the layout overflows one A4 page.

export interface ContentMetrics {
  contentHeightPx: number; // lowest content bottom edge, in CSS px
  pageHeightPx: number; // A4 height (1123)
}

/**
 * Measures the bottom-most *intrinsic content* edge of the rendered page.
 *
 * Both templates use full-height shells by design (the navy sidebar is 1123px;
 * the main column is a flex column with a `margin-top:auto` references line that
 * deliberately sinks to the page bottom). Those intentional fillers are NOT
 * overflow. To measure real overflow we neutralise the full-height constraints
 * during measurement (so flex/auto-margins collapse to natural flow), read the
 * deepest leaf content edge, then restore the layout. This is robust against
 * `overflow:hidden` clipping (which scrollHeight would otherwise hide).
 */
export async function measureContent(page: Page): Promise<ContentMetrics> {
  // NOTE: the measurement runs as a STRING in the page context (not a compiled
  // closure) — this sidesteps the `__name` helper that tsx/esbuild (keepNames)
  // injects into named functions, which does not exist in the browser context.
  return page.evaluate(MEASURE_FN) as Promise<ContentMetrics>;
}

const MEASURE_FN = `(() => {
  var pageHeightPx = 1123;
  var tweaks = [];
  var setTmp = function (el, prop, val) {
    if (!el) return;
    tweaks.push({ el: el, prop: prop, prev: el.style.getPropertyValue(prop) });
    el.style.setProperty(prop, val);
  };
  var cvPage = document.querySelector('.cv-page');
  var sidebar = document.querySelector('.sidebar');
  var main = document.querySelector('.main-content');
  var refs = document.querySelector('.references-line');
  var leadership = document.querySelector('[data-section="leadership"]');
  setTmp(cvPage, 'height', 'auto');
  setTmp(sidebar, 'min-height', '0');
  setTmp(sidebar, 'height', 'auto');
  setTmp(main, 'height', 'auto');
  setTmp(refs, 'margin-top', '10px');
  setTmp(leadership, 'flex', 'none');
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
  var contentHeightPx = Math.max(maxBottom, bodyScroll || 0);
  for (var j = 0; j < tweaks.length; j++) {
    var t = tweaks[j];
    if (t.prev) t.el.style.setProperty(t.prop, t.prev);
    else t.el.style.removeProperty(t.prop);
  }
  return { contentHeightPx: contentHeightPx, pageHeightPx: pageHeightPx };
})()`;
