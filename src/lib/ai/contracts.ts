// Normalization + diff for the tailoring contract output.
// PURE. Turns a raw provider TailorResult into canonical CvData and computes a
// human-reviewable diff against a baseline.
import { CvData } from "@/lib/schemas/cv-data";
import type { TailorResult } from "@/lib/schemas/llm-contracts";

/** A single field-level change between baseline and tailored CvData. */
export interface CvDiffEntry {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}

/**
 * Normalize a provider's TailorResult.cvData into canonical CvData:
 *  - adds schemaVersion
 *  - mirrors header.summary === top-level summary (header.summary wins if set)
 *  - defaults leadership/languages to []
 * Validates with the canonical CvData zod schema (throws on real shape errors,
 * e.g. a non-uuid kbExperienceId — which is exactly what the provenance layer
 * wants surfaced).
 */
export function normalizeTailorCvData(result: TailorResult): CvData {
  const raw = result.cvData;
  const summary = raw.summary || raw.header.summary || "";
  const candidate = {
    schemaVersion: 1 as const,
    header: {
      name: raw.header.name,
      title: raw.header.title,
      website: raw.header.website,
      summary: raw.header.summary || summary,
    },
    contact: raw.contact,
    summary,
    skills: raw.skills,
    experience: raw.experience,
    education: raw.education,
    leadership: raw.leadership ?? [],
    languages: raw.languages ?? [],
  };
  return CvData.parse(candidate);
}

function flattenBullets(cv: CvData): Map<string, string> {
  const m = new Map<string, string>();
  cv.experience.forEach((e, i) => {
    e.bullets.forEach((b, j) => m.set(`experience[${i}].bullets[${j}]`, b));
  });
  return m;
}

/**
 * Compute a coarse, human-reviewable diff between a baseline CvData and the
 * tailored CvData. Focuses on the fields a reviewer cares about: summary,
 * title, skills, and per-experience bullets.
 */
export function computeDiff(baseline: CvData, tailored: CvData): CvDiffEntry[] {
  const diff: CvDiffEntry[] = [];

  if (baseline.summary !== tailored.summary) {
    diff.push({
      path: "summary",
      kind: "changed",
      before: baseline.summary,
      after: tailored.summary,
    });
  }
  if (baseline.header.title !== tailored.header.title) {
    diff.push({
      path: "header.title",
      kind: "changed",
      before: baseline.header.title,
      after: tailored.header.title,
    });
  }

  const beforeSkills = baseline.skills.professional.join(" · ");
  const afterSkills = tailored.skills.professional.join(" · ");
  if (beforeSkills !== afterSkills) {
    diff.push({
      path: "skills.professional",
      kind: "changed",
      before: beforeSkills,
      after: afterSkills,
    });
  }

  const beforeBullets = flattenBullets(baseline);
  const afterBullets = flattenBullets(tailored);
  for (const [path, after] of afterBullets) {
    const before = beforeBullets.get(path);
    if (before === undefined) {
      diff.push({ path, kind: "added", after });
    } else if (before !== after) {
      diff.push({ path, kind: "changed", before, after });
    }
  }
  for (const [path, before] of beforeBullets) {
    if (!afterBullets.has(path)) {
      diff.push({ path, kind: "removed", before });
    }
  }

  return diff;
}
