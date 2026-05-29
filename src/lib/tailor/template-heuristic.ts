/**
 * Deterministic template-selection heuristic (planning 01 §3b.2 / 04 C12).
 *
 * PURE: no DB, no network, no LLM. Given a job description's text, pick the
 * template that best fits the role's industry register:
 *
 *   - `clean`   — formal / conservative registers (consulting, finance, banking,
 *                 government, legal, accounting) prefer the typographic, no-color
 *                 single-column design.
 *   - `sidebar` — tech / startup / product / AI / design registers prefer the
 *                 colored two-column design with a photo + leadership rail.
 *
 * Default is `sidebar` (per 01 §3b.2: "Default Type 1"). A clean/formal signal
 * must clearly outweigh the tech signal to flip the recommendation, so a JD that
 * merely mentions "financial models" inside a startup PM role still defaults to
 * sidebar.
 *
 * The decision is ALWAYS overridable by an explicit `templateId` passed by the
 * caller; this module only produces the *recommendation*.
 */

import type { TemplateId } from "@/lib/schemas/cv-data";

/** Industry signal words that lean toward the formal `clean` template. */
const CLEAN_SIGNALS = [
  "consulting",
  "consultant",
  "finance",
  "financial",
  "investment bank",
  "investment banking",
  "private equity",
  "venture capital",
  "asset management",
  "hedge fund",
  "banking",
  "accounting",
  "audit",
  "actuarial",
  "government",
  "public sector",
  "policy",
  "legal",
  "law firm",
  "attorney",
  "compliance",
  "regulatory",
  "mckinsey",
  "bain",
  "bcg",
  "deloitte",
  "kpmg",
  "ernst & young",
  "pwc",
  "goldman",
  "morgan stanley",
];

/** Industry signal words that lean toward the colored `sidebar` template. */
const SIDEBAR_SIGNALS = [
  "startup",
  "start-up",
  "software",
  "engineer",
  "engineering",
  "developer",
  "machine learning",
  "ml ",
  "artificial intelligence",
  " ai ",
  "ai/",
  "data science",
  "product manager",
  "product management",
  "design",
  "designer",
  "ux",
  "ui",
  "frontend",
  "backend",
  "full stack",
  "full-stack",
  "devops",
  "platform",
  "saas",
  "react",
  "kubernetes",
  "cloud",
  "growth",
];

export interface TemplateHeuristicResult {
  templateId: TemplateId;
  /** Why this template was chosen — surfaced in the UI as the recommendation reason. */
  reason: string;
  /** Number of clean-leaning vs sidebar-leaning signal hits found in the JD. */
  signals: { clean: number; sidebar: number };
}

function countSignals(haystack: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) n++;
  }
  return n;
}

/**
 * Deterministically recommend a template for a job description.
 *
 * @param jobDescription raw JD text (case-insensitive scan)
 */
export function recommendTemplate(jobDescription: string): TemplateHeuristicResult {
  // Pad with leading/trailing spaces so word-boundary-ish signals (" ai ") match
  // at the very start/end of the text too.
  const hay = ` ${jobDescription.toLowerCase().replace(/\s+/g, " ")} `;

  const clean = countSignals(hay, CLEAN_SIGNALS);
  const sidebar = countSignals(hay, SIDEBAR_SIGNALS);

  // A formal register must clearly dominate to override the sidebar default.
  // Require at least one clean signal AND a strict majority over sidebar signals.
  if (clean > 0 && clean > sidebar) {
    return {
      templateId: "clean",
      reason: `Formal/conservative register detected (${clean} formal signal${clean === 1 ? "" : "s"} vs ${sidebar} tech signal${sidebar === 1 ? "" : "s"}); recommending the clean single-column design.`,
      signals: { clean, sidebar },
    };
  }

  return {
    templateId: "sidebar",
    reason:
      sidebar > 0
        ? `Tech/product register detected (${sidebar} tech signal${sidebar === 1 ? "" : "s"} vs ${clean} formal signal${clean === 1 ? "" : "s"}); recommending the sidebar design.`
        : "No strong formal-register signal found; using the default sidebar design.",
    signals: { clean, sidebar },
  };
}

/**
 * Resolve the final template: an explicit user override always wins; otherwise
 * fall back to the deterministic recommendation.
 */
export function resolveTemplate(
  jobDescription: string,
  override?: TemplateId,
): TemplateHeuristicResult & { overridden: boolean } {
  const recommended = recommendTemplate(jobDescription);
  if (override) {
    return {
      templateId: override,
      reason: `User explicitly selected the ${override} template (recommendation was ${recommended.templateId}).`,
      signals: recommended.signals,
      overridden: true,
    };
  }
  return { ...recommended, overridden: false };
}
