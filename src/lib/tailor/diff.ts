/**
 * Structured baseline→tailored diff for the workspace UI.
 *
 * PURE: no DB, no network, no LLM. Produces a section-by-section, field-level
 * diff that the diff viewer renders. Unlike the coarse `computeDiff` in
 * lib/ai/contracts.ts, this classifies each change into the four kinds the UX
 * spec (01 §3b.5) calls for — added / rewritten / removed / reordered — and
 * groups changes by the CV section a reviewer thinks in (summary, title,
 * skills, experience[i], education, leadership, languages).
 */

import type { CvData } from "@/lib/schemas/cv-data";

export type DiffKind = "added" | "rewritten" | "removed" | "reordered" | "unchanged";

export interface FieldDiff {
  /** dotted path into CvData, e.g. "experience[0].bullets[2]" or "skills.professional". */
  path: string;
  /** human-facing section label, e.g. "Experience · Northstar AI". */
  section: string;
  kind: DiffKind;
  before?: string;
  after?: string;
}

export interface StructuredDiff {
  entries: FieldDiff[];
  summary: {
    added: number;
    rewritten: number;
    removed: number;
    reordered: number;
  };
}

const join = (xs: string[]) => xs.join(" · ");

/** Token-set similarity (Jaccard) used to decide "rewritten" vs "added/removed". */
function similar(a: string, b: string): boolean {
  const ta = new Set(a.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const tb = new Set(b.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  if (ta.size === 0 && tb.size === 0) return true;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 && inter / union >= 0.4;
}

/**
 * Diff two ordered bullet lists into added / removed / rewritten / reordered /
 * unchanged entries. Greedy positional alignment with a similarity fallback that
 * pairs a removed-at-i with an added-elsewhere when their token sets overlap
 * (→ "rewritten"); leftover unmatched are pure adds/removes.
 */
function diffBullets(
  before: string[],
  after: string[],
  pathPrefix: string,
  section: string,
): FieldDiff[] {
  const out: FieldDiff[] = [];
  const beforeUsed = new Array(before.length).fill(false);
  const afterUsed = new Array(after.length).fill(false);

  // 1) exact matches (unchanged or reordered).
  after.forEach((a, ai) => {
    const bi = before.findIndex((b, i) => !beforeUsed[i] && b === a);
    if (bi !== -1) {
      beforeUsed[bi] = true;
      afterUsed[ai] = true;
      out.push({
        path: `${pathPrefix}[${ai}]`,
        section,
        kind: bi === ai ? "unchanged" : "reordered",
        before: a,
        after: a,
      });
    }
  });

  // 2) similarity matches → rewritten.
  after.forEach((a, ai) => {
    if (afterUsed[ai]) return;
    const bi = before.findIndex((b, i) => !beforeUsed[i] && similar(b, a));
    if (bi !== -1) {
      beforeUsed[bi] = true;
      afterUsed[ai] = true;
      out.push({
        path: `${pathPrefix}[${ai}]`,
        section,
        kind: "rewritten",
        before: before[bi],
        after: a,
      });
    }
  });

  // 3) leftovers: pure adds + removes.
  after.forEach((a, ai) => {
    if (!afterUsed[ai]) {
      out.push({ path: `${pathPrefix}[${ai}]`, section, kind: "added", after: a });
    }
  });
  before.forEach((b, bi) => {
    if (!beforeUsed[bi]) {
      out.push({ path: `${pathPrefix}[${bi}]`, section, kind: "removed", before: b });
    }
  });

  return out;
}

/** Diff a scalar string field. */
function diffScalar(
  path: string,
  section: string,
  before: string | undefined,
  after: string | undefined,
): FieldDiff | null {
  const b = before ?? "";
  const a = after ?? "";
  if (b === a) return null;
  if (!b) return { path, section, kind: "added", after: a };
  if (!a) return { path, section, kind: "removed", before: b };
  return { path, section, kind: "rewritten", before: b, after: a };
}

/**
 * Compute the full structured diff between a baseline CvData and a tailored
 * CvData. Experiences are matched by `kbExperienceId` (provenance), so a
 * reordered experience is detected as a reorder of its bullets, not a wholesale
 * remove+add.
 */
export function computeStructuredDiff(
  baseline: CvData,
  tailored: CvData,
): StructuredDiff {
  const entries: FieldDiff[] = [];

  // ── header.title + summary ──
  const titleDiff = diffScalar(
    "header.title",
    "Title",
    baseline.header.title,
    tailored.header.title,
  );
  if (titleDiff) entries.push(titleDiff);

  const summaryDiff = diffScalar("summary", "Summary", baseline.summary, tailored.summary);
  if (summaryDiff) entries.push(summaryDiff);

  // ── skills (treated as ordered lists; reorder vs add/remove) ──
  for (const cat of ["professional", "soft"] as const) {
    const before = baseline.skills[cat];
    const after = tailored.skills[cat];
    if (join(before) === join(after)) continue;
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const sameMembers =
      before.length === after.length && before.every((s) => afterSet.has(s));
    if (sameMembers) {
      entries.push({
        path: `skills.${cat}`,
        section: `Skills · ${cat}`,
        kind: "reordered",
        before: join(before),
        after: join(after),
      });
    } else {
      // membership changed → classify per-item.
      for (const s of after) {
        if (!beforeSet.has(s)) {
          entries.push({
            path: `skills.${cat}`,
            section: `Skills · ${cat}`,
            kind: "added",
            after: s,
          });
        }
      }
      for (const s of before) {
        if (!afterSet.has(s)) {
          entries.push({
            path: `skills.${cat}`,
            section: `Skills · ${cat}`,
            kind: "removed",
            before: s,
          });
        }
      }
    }
  }

  // ── experience: match by kbExperienceId ──
  const baseExpById = new Map(baseline.experience.map((e) => [e.kbExperienceId, e]));
  const tailoredIds = tailored.experience.map((e) => e.kbExperienceId);

  tailored.experience.forEach((exp, i) => {
    const section = `Experience · ${exp.company}`;
    const base = baseExpById.get(exp.kbExperienceId);
    if (!base) {
      // whole experience newly included.
      entries.push({
        path: `experience[${i}]`,
        section,
        kind: "added",
        after: `${exp.role} @ ${exp.company}`,
      });
      exp.bullets.forEach((b, j) =>
        entries.push({ path: `experience[${i}].bullets[${j}]`, section, kind: "added", after: b }),
      );
      return;
    }
    // experience reordered?
    const baseIdx = baseline.experience.findIndex(
      (e) => e.kbExperienceId === exp.kbExperienceId,
    );
    if (baseIdx !== i) {
      entries.push({
        path: `experience[${i}]`,
        section,
        kind: "reordered",
        before: `position ${baseIdx}`,
        after: `position ${i}`,
      });
    }
    const roleDiff = diffScalar(`experience[${i}].role`, section, base.role, exp.role);
    if (roleDiff) entries.push(roleDiff);
    entries.push(
      ...diffBullets(base.bullets, exp.bullets, `experience[${i}].bullets`, section),
    );
  });

  // experiences dropped from baseline.
  baseline.experience.forEach((base, i) => {
    if (!tailoredIds.includes(base.kbExperienceId)) {
      entries.push({
        path: `experience[${i}]`,
        section: `Experience · ${base.company}`,
        kind: "removed",
        before: `${base.role} @ ${base.company}`,
      });
    }
  });

  // drop the noise of unchanged bullets from the UI payload.
  const visible = entries.filter((e) => e.kind !== "unchanged");

  const summary = {
    added: visible.filter((e) => e.kind === "added").length,
    rewritten: visible.filter((e) => e.kind === "rewritten").length,
    removed: visible.filter((e) => e.kind === "removed").length,
    reordered: visible.filter((e) => e.kind === "reordered").length,
  };

  return { entries: visible, summary };
}
