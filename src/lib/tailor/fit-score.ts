// Deterministic JD ↔ CV fit assessment (FINDINGS.md Tier 2, item 2.1).
//
// Source: 04-job-evaluation.md (scored dimensions, weights, verdict thresholds,
// "Key Strengths" + "Gaps to Address" output).
//
// The reference repo scores fit with an LLM across five holistic dimensions.
// Tailor's philosophy is deterministic-first, so this computes a keyword-overlap
// ESTIMATE in pure code at ZERO extra LLM cost — reinforcing the honesty wedge
// ("we tell you the truth about your fit, then tailor honestly").
//
// HONEST SCOPE (per the finding's "adapted" recommendation): of the rubric's
// five dimensions only two have a deterministic data source in Tailor today —
// Technical Skills and Experience. Behavioral Fit, Career Alignment, and
// Location need profile data the KB does not hold, so they are intentionally
// dropped for v1 (NOT silently — see `method` + the docs). The two computed
// dimensions are re-weighted from the rubric's 30:25 ratio. Verdict thresholds
// are kept verbatim. Fit is measured against the KB (the candidate's true
// superset of facts), not the trimmed CV, so it answers "can this person
// truthfully claim a match?" regardless of how a given tailoring turned out.
// PURE: no DB, no auth, no network.
import type { KnowledgeBaseForLLM } from "@/lib/schemas/knowledge-base";
import { tokenize, stem } from "./keywords";

export type FitVerdict =
  | "Strong fit"
  | "Good fit"
  | "Moderate fit"
  | "Weak fit"
  | "Poor fit";

export interface FitAssessment {
  /** 0-100 keyword coverage against the KB's skill/tag vocabulary. */
  skillsMatch: number;
  /** 0-100 keyword coverage against the KB's experience text. */
  experienceMatch: number;
  /** 0-100 weighted blend (skills 55% / experience 45%, from the 30:25 rubric ratio). */
  overall: number;
  verdict: FitVerdict;
  /** JD terms the candidate evidences (readable surface forms). */
  strengths: string[];
  /** JD terms absent from the KB — the honest "gaps to address". */
  gaps: string[];
  /** Marks this as a deterministic estimate, not an LLM judgment. */
  method: "keyword-overlap";
}

// Rubric weights (04-job-evaluation.md §Weighting): Technical Skills 30%,
// Experience 25%. Re-normalized to the two dimensions Tailor can compute.
const W_SKILLS = 30 / 55;
const W_EXPERIENCE = 25 / 55;

const MIN_JD_CHARS = 30; // below this there is no real JD to assess

/** Map a 0-100 overall score to the rubric's verdict band (§Thresholds). */
export function fitVerdict(score: number): FitVerdict {
  if (score >= 75) return "Strong fit";
  if (score >= 60) return "Good fit";
  if (score >= 45) return "Moderate fit";
  if (score >= 30) return "Weak fit";
  return "Poor fit";
}

/** Join KB text fields into one blob for tokenization. */
function kbSkillText(kb: KnowledgeBaseForLLM): string {
  const parts: string[] = [...kb.skills.professional, ...kb.skills.soft];
  for (const e of kb.experiences) {
    parts.push(...e.tags);
    for (const a of e.angles) parts.push(a.label, ...a.jdSignals);
  }
  for (const l of kb.leadership) parts.push(...l.tags);
  return parts.join(" ");
}

function kbExperienceText(kb: KnowledgeBaseForLLM): string {
  const parts: string[] = [kb.header.title, kb.narrative, kb.header.summaryLong];
  for (const e of kb.experiences) {
    parts.push(e.company, e.role, ...e.bulletsFull);
  }
  for (const l of kb.leadership) parts.push(l.name, l.description);
  return parts.join(" ");
}

/** A token is covered by a stem set if it matches exactly or shares a 4-char prefix. */
function isCovered(s: string, stems: Set<string>, prefix4: Set<string>): boolean {
  if (stems.has(s)) return true;
  return s.length >= 4 && prefix4.has(s.slice(0, 4));
}

function prefixSet(stems: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const s of stems) if (s.length >= 4) out.add(s.slice(0, 4));
  return out;
}

/**
 * Compute a deterministic fit assessment of a JD against a knowledge base.
 * Returns null for an absent/too-short JD (e.g. an instructions-only run), where
 * a fit score would be meaningless.
 */
export function computeFitAssessment(
  kb: KnowledgeBaseForLLM,
  jdText: string,
): FitAssessment | null {
  if (!jdText || jdText.trim().length < MIN_JD_CHARS) return null;

  // JD: ordered surface forms (first wins) keyed by stem, for readable output.
  const jdSurfaceByStem = new Map<string, string>();
  const jdStems: string[] = [];
  for (const tok of tokenize(jdText)) {
    const s = stem(tok);
    if (!jdSurfaceByStem.has(s)) {
      jdSurfaceByStem.set(s, tok);
      jdStems.push(s);
    }
  }
  if (jdStems.length === 0) return null;

  const skillStems = new Set([...tokenize(kbSkillText(kb))].map(stem));
  const expStems = new Set([...tokenize(kbExperienceText(kb))].map(stem));
  const allStems = new Set([...skillStems, ...expStems]);
  const skillPrefix = prefixSet(skillStems);
  const expPrefix = prefixSet(expStems);
  const allPrefix = prefixSet(allStems);

  let skillHits = 0;
  let expHits = 0;
  const strengths: string[] = [];
  const gaps: string[] = [];
  for (const s of jdStems) {
    if (isCovered(s, skillStems, skillPrefix)) skillHits++;
    if (isCovered(s, expStems, expPrefix)) expHits++;
    const surface = jdSurfaceByStem.get(s)!;
    if (isCovered(s, allStems, allPrefix)) strengths.push(surface);
    else gaps.push(surface);
  }

  const skillsMatch = Math.round((100 * skillHits) / jdStems.length);
  const experienceMatch = Math.round((100 * expHits) / jdStems.length);
  const overall = Math.round(skillsMatch * W_SKILLS + experienceMatch * W_EXPERIENCE);

  return {
    skillsMatch,
    experienceMatch,
    overall,
    verdict: fitVerdict(overall),
    strengths: strengths.slice(0, 8),
    gaps: gaps.slice(0, 8),
    method: "keyword-overlap",
  };
}
