import { PDFParse } from "pdf-parse";

export interface PdfTextInfo {
  text: string;
  pages: number;
}

/** Extracts all text + page count from a PDF buffer (for QA assertions). */
export async function extractPdfText(pdf: Buffer): Promise<PdfTextInfo> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const result = await parser.getText();
    const text = result.text ?? "";
    const pages = result.total ?? result.pages?.length ?? 1;
    return { text, pages };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
