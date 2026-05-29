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
  const ladder = options.noFit ? [baseTheme] : buildFitLadder(baseTheme, bounds);
  const limitPx = baseTheme.page.heightPx - baseTheme.page.safeBottomPx;

  const page = await acquirePage();
  try {
    let lastHeight = Infinity;
    for (let rung = 0; rung < ladder.length; rung++) {
      const theme = ladder[rung]!;
      const html = renderCvToHtml(cvData, templateId, theme);
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => (document as Document).fonts?.ready);
      const { contentHeightPx } = await measureContent(page);
      lastHeight = contentHeightPx;

      const fitsNow = contentHeightPx <= limitPx;
      const isLast = rung === ladder.length - 1;
      if (fitsNow || (options.noFit && isLast)) {
        const pdf = await page.pdf({
          width: `${theme.page.widthPx}px`,
          height: `${theme.page.heightPx}px`,
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
          pageRanges: "1",
        });
        return {
          fits: true,
          pdf: Buffer.from(pdf),
          html,
          theme,
          rungUsed: rung,
          contentHeightPx,
        };
      }
    }

    const overflowPx = Math.round(lastHeight - limitPx);
    return {
      fits: false,
      reason: `Content exceeds one A4 page by ~${overflowPx}px even at the tightest layout (rung ${ladder.length - 1}).`,
      suggestion:
        "Reduce content: trim the summary, drop the least-relevant bullet(s), or remove an older experience/leadership entry, then re-render.",
    };
  } finally {
    releasePage(page);
  }
}
