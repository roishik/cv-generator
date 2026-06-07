// Cross-source consistency reconciliation (FINDINGS.md Tier 2, item 2.3).
//
// Source: setup.md Step A4 ("Cross-Reference Check") + A5 (additive vs
// conflicting change sets). When a profile is built from more than one document
// — or when a re-extraction / "Edit with AI" runs against an existing knowledge
// base — the facts can disagree: the same job with two titles, two date ranges,
// an employer spelled differently, a degree or graduation date that drifts.
//
// reconcile() is the pure detector for those conflicts. It does NOT auto-resolve
// (setup.md resolves interactively, one at a time) — it surfaces a structured
// list a UI or agent presents for the user to pick the correct version. Another
// honesty feature: it is the same "soft prompt → hard code" move as
// truthfulness.ts / style-lint.ts, applied to the INPUT facts.
//
// STATUS: this is the pure algorithm. Tailor is single-source today, so it is
// not yet wired into a live flow — the multi-source ingestion + interactive
// resolution UI is roadmap Tier 3.1. The most useful near-term call is
// reconcile([currentKbFacts, freshlyExtractedFacts]) to avoid clobbering edits
// on re-extract. PURE: no DB, no auth, no network.

export interface ReconcileExperience {
  company: string;
  role: string;
  period?: string;
}

export interface ReconcileEducation {
  institution: string;
  degree?: string;
  period?: string;
}

/**
 * One source of extracted facts. The shape is a structural subset of the
 * extraction result, so callers can pass an ExtractionResult (plus a label)
 * directly.
 */
export interface ReconcileSource {
  /** Human label for the source, e.g. "resume.pdf", "linkedin", "diploma". */
  label: string;
  experiences?: ReconcileExperience[];
  education?: ReconcileEducation[];
}

export type ConsistencyFlagKind =
  | "title-mismatch"
  | "period-mismatch"
  | "employer-variant"
  | "degree-mismatch"
  | "grad-date-mismatch";

export interface ConsistencyValue {
  source: string;
  value: string;
}

export interface ConsistencyFlag {
  kind: ConsistencyFlagKind;
  /** Readable entity the flag concerns (a representative employer/institution). */
  entity: string;
  message: string;
  /** The conflicting per-source values to present for resolution. */
  values: ConsistencyValue[];
}

const LEGAL_SUFFIXES = new Set([
  "inc", "llc", "ltd", "limited", "corp", "corporation", "co", "gmbh", "plc",
  "sa", "ag", "bv", "oy", "ab",
]);

/** Lower-case, collapse whitespace, trim. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Company identity key: normalized, punctuation-stripped, legal-suffix-stripped. */
function coreCompany(s: string): string {
  const cleaned = s.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ");
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) {
    words.pop();
  }
  return words.join(" ");
}

/** Institution identity key: normalized, punctuation-stripped. */
function coreInstitution(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

interface Entry {
  source: string;
  /** raw display value for the field being grouped (company/institution). */
  raw: string;
  role?: string;
  degree?: string;
  period?: string;
}

/**
 * Build a flag if a field has ≥2 distinct values spanning ≥2 distinct sources.
 * `pick` extracts the field; undefined values are ignored (cannot conflict).
 */
function mismatchFlag(
  kind: ConsistencyFlagKind,
  entity: string,
  message: string,
  entries: Entry[],
  pick: (e: Entry) => string | undefined,
): ConsistencyFlag | null {
  const byValue = new Map<string, ConsistencyValue>(); // normalized value → first occurrence
  for (const e of entries) {
    const v = pick(e);
    if (v === undefined || v.trim() === "") continue;
    const key = norm(v);
    if (!byValue.has(key)) byValue.set(key, { source: e.source, value: v });
  }
  if (byValue.size < 2) return null;
  const values = [...byValue.values()];
  const distinctSources = new Set(values.map((v) => v.source));
  if (distinctSources.size < 2) return null; // need cross-source disagreement
  return { kind, entity, message, values };
}

/** Group entries by an identity key, preserving insertion order of groups. */
function groupBy(entries: Entry[], keyOf: (e: Entry) => string): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = keyOf(e);
    const arr = groups.get(k);
    if (arr) arr.push(e);
    else groups.set(k, [e]);
  }
  return groups;
}

/** Number of distinct sources represented in a group. */
function sourceCount(entries: Entry[]): number {
  return new Set(entries.map((e) => e.source)).size;
}

/**
 * Detect cross-source inconsistencies across extracted-fact sources. Returns []
 * for a single source (nothing to cross-reference) or when everything agrees.
 */
export function reconcile(sources: ReconcileSource[]): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];
  if (sources.length < 2) return flags;

  // ── Experiences ──
  const expEntries: Entry[] = [];
  for (const s of sources) {
    for (const e of s.experiences ?? []) {
      expEntries.push({
        source: s.label,
        raw: e.company,
        role: e.role,
        ...(e.period ? { period: e.period } : {}),
      });
    }
  }
  for (const group of groupBy(expEntries, (e) => coreCompany(e.raw)).values()) {
    if (sourceCount(group) < 2) continue;
    const entity = group[0]!.raw;
    push(flags, mismatchFlag("employer-variant", entity,
      `Employer name "${entity}" is spelled differently across sources.`,
      group, (e) => e.raw));
    push(flags, mismatchFlag("title-mismatch", entity,
      `Role title at "${entity}" differs across sources.`,
      group, (e) => e.role));
    push(flags, mismatchFlag("period-mismatch", entity,
      `Dates at "${entity}" differ across sources.`,
      group, (e) => e.period));
  }

  // ── Education ──
  const eduEntries: Entry[] = [];
  for (const s of sources) {
    for (const ed of s.education ?? []) {
      eduEntries.push({
        source: s.label,
        raw: ed.institution,
        ...(ed.degree ? { degree: ed.degree } : {}),
        ...(ed.period ? { period: ed.period } : {}),
      });
    }
  }
  for (const group of groupBy(eduEntries, (e) => coreInstitution(e.raw)).values()) {
    if (sourceCount(group) < 2) continue;
    const entity = group[0]!.raw;
    push(flags, mismatchFlag("degree-mismatch", entity,
      `Degree at "${entity}" differs across sources.`,
      group, (e) => e.degree));
    push(flags, mismatchFlag("grad-date-mismatch", entity,
      `Graduation dates at "${entity}" differ across sources.`,
      group, (e) => e.period));
  }

  return flags;
}

function push(flags: ConsistencyFlag[], flag: ConsistencyFlag | null): void {
  if (flag) flags.push(flag);
}
