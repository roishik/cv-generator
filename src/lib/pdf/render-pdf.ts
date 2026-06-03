import type { TemplateId, ThemeTokens } from "@/lib/schemas/cv-data";
import type { CvData } from "@/lib/schemas/cv-data";
import { renderCvToHtml } from "@/lib/render-engine/render";
import { defaultThemeFor } from "@/lib/render-engine/themes/registry";
import { buildFitLadder, DEFAULT_FIT_BOUNDS, type FitBounds, type FitFailure } from "@/lib/render-engine/fit";
import { acquirePage, releasePage } from "./browser-pool";
import { measureContent } from "./measure";

export interface PdfSuccess {
  fits: true;
  pdf: Buffer;
  html: string;
  theme: ThemeTokens;
  rungUsed: number;
  contentHeightPx: number;
}

export type PdfResult = PdfSuccess | FitFailure;

export interface RenderPdfOptions {
  theme?: ThemeTokens;
  bounds?: FitBounds;
  /** Disable the auto-fit ladder (render once at the given theme). */
  noFit?: boolean;
}

/**
 * Renders CvData → a one-page A4 PDF, applying the deterministic auto-fit ladder.
 * Measures rendered content height per rung and tightens spacing → line-height →
 * font-size until it fits within (pageHeight − safeBottom). Never clips silently;
 * returns { fits:false, reason, suggestion } if the ladder is exhausted.
 */
export async function renderCvToPdf(
  cvData: CvData,
  templateId: TemplateId,
  options: RenderPdfOptions = {},
): Promise<PdfResult> {
  const baseTheme = options.theme ?? defaultThemeFor(templateId);
  const bounds = options.bounds ?? DEFAULT_FIT_BOUNDS;
  const { rungs, baseIndex } = options.noFit
    ? { rungs: [baseTheme], baseIndex: 0 }
    : buildFitLadder(baseTheme, bounds);
  const limitPx = baseTheme.page.heightPx - baseTheme.page.safeBottomPx;
  // Below the limit by more than this → worth expanding a rung to fill the gap.
  const FILL_TOL_PX = 24;

  const page = await acquirePage();
  try {
    const measureRung = async (rung: number): Promise<{ html: string; h: number }> => {
      const theme = rungs[rung]!;
      const html = renderCvToHtml(cvData, templateId, theme);
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => (document as Document).fonts?.ready);
      const { contentHeightPx } = await measureContent(page);
      return { html, h: contentHeightPx };
    };
    const emit = (rung: number, html: string, contentHeightPx: number): PdfSuccess => {
      // (filled in after the chosen rung is rendered onto the page)
      return {
        fits: true,
        pdf: Buffer.alloc(0),
        html,
        theme: rungs[rung]!,
        rungUsed: rung,
        contentHeightPx,
      };
    };
    const pdfFor = async (theme: ThemeTokens): Promise<Buffer> => {
      const pdf = await page.pdf({
        width: `${theme.page.widthPx}px`,
        height: `${theme.page.heightPx}px`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        pageRanges: "1",
      });
      return Buffer.from(pdf);
    };

    // 1. Measure the untouched base first.
    const { html: baseHtml, h: baseHeight } = await measureRung(baseIndex);

    // noFit: emit base as-is (legacy escape hatch, never expands/tightens).
    if (options.noFit) {
      const out = emit(baseIndex, baseHtml, baseHeight);
      out.pdf = await pdfFor(out.theme);
      return out;
    }

    // 2. Base overflows → TIGHTEN: first rung at/above base that fits wins.
    if (baseHeight > limitPx) {
      let lastHeight = baseHeight;
      for (let rung = baseIndex + 1; rung < rungs.length; rung++) {
        const { html, h } = await measureRung(rung);
        lastHeight = h;
        if (h <= limitPx) {
          const out = emit(rung, html, h);
          out.pdf = await pdfFor(out.theme); // page already holds this rung
          return out;
        }
      }
      const overflowPx = Math.round(lastHeight - limitPx);
      return {
        fits: false,
        reason: `Content exceeds one A4 page by ~${overflowPx}px even at the tightest layout (rung ${rungs.length - 1}).`,
        suggestion:
          "Reduce content: trim the summary, drop the least-relevant bullet(s), or remove an older experience/leadership entry, then re-render.",
      };
    }

    // 3. Base fits. If there's meaningful slack, EXPAND toward index 0 to fill it.
    let bestRung = baseIndex;
    let bestHeight = baseHeight;
    let bestHtml = baseHtml;
    if (limitPx - baseHeight > FILL_TOL_PX) {
      for (let rung = baseIndex - 1; rung >= 0; rung--) {
        const { html, h } = await measureRung(rung);
        if (h <= limitPx) {
          bestRung = rung;
          bestHeight = h;
          bestHtml = html;
          if (limitPx - h <= FILL_TOL_PX) break; // close enough — stop expanding
        } else {
          break; // overshoot — keep the last good rung
        }
      }
    }

    // The page may currently hold an overshooting expansion rung; re-render the
    // chosen rung before emitting the PDF so we never ship the wrong layout.
    const out = emit(bestRung, bestHtml, bestHeight);
    await page.setContent(bestHtml, { waitUntil: "networkidle" });
    await page.evaluate(() => (document as Document).fonts?.ready);
    out.pdf = await pdfFor(out.theme);
    return out;
  } finally {
    releasePage(page);
  }
}
