/**
 * Deterministic text extraction from uploaded resume files.
 *
 * Supported formats:
 *   - PDF  → pdf-parse (deterministic, no LLM)
 *   - DOCX → mammoth  (deterministic, no LLM)
 *   - TXT  → UTF-8 decode
 *
 * PURE: no DB, no auth, no network.
 * The result is raw text; the caller hashes it for the extraction cache key.
 *
 * Exports:
 *   extractTextFromBuffer(buffer, mimeType) → string
 *   MIN_TEXT_LENGTH — below this char count the parse is considered "too little"
 *     and the caller should surface the manual-paste path.
 */

/** Parsed text below this length is considered insufficient for extraction. */
export const MIN_TEXT_LENGTH = 100;

/**
 * Extract plain text from a resume file buffer.
 *
 * @param buffer    File content (as returned by Storage.get or fs.readFile)
 * @param mimeType  MIME type (application/pdf | application/vnd.openxmlformats-officedocument.wordprocessingml.document | text/plain)
 * @returns         Raw plain text (newlines preserved, whitespace normalized)
 * @throws          If the MIME type is unsupported or parsing fails
 */
export async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    return extractFromPdf(buffer);
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractFromDocx(buffer);
  }
  if (mimeType === "text/plain") {
    return normalizeWhitespace(buffer.toString("utf8"));
  }
  throw new Error(`unsupported MIME type for text extraction: ${mimeType}`);
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 uses a class-based API: new PDFParse({ data }) + parser.getText()
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return normalizeWhitespace(result.text ?? "");
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(result.value);
}

/**
 * Collapse runs of whitespace while preserving meaningful newlines.
 * Strips carriage returns; collapses 3+ consecutive newlines to 2.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")        // normalize line endings
    .replace(/[ \t]+/g, " ")        // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n")     // max two consecutive blank lines
    .trim();
}
