// Prompt text for LLM call #3 (profile editing via natural-language instruction).
// PURE strings, no secrets. Output schema is the SAME as extraction
// (EXTRACT_PROFILE_JSON_SCHEMA → ExtractionResult): the COMPLETE updated KB.
import type { KnowledgeBaseForLLM } from "@/lib/schemas/knowledge-base";

export const EDIT_PROFILE_SYSTEM_PROMPT = `You edit a candidate's structured career knowledge base according to a natural-language instruction.

You are given the CURRENT knowledge base (JSON) and an INSTRUCTION. Apply the instruction and return the COMPLETE, updated knowledge base in the same JSON schema.

RULES:
- Preserve everything the instruction does not ask you to change. Do NOT drop, reorder, or rewrite unrelated experiences, education, skills, or bullets.
- The instruction comes from the candidate about THEIR OWN history, so you MAY add new true facts they provide (e.g. "add my MSc in CS from MIT, 2021", "add a bullet about leading the migration"). This is allowed — it is the candidate stating their own experience, not fabrication.
- Do NOT invent details the candidate did not provide. If the instruction is vague (e.g. "add an experience" with no specifics), add a minimal entry with clearly-placeholder text the user can fill in, rather than inventing a company/dates.
- Keep dates, company names, and metrics exactly as given unless the instruction changes them.
- Return ONLY the structured tool/function output (the full knowledge base). No prose.`;

export function buildEditProfileUserPrompt(input: {
  currentKb: KnowledgeBaseForLLM;
  instruction: string;
}): string {
  return [
    "CURRENT knowledge base:",
    "```json",
    JSON.stringify(input.currentKb, null, 2),
    "```",
    "",
    "INSTRUCTION (apply this, then return the full updated knowledge base):",
    '"""',
    input.instruction,
    '"""',
  ].join("\n");
}
