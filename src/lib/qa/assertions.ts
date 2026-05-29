import type { TemplateId } from "@/lib/schemas/cv-data";
import { extractPdfText } from "./extract-text";

// Server-side QA assertions ported from 00-current-system-analysis.md §5.
// Each check returns a structured pass/fail with a human-readable message.

export interface QaCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface QaReport {
  ok: boolean;
  checks: QaCheck[];
}

const MIN_BYTES = 40 * 1024; // 40 KB
const MAX_BYTES = 800 * 1024; // 800 KB
const NAVY = "#323b4c"; // sidebar fill (case-insensitive)

export interface QaInput {
  pdf: Buffer;
  html: string;
  templateId: TemplateId;
  /** A known string that MUST appear in the extracted text (e.g. the candidate name). */
  expectedText: string;
  /** Lowest content pixel measured during render (for one-page bbox fit). */
  contentHeightPx: number;
  pageHeightPx: number;
  safeBottomPx: number;
}

/** Runs all four QA checks against a rendered PDF + its source HTML. */
export async function runQaChecks(input: QaInput): Promise<QaReport> {
  const checks: QaCheck[] = [];

  // 1) File-size band.
  const size = input.pdf.byteLength;
  checks.push({
    name: "file-size-band",
    pass: size >= MIN_BYTES && size <= MAX_BYTES,
    detail: `${(size / 1024).toFixed(1)} KB (band ${MIN_BYTES / 1024}–${MAX_BYTES / 1024} KB)`,
  });

  // 2) Text-extraction presence (known value appears) + single page.
  const { text, pages } = await extractPdfText(input.pdf);
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  const present = norm(text).includes(norm(input.expectedText));
  checks.push({
    name: "text-extraction-presence",
    pass: present,
    detail: present
      ? `found "${input.expectedText}" in extracted text`
      : `expected "${input.expectedText}" NOT found in extracted text`,
  });
  checks.push({
    name: "single-page",
    pass: pages === 1,
    detail: `page_count=${pages}`,
  });

  // 3) One-page bbox fit: lowest content y leaves bottom margin ≥ safeBottom.
  const bottomMargin = input.pageHeightPx - input.contentHeightPx;
  checks.push({
    name: "one-page-bbox-fit",
    pass: input.contentHeightPx <= input.pageHeightPx - input.safeBottomPx,
    detail: `content bottom=${input.contentHeightPx.toFixed(0)}px, page=${input.pageHeightPx}px, bottom-margin=${bottomMargin.toFixed(0)}px (need ≥${input.safeBottomPx}px)`,
  });

  // 4) Layout-integrity: Type 1 MUST contain the navy sidebar fill; Type 2 must NOT.
  const hasNavy = input.html.toLowerCase().includes(NAVY);
  const layoutPass = input.templateId === "sidebar" ? hasNavy : !hasNavy;
  checks.push({
    name: "layout-integrity",
    pass: layoutPass,
    detail:
      input.templateId === "sidebar"
        ? hasNavy
          ? "sidebar navy fill present"
          : "sidebar navy fill MISSING"
        : hasNavy
          ? "clean template unexpectedly contains navy sidebar fill"
          : "clean template correctly has no navy sidebar fill",
  });

  return { ok: checks.every((c) => c.pass), checks };
}
