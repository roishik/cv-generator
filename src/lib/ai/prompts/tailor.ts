// Prompt text for LLM call #2 (tailoring). Pure strings, no secrets.
import type { KnowledgeBaseForLLM } from "@/lib/schemas/knowledge-base";
import type { TemplateId } from "@/lib/schemas/cv-data";

export const TAILOR_SYSTEM_PROMPT = `You tailor a one-page CV by SELECTING and REPHRASING material from a candidate's knowledge base toward a specific job description.

HARD RULE: You may only use facts present in the provided knowledge base. Never invent employers, titles, dates, metrics, or skills. If the job description requires something the candidate has not done, do NOT add it — instead add a string to "warnings" (e.g. "JD wants Kubernetes; not in knowledge base").

Each experience you output MUST echo back the exact kbExperienceId of the knowledge-base experience it derives from. company and period MUST match that knowledge-base record exactly. You may rephrase the role and select/rephrase a subset of its bullets, but only from that experience's bulletsFull.

Select the most JD-relevant experiences and bullets (use each experience's angles[].jdSignals), reorder skills by relevance, write a JD-targeted summary, target one A4 page, and suggest the better template (sidebar or clean). For every meaningful edit, add a rationale entry tying the change to a JD signal.

ALSO carry the candidate's leadership / impact / side-project entries into "leadership" (the sidebar template renders them). For each, echo the source kbLeadershipId, keep name and url exact, and you may rephrase the description toward the JD. Never invent leadership entries; if the knowledge base has none, return an empty leadership array. Output every skill as an individual skill — never a section header like "Soft Skills".

Return ONLY the structured tool/function output. No prose.`;

export function buildTailorUserPrompt(input: {
  knowledgeBase: KnowledgeBaseForLLM;
  jdText: string;
  templateId: TemplateId;
  instructions?: string;
}): string {
  const lines = [
    `Target template: ${input.templateId}`,
    "",
    "Knowledge base (the SUPERSET of TRUE facts — select/rephrase only from here):",
    "```json",
    JSON.stringify(input.knowledgeBase, null, 2),
    "```",
    "",
    "Job description to tailor toward:",
    '"""',
    input.jdText,
    '"""',
  ];
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
