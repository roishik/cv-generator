// Code-enforced writing-style guardrail — the deterministic sibling of
// truthfulness.ts (FINDINGS.md Tier 1, item 1.3).
//
// The tailoring prompt ASKS the model to follow writing-style rules (no em-
// dashes, no clichés, strong/varied/active openers — see prompts/tailor.ts
// `## STYLE`). This module VERIFIES those rules in pure code and surfaces any
// violations as warnings, mirroring the "soft prompt + hard code guarantee"
// pattern that makes truthfulness a guarantee rather than a hope.
//
// Unlike truthfulness, style flags are ALWAYS `warning` severity: a clichéd
// bullet is a quality issue, never a correctness/honesty one, so it must never
// block export. PURE: no DB, no auth, no network. Depends only on CvData.
import type { CvData } from "@/lib/schemas/cv-data";

export type StyleFlagKind =
  | "em-dash" // an em-dash (—) or literal double-hyphen (--) in prose
  | "cliche" // a banned cliché / filler phrase from CLICHES
  | "weak-opener" // a bullet that starts with a passive / apologetic verb
  | "duplicate-opener"; // two bullets in one role that open with the same word

export interface StyleFlag {
  kind: StyleFlagKind;
  /** Style is advisory only — every flag is a non-blocking warning. */
  severity: "warning";
  /** dotted path into cvData, e.g. "experience[0].bullets[2]" */
  path: string;
  message: string;
  /** the offending fragment (NEVER a secret) */
  value?: string;
}

export interface StyleReport {
  /** true iff there are no flags at all (clean). Style flags NEVER block export. */
  ok: boolean;
  flags: StyleFlag[];
}

/**
 * Banned clichés / filler phrases (lower-case). Seeded from the reference repo's
 * blocklist (03-writing-style.md §"Critical Rules") plus a few canonical résumé
 * clichés. Phrases are matched as case-insensitive substrings; multi-word
 * phrases (e.g. "leverage my") are used where a bare word would over-match a
 * legitimate technical use (e.g. "leveraged Postgres").
 */
export const CLICHES: readonly string[] = [
  "passionate about",
  "great fit",
  "leverage my",
  "leverage your",
  "hit the ground running",
  "drive results",
  "results-driven",
  "results-oriented",
  "synergy",
  "synergies",
  "team player",
  "go-getter",
  "self-starter",
  "think outside the box",
  "proven track record",
  "track record of",
  "best of breed",
  "best-in-class",
  "value add",
  "value-add",
  "wear many hats",
];

/**
 * Weak / passive / apologetic bullet openers. A bullet that begins with one of
 * these (case-insensitive) buries the candidate's agency — the prompt asks for
 * a strong action verb instead. Matched at the START of the (de-bulleted) text.
 */
const WEAK_OPENERS: readonly string[] = [
  "responsible for",
  "responsibilities included",
  "duties included",
  "worked on",
  "worked with",
  "helped with",
  "helped to",
  "assisted with",
  "assisted in",
  "tasked with",
  "involved in",
  "participated in",
  "in charge of",
];

/** Strip a leading bullet glyph / list marker and surrounding whitespace. */
function debullet(text: string): string {
  return text.replace(/^[\s•\-*–—>]+/, "").trim();
}

/** First alphabetic word of a bullet, lower-cased (the "opener"). */
function openerWord(text: string): string {
  const m = debullet(text)
    .toLowerCase()
    .match(/[a-z][a-z'-]*/);
  return m?.[0] ?? "";
}

/** Scan a single prose string for em-dashes and clichés, pushing flags. */
function scanProse(text: string, path: string, flags: StyleFlag[]): void {
  if (/—|--/.test(text)) {
    flags.push({
      kind: "em-dash",
      severity: "warning",
      path,
      message: "Contains an em-dash; the style guide asks for commas, periods, or a restructured sentence.",
    });
  }
  const lower = text.toLowerCase();
  for (const phrase of CLICHES) {
    if (lower.includes(phrase)) {
      flags.push({
        kind: "cliche",
        severity: "warning",
        path,
        message: `Contains the cliché / filler phrase "${phrase}"; replace it with a concrete, fact-backed statement.`,
        value: phrase,
      });
    }
  }
}

/**
 * Verify the writing style of a tailored CvData. Scans the prose-bearing fields
 * (summary, experience bullets, leadership descriptions) for em-dashes, banned
 * clichés, weak bullet openers, and duplicate openers within a role.
 *
 * All flags are `warning` severity — this report informs the reviewer and never
 * gates export. It is a pure function of CvData, so callers can recompute it
 * anywhere (fresh tailoring, cache hit, or document reload) without persistence.
 */
export function lintStyle(cvData: CvData): StyleReport {
  const flags: StyleFlag[] = [];

  // ── summary (top-level; header.summary mirrors it, so scan once) ──
  scanProse(cvData.summary, "summary", flags);

  // ── per-experience: bullet prose + weak/duplicate openers ──
  cvData.experience.forEach((exp, i) => {
    const seenOpeners = new Map<string, number>();
    exp.bullets.forEach((bullet, b) => {
      const path = `experience[${i}].bullets[${b}]`;
      scanProse(bullet, path, flags);

      const body = debullet(bullet).toLowerCase();
      const weak = WEAK_OPENERS.find((w) => body.startsWith(w));
      if (weak) {
        flags.push({
          kind: "weak-opener",
          severity: "warning",
          path,
          message: `Bullet opens with the weak/passive phrase "${weak}"; lead with a strong action verb instead.`,
          value: weak,
        });
      }

      // Duplicate openers WITHIN this role only (varying matters per-role).
      const word = openerWord(bullet);
      if (word) {
        const prior = seenOpeners.get(word) ?? 0;
        if (prior >= 1) {
          flags.push({
            kind: "duplicate-opener",
            severity: "warning",
            path,
            message: `Bullet repeats the opener "${word}" already used in this role; vary the opening verb.`,
            value: word,
          });
        }
        seenOpeners.set(word, prior + 1);
      }
    });
  });

  // ── leadership descriptions (sidebar template) ──
  cvData.leadership.forEach((l, i) => {
    scanProse(l.description, `leadership[${i}].description`, flags);
  });

  return { ok: flags.length === 0, flags };
}
