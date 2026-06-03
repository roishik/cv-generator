import type { Page } from "playwright";
import { MEASURE_BODY, type ContentMetrics } from "@/lib/render-engine/measure-content";

// In-page content-height measurement. Returns the lowest pixel occupied by real
// content so the fit loop knows whether the layout overflows one A4 page.
//
// The actual measurement logic lives in `lib/render-engine/measure-content.ts`
// (shared with the live preview). Here we run its STRING form via Playwright's
// `page.evaluate` — a string sidesteps the `__name` helper that tsx/esbuild
// (keepNames) injects into named functions, which does not exist in-browser.

export type { ContentMetrics };

/** See {@link MEASURE_BODY} for the neutralise→measure→restore strategy. */
export async function measureContent(page: Page): Promise<ContentMetrics> {
  return page.evaluate(MEASURE_BODY) as Promise<ContentMetrics>;
}
