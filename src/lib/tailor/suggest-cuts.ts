// Relevance-weighted cut suggestions (FINDINGS.md Tier 1, item 1.4).
//
// When the deterministic fit ladder is exhausted, the pipeline today returns a
// bare { fits:false, reason, suggestion } and punts to the user. This module
// fills that dead-end with the reference repo's smarter idea: score every
// candidate line and propose cutting the lowest-value ones FIRST — by relevance
// to THIS job description, by duplication, and by length — REGARDLESS of which
// section/role they sit in. ("An older-role bullet that hits the posting beats a
// recent-role bullet that doesn't.")
//
// It only ever SUGGESTS — the user confirms — so the "no silent cuts" invariant
// (planning §6) is preserved. PURE: no DB, no network. Depends only on CvData.
import type { CvData } from "@/lib/schemas/cv-data";
import { keywordSet, overlapCount } from "./keywords";

export interface CutSuggestion {
  /** dotted path into cvData, e.g. "experience[0].bullets[2]". */
  path: string;
  text: string;
  experienceIndex: number;
  company: string;
  /** Number of job-description keywords this bullet matches (higher = keep). */
  relevance: number;
  /** True when this bullet's claim is largely duplicated by another bullet. */
  duplicated: boolean;
  /** Human-readable rationale for proposing this cut. */
  reason: string;
}

/** Two bullets that share at least this many significant tokens are "duplicated". */
const DUP_SHARED_TOKENS = 3;

interface BulletRec {
  expIndex: number;
  bulletIndex: number;
  company: string;
  text: string;
  tokens: Set<string>;
  relevance: number;
  duplicated: boolean;
  /** Higher = more worth keeping. */
  keepValue: number;
}

/**
 * Rank the CV's experience bullets as cut candidates, lowest-value first.
 *
 * Scoring (per 05-cv-templates.md §"Relevance-weighted cutting"):
 *   1. Relevance — JD-keyword overlap (the dominant factor; relevance is kept).
 *   2. Uniqueness — a bullet whose claim is duplicated elsewhere is a cheaper cut.
 *   3. Length — for equal value, cutting the longer bullet frees more page space.
 *
 * Guarantees every experience retains at least one bullet (the schema requires
 * ≥1, and a CV with an empty role is nonsense): the single highest-value bullet
 * of each role is protected and never suggested.
 *
 * @param cvData  the tailored CV to trim
 * @param jdText  the job description (relevance is measured against it; an empty
 *                JD simply removes the relevance signal — ranking falls back to
 *                duplication + length)
 */
export function suggestCuts(cvData: CvData, jdText: string): CutSuggestion[] {
  const jdTokens = keywordSet(jdText);

  // 1) Flatten every bullet into a scored record.
  const bullets: BulletRec[] = [];
  cvData.experience.forEach((exp, expIndex) => {
    exp.bullets.forEach((text, bulletIndex) => {
      const tokens = keywordSet(text);
      bullets.push({
        expIndex,
        bulletIndex,
        company: exp.company,
        text,
        tokens,
        relevance: overlapCount(tokens, jdTokens),
        duplicated: false, // filled in below
        keepValue: 0, // filled in below
      });
    });
  });

  // 2) Duplication: a bullet is "duplicated" if it shares >= DUP_SHARED_TOKENS
  //    significant tokens with any OTHER bullet (cross-role counts).
  for (let i = 0; i < bullets.length; i++) {
    for (let j = i + 1; j < bullets.length; j++) {
      if (overlapCount(bullets[i]!.tokens, bullets[j]!.tokens) >= DUP_SHARED_TOKENS) {
        bullets[i]!.duplicated = true;
        bullets[j]!.duplicated = true;
      }
    }
  }

  // 3) keepValue: relevance dominates; a unique line earns a small bonus.
  for (const b of bullets) {
    b.keepValue = b.relevance * 2 + (b.duplicated ? 0 : 1);
  }

  // 4) Protect the single highest-value bullet of each experience (ties → the
  //    earliest bullet), so no role can ever be emptied.
  const protectedKey = new Set<string>();
  cvData.experience.forEach((_, expIndex) => {
    const inExp = bullets.filter((b) => b.expIndex === expIndex);
    if (inExp.length === 0) return;
    let best = inExp[0]!;
    for (const b of inExp) if (b.keepValue > best.keepValue) best = b;
    protectedKey.add(`${best.expIndex}:${best.bulletIndex}`);
  });

  const candidates = bullets.filter(
    (b) => !protectedKey.has(`${b.expIndex}:${b.bulletIndex}`),
  );

  // 5) Rank: lowest keepValue first; tie → longer bullet first (frees more
  //    space); final tie → stable by (expIndex, bulletIndex) for determinism.
  candidates.sort((a, b) => {
    if (a.keepValue !== b.keepValue) return a.keepValue - b.keepValue;
    if (a.text.length !== b.text.length) return b.text.length - a.text.length;
    if (a.expIndex !== b.expIndex) return a.expIndex - b.expIndex;
    return a.bulletIndex - b.bulletIndex;
  });

  return candidates.map((b) => ({
    path: `experience[${b.expIndex}].bullets[${b.bulletIndex}]`,
    text: b.text,
    experienceIndex: b.expIndex,
    company: b.company,
    relevance: b.relevance,
    duplicated: b.duplicated,
    reason: buildReason(b),
  }));
}

function buildReason(b: BulletRec): string {
  const parts: string[] = [];
  if (b.relevance === 0) {
    parts.push("No overlap with the job description's keywords");
  } else {
    parts.push(`Low relevance to this role (${b.relevance} keyword${b.relevance === 1 ? "" : "s"} matched)`);
  }
  if (b.duplicated) parts.push("overlaps another bullet");
  return parts.join("; ");
}
