// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { closeBrowser } from "@/lib/pdf/browser-pool";
import { runQaChecks } from "@/lib/qa/assertions";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { defaultThemeFor } from "@/lib/render-engine/themes/registry";
import { buildFitLadder } from "@/lib/render-engine/fit";
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";

afterAll(async () => {
  await closeBrowser();
});

const TEMPLATES: TemplateId[] = ["sidebar", "clean"];

describe.each(TEMPLATES)("render→PDF→QA for template '%s'", (templateId) => {
  it(
    "produces a one-page A4 PDF that passes ALL four QA checks",
    async () => {
      const res = await renderCvToPdf(sampleCvData, templateId);
      expect(res.fits).toBe(true);
      if (!res.fits) return;

      const theme = res.theme;
      const qa = await runQaChecks({
        pdf: res.pdf,
        html: res.html,
        templateId,
        expectedText: sampleCvData.header.name,
        contentHeightPx: res.contentHeightPx,
        pageHeightPx: theme.page.heightPx,
        safeBottomPx: theme.page.safeBottomPx,
      });

      for (const c of qa.checks) {
        expect(c.pass, `${c.name}: ${c.detail}`).toBe(true);
      }
      expect(qa.ok).toBe(true);
      // PDF byte band sanity (also covered by QA, asserted explicitly).
      expect(res.pdf.byteLength).toBeGreaterThan(40 * 1024);
      expect(res.pdf.byteLength).toBeLessThan(800 * 1024);
    },
    120_000,
  );
});

describe("auto-fit ladder", () => {
  it(
    "tightens an over-long CvData until it fits one page",
    async () => {
      // 5 dense experiences × 4 long bullets — overflows the default theme,
      // must be tightened by the ladder (rung > 0) rather than clipped.
      const longBullets = Array.from({ length: 4 }, (_, i) =>
        `Long bullet ${i} describing a substantial, multi-clause accomplishment that wraps across multiple lines to consume meaningful vertical space on the rendered page layout.`,
      );
      const heavy: CvData = {
        ...sampleCvData,
        experience: Array.from({ length: 5 }, (_, i) => ({
          kbExperienceId: `8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e${(10 + i).toString().padStart(2, "0")}`,
          company: `Company ${i}`,
          role: `Senior Role Number ${i}`,
          period: "2018 — 2024",
          bullets: longBullets,
        })),
      };
      const res = await renderCvToPdf(heavy, "clean");
      expect(res.fits).toBe(true);
      if (res.fits) {
        const { baseIndex } = buildFitLadder(defaultThemeFor("clean"));
        // rungUsed beyond the base proves the ladder TIGHTENED (didn't just clip).
        expect(res.rungUsed).toBeGreaterThan(baseIndex);
        expect(res.contentHeightPx).toBeLessThanOrEqual(
          defaultThemeFor("clean").page.heightPx - defaultThemeFor("clean").page.safeBottomPx,
        );
      }
    },
    120_000,
  );

  it(
    "expands a short CvData to fill the page (rung below base) without overflowing",
    async () => {
      // A deliberately sparse CV — one short experience, no education/leadership —
      // sits well under one page, so the ladder should EXPAND (rung < baseIndex)
      // to fill the gap rather than leave a large bottom whitespace.
      const light: CvData = {
        ...sampleCvData,
        summary: "Product manager.",
        experience: [
          {
            kbExperienceId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e99",
            company: "Acme",
            role: "PM",
            period: "2022 — Present",
            bullets: ["Shipped a thing."],
          },
        ],
        education: [],
        leadership: [],
      };
      const res = await renderCvToPdf(light, "clean");
      expect(res.fits).toBe(true);
      if (res.fits) {
        const { baseIndex } = buildFitLadder(defaultThemeFor("clean"));
        expect(res.rungUsed).toBeLessThan(baseIndex); // expanded to fill
        expect(res.contentHeightPx).toBeLessThanOrEqual(
          defaultThemeFor("clean").page.heightPx - defaultThemeFor("clean").page.safeBottomPx,
        );
      }
    },
    120_000,
  );

  it(
    "returns a structured fits:false when the ladder is exhausted (never clips)",
    async () => {
      // Absurd amount of content that cannot fit even at the tightest theme.
      const bullets = Array.from({ length: 12 }, (_, i) =>
        `Overflow bullet ${i} that is intentionally verbose and long so that the cumulative content is impossible to fit onto a single A4 page regardless of how aggressively the deterministic auto-fit ladder tightens spacing, line-height, and font size within the configured minimum bounds.`,
      );
      const impossible: CvData = {
        ...sampleCvData,
        experience: Array.from({ length: 10 }, (_, i) => ({
          kbExperienceId: `1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c${(20 + i).toString().padStart(2, "0")}`,
          company: `Company ${i}`,
          role: `Role ${i}`,
          period: "2010 — 2024",
          bullets,
        })),
      };
      const res = await renderCvToPdf(impossible, "clean");
      expect(res.fits).toBe(false);
      if (!res.fits) {
        expect(res.reason).toMatch(/exceeds one A4 page/i);
        expect(res.suggestion).toMatch(/reduce content/i);
      }
    },
    120_000,
  );
});
