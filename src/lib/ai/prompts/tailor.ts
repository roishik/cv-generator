// Prompt text for LLM call #2 (tailoring). Pure strings, no secrets.
import type { KnowledgeBaseForLLM } from "@/lib/schemas/knowledge-base";
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";

export const TAILOR_SYSTEM_PROMPT = `You tailor a one-page CV by SELECTING and REPHRASING material from a candidate's knowledge base toward a specific job description.

HARD RULE: You may only use facts present in the provided knowledge base. Never invent employers, titles, dates, metrics, or skills. If the job description requires something the candidate has not done, do NOT add it — instead add a string to "warnings" (e.g. "JD wants Kubernetes; not in knowledge base").

Each experience you output MUST echo back the exact kbExperienceId of the knowledge-base experience it derives from. company and period MUST match that knowledge-base record exactly. You may rephrase the role and select/rephrase a subset of its bullets, but only from that experience's bulletsFull.

Select the most JD-relevant experiences and bullets (use each experience's angles[].jdSignals), reorder skills by relevance, write a JD-targeted summary, target one A4 page, and suggest the better template (sidebar or clean). For every meaningful edit, add a rationale entry tying the change to a JD signal.

ALSO carry the candidate's leadership / impact / side-project entries into "leadership" (the sidebar template renders them). For each, echo the source kbLeadershipId, keep name and url exact, and you may rephrase the description toward the JD. Never invent leadership entries; if the knowledge base has none, return an empty leadership array. Output every skill as an individual skill — never a section header like "Soft Skills".

Return ONLY the structured tool/function output. No prose.`;

// Minimal-edit mode: the user gave a targeted instruction but NO job description.
// We apply that instruction to the CURRENT CV and change nothing else — mirroring
// the "Edit with AI" (editProfile) philosophy. Without this, an instruction-only
// run would rebuild the whole CV from the knowledge base and produce a large,
// unexpected diff.
export const TAILOR_EDIT_SYSTEM_PROMPT = `You apply a single natural-language instruction to a candidate's CURRENT one-page CV.

HARD RULE #1 — MINIMAL CHANGE: Change ONLY what the instruction explicitly asks for. Preserve every other experience, bullet, skill, summary, leadership entry, section, ordering and wording EXACTLY as given in the current CV. Do NOT rewrite, reorder, drop, or "improve" anything the instruction does not mention.

HARD RULE #2 — TRUTHFULNESS: You may only use facts present in the provided knowledge base. Never invent employers, titles, dates, metrics, or skills. If the instruction asks for something not supported by the knowledge base, do NOT add it — add a string to "warnings" explaining why.

Each experience you output MUST echo back the exact kbExperienceId from the current CV / knowledge base. company and period MUST match the knowledge-base record exactly. Keep leadership entries (echo kbLeadershipId, keep name and url exact). Output every skill as an individual skill — never a section header like "Soft Skills".

Add a rationale entry ONLY for the change(s) the instruction asked for. Choose the same template the current CV uses unless the instruction says otherwise.

Return ONLY the structured tool/function output. No prose.`;

/** True when this run is a targeted edit (instruction present, no real JD). */
function isEditMode(jdText: string | undefined, instructions: string | undefined): boolean {
  return (jdText?.trim().length ?? 0) < 30 && !!instructions?.trim();
}

export interface BuildTailorPromptInput {
  knowledgeBase: KnowledgeBaseForLLM;
  jdText: string;
  templateId: TemplateId;
  instructions?: string;
  baselineCvData?: CvData;
}

/**
 * Returns the system + user prompt for a tailoring run. Picks minimal-edit mode
 * (instruction applied to the current CV, everything else preserved) when there
 * is an instruction but no real job description; otherwise full JD-driven tailoring.
 */
export function buildTailorPrompts(input: BuildTailorPromptInput): {
  system: string;
  user: string;
} {
  const editMode = isEditMode(input.jdText, input.instructions);
  return {
    system: editMode ? TAILOR_EDIT_SYSTEM_PROMPT : TAILOR_SYSTEM_PROMPT,
    user: editMode ? buildEditUserPrompt(input) : buildTailorUserPrompt(input),
  };
}

export function buildTailorUserPrompt(input: {
  knowledgeBase: KnowledgeBaseForLLM;
  jdText: string;
  templateId: TemplateId;
  instructions?: string;
}): string {
  const jd = input.jdText?.trim() ?? "";
  const lines = [
    `Target template: ${input.templateId}`,
    "",
    "Knowledge base (the SUPERSET of TRUE facts — select/rephrase only from here):",
    "```json",
    JSON.stringify(input.knowledgeBase, null, 2),
    "```",
    "",
  ];
  if (jd.length >= 30) {
    lines.push("Job description to tailor toward:", '"""', jd, '"""');
  } else {
    lines.push(
      "No specific job description was provided. Produce a strong, well-rounded one-page CV from the knowledge base and apply the user instructions below.",
    );
  }
  const extra = input.instructions?.trim();
  if (extra) {
    lines.push(
      "",
      "Additional user instructions — follow these closely while still obeying the HARD RULE above (never invent facts not in the knowledge base):",
      '"""',
      extra,
      '"""',
    );
  }
  return lines.join("\n");
}

/** User prompt for minimal-edit mode: the current CV is the thing being edited. */
export function buildEditUserPrompt(input: BuildTailorPromptInput): string {
  const instruction = input.instructions?.trim() ?? "";
  const lines = [
    `Target template: ${input.templateId}`,
    "",
    "The candidate's CURRENT CV (this is what you are editing — return it updated, with ONLY the requested change applied and everything else preserved verbatim):",
    "```json",
    JSON.stringify(input.baselineCvData ?? null, null, 2),
    "```",
    "",
    "Knowledge base (the SUPERSET of TRUE facts — use ONLY to support the requested change; do not pull in unrelated material):",
    "```json",
    JSON.stringify(input.knowledgeBase, null, 2),
    "```",
    "",
    "INSTRUCTION to apply (change only this; preserve everything else exactly):",
    '"""',
    instruction,
    '"""',
  ];
  return lines.join("\n");
}
