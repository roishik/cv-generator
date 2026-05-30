/**
 * Deterministic skill sanitization.
 *
 * Extraction LLMs sometimes emit a *section header* as a skill value (e.g. a
 * resume with a "Soft Skills" heading but no enumerated items yields
 * `soft: ["Soft Skills"]`). Rendering that produces a section whose only item is
 * the word "Soft Skills". This guard drops such header-like / empty values so
 * the projected CV never shows a degenerate skill.
 *
 * PURE — no DB, no network. Applied at extraction time (so garbage is never
 * persisted) AND defensively at projection time (so already-stored KBs render
 * cleanly without a re-extraction).
 */

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[:•·\-–—]+\s*$/u, "") // strip trailing separators/colons
    .replace(/\s+/gu, " ")
    .trim();

/** Generic section-header phrases that are never real skill values. */
const HEADER_DENYLIST = new Set(
  [
    "skill",
    "skills",
    "soft skill",
    "soft skills",
    "hard skill",
    "hard skills",
    "professional skill",
    "professional skills",
    "technical skill",
    "technical skills",
    "core skill",
    "core skills",
    "key skill",
    "key skills",
    "other skill",
    "other skills",
    "core competency",
    "core competencies",
    "competency",
    "competencies",
    "areas of expertise",
    "expertise",
    "n/a",
    "none",
  ].map(norm),
);

/** True when a single skill value is a usable skill (not a header / empty). */
export function isMeaningfulSkill(value: string, category?: string): boolean {
  const n = norm(value);
  if (n.length === 0) return false;
  if (HEADER_DENYLIST.has(n)) return false;
  if (category && n === norm(category)) return false; // value equals its own group name
  return true;
}

/** Filter a list of skill strings, trimming and dropping header-like/empty values. */
export function sanitizeSkillList(values: readonly string[], category?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!isMeaningfulSkill(trimmed, category)) continue;
    const key = norm(trimmed);
    if (seen.has(key)) continue; // de-dupe (case-insensitive)
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Sanitize a `{ professional, soft }` skills object. */
export function sanitizeSkills(skills: {
  professional: string[];
  soft: string[];
}): { professional: string[]; soft: string[] } {
  return {
    professional: sanitizeSkillList(skills.professional, "professional"),
    soft: sanitizeSkillList(skills.soft, "soft"),
  };
}
