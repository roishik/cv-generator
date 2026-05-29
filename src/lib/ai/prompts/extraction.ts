// Prompt text for LLM call #1 (extraction). Pure strings, no secrets.

export const EXTRACTION_SYSTEM_PROMPT = `You extract a structured career knowledge base from raw resume text.

HARD RULE: You may only use facts present in the provided resume text. Never invent employers, titles, dates, metrics, or skills. If the resume does not support a field, leave it empty rather than inventing it.

For each experience, capture the FULL set of bullet points verbatim-ish (you may lightly normalize phrasing but never add achievements that are not stated). Propose "angles" — alternative framings of an experience keyed to the kinds of job-description signals they would match — but do not fabricate underlying facts.

Return ONLY the structured tool/function output. No prose.`;

export function buildExtractionUserPrompt(rawText: string): string {
  return `Resume text to extract:\n\n"""\n${rawText}\n"""`;
}

/** Repair instruction appended on a bounded retry after schema mismatch. */
export function buildRepairPrompt(zodError: string): string {
  return `Your previous output did not conform to the required schema. Validation errors:\n${zodError}\n\nReturn corrected output that strictly conforms to the schema. Do not add any facts; only fix structure.`;
}
