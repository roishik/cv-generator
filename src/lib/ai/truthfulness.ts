// Code-enforced truthfulness guardrail (planning §5.6 / §4.2 guardrails).
// PURE. Given a tailored CvData + the knowledge base, deterministically verify
// the model invented nothing. This is the invariant that makes truthfulness a
// guarantee rather than a prompt hope.
import type { CvData } from "@/lib/schemas/cv-data";
import type { KnowledgeBase } from "@/lib/schemas/knowledge-base";

export type TruthFlagKind =
  | "unknown-kb-experience-id" // kbExperienceId not in KB
  | "company-mismatch" // company differs from the KB record for that id
  | "period-mismatch" // period differs from the KB record for that id
  | "new-employer" // output company not present anywhere in KB
  | "novel-skill" // skill not derivable from KB skills/tags
  | "unverified-metric" // numeric/metric not present in KB bulletsFull
  | "unknown-education-id"
  | "unknown-leadership-id";

export type TruthSeverity = "error" | "warning";

export interface TruthFlag {
  kind: TruthFlagKind;
  severity: TruthSeverity;
  /** dotted path into cvData, e.g. "experience[0].bullets[2]" */
  path: string;
  message: string;
  /** the offending value (NEVER a secret) */
  value?: string;
}

export interface TruthfulnessReport {
  /** true iff there are no `error`-severity flags. */
  ok: boolean;
  flags: TruthFlag[];
}

const norm = (s: string | undefined): string =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Extract numeric tokens (e.g. "40,000", "22%", "3x", "$5M") from text. */
function extractMetrics(text: string): string[] {
  const matches = text.match(/\$?\d[\d,.]*\s*(?:%|x|k|m|bn|b|\+)?/gi) ?? [];
  return matches.map((m) => m.replace(/[\s,]/g, "").toLowerCase());
}

/** Build the set of skill-ish tokens the KB supports (skills + tags). */
function kbSkillTokens(kb: KnowledgeBase): Set<string> {
  const tokens = new Set<string>();
  for (const s of kb.skills.professional) tokens.add(norm(s));
  for (const s of kb.skills.soft) tokens.add(norm(s));
  for (const e of kb.experiences) {
    for (const t of e.tags) tokens.add(norm(t));
    for (const a of e.angles) for (const sig of a.jdSignals) tokens.add(norm(sig));
  }
  for (const l of kb.leadership) for (const t of l.tags) tokens.add(norm(t));
  tokens.delete("");
  return tokens;
}

/** A skill derives from the KB if it (or a token of it) appears in KB tokens. */
function skillDerivesFromKb(skill: string, kbTokens: Set<string>): boolean {
  const n = norm(skill);
  if (!n) return true;
  if (kbTokens.has(n)) return true;
  // word-overlap heuristic: any non-trivial word of the skill is a KB token,
  // or the skill is a substring of a KB token (or vice-versa).
  const words = n.split(" ").filter((w) => w.length > 2);
  for (const kt of kbTokens) {
    if (kt.includes(n) || n.includes(kt)) return true;
    for (const w of words) if (kt.includes(w)) return true;
  }
  return false;
}

/**
 * Verify a tailored CvData against the knowledge base.
 *
 * Severity model (per §5.6):
 *  - provenance + no-new-employer => ERROR (block; trigger repair/reject).
 *  - skill-containment + numeric sanity => WARNING (surface for human review).
 */
export function verifyTruthfulness(
  cvData: CvData,
  kb: KnowledgeBase,
): TruthfulnessReport {
  const flags: TruthFlag[] = [];

  const byId = new Map(kb.experiences.map((e) => [e.id, e]));
  const kbCompanies = new Set(kb.experiences.map((e) => norm(e.company)));
  const eduIds = new Set(kb.education.map((e) => e.id));
  const leadershipIds = new Set(kb.leadership.map((l) => l.id));
  const kbTokens = kbSkillTokens(kb);

  // ── 1. Provenance + 2. no-new-employer (per experience) ──
  cvData.experience.forEach((exp, i) => {
    const path = `experience[${i}]`;
    const kbExp = byId.get(exp.kbExperienceId);

    if (!kbExp) {
      flags.push({
        kind: "unknown-kb-experience-id",
        severity: "error",
        path: `${path}.kbExperienceId`,
        message: `kbExperienceId "${exp.kbExperienceId}" does not exist in the knowledge base`,
        value: exp.kbExperienceId,
      });
      // company still checked against the whole KB for no-new-employer:
      if (!kbCompanies.has(norm(exp.company))) {
        flags.push({
          kind: "new-employer",
          severity: "error",
          path: `${path}.company`,
          message: `company "${exp.company}" is not present in the knowledge base`,
          value: exp.company,
        });
      }
      return;
    }

    // company must match the referenced KB record exactly (normalized).
    if (norm(exp.company) !== norm(kbExp.company)) {
      flags.push({
        kind: "company-mismatch",
        severity: "error",
        path: `${path}.company`,
        message: `company "${exp.company}" does not match KB record "${kbExp.company}" for id ${exp.kbExperienceId}`,
        value: exp.company,
      });
    }
    // period, when present on output, must match the KB record.
    if (exp.period && kbExp.period && norm(exp.period) !== norm(kbExp.period)) {
      flags.push({
        kind: "period-mismatch",
        severity: "error",
        path: `${path}.period`,
        message: `period "${exp.period}" does not match KB record "${kbExp.period}" for id ${exp.kbExperienceId}`,
        value: exp.period,
      });
    }

    // 4. numeric/claim sanity (best-effort, WARNING): metrics in a tailored
    // bullet must appear somewhere in that experience's KB bulletsFull.
    const kbMetrics = new Set(
      kbExp.bulletsFull.flatMap((b) => extractMetrics(b)),
    );
    exp.bullets.forEach((bullet, b) => {
      for (const metric of extractMetrics(bullet)) {
        if (!kbMetrics.has(metric)) {
          flags.push({
            kind: "unverified-metric",
            severity: "warning",
            path: `${path}.bullets[${b}]`,
            message: `metric "${metric}" in tailored bullet is not present in the KB source bullets for this experience`,
            value: metric,
          });
        }
      }
    });
  });

  // ── 3. skill containment (soft → WARNING) ──
  const allSkills = [
    ...cvData.skills.professional.map((s, i) => ({ s, path: `skills.professional[${i}]` })),
    ...cvData.skills.soft.map((s, i) => ({ s, path: `skills.soft[${i}]` })),
  ];
  for (const { s, path } of allSkills) {
    if (!skillDerivesFromKb(s, kbTokens)) {
      flags.push({
        kind: "novel-skill",
        severity: "warning",
        path,
        message: `skill "${s}" does not derive from the knowledge base; flagged for human approval`,
        value: s,
      });
    }
  }

  // ── education / leadership id provenance (WARNING; ids are optional) ──
  cvData.education.forEach((edu, i) => {
    if (edu.kbEducationId && !eduIds.has(edu.kbEducationId)) {
      flags.push({
        kind: "unknown-education-id",
        severity: "warning",
        path: `education[${i}].kbEducationId`,
        message: `kbEducationId "${edu.kbEducationId}" does not exist in the knowledge base`,
        value: edu.kbEducationId,
      });
    }
  });
  cvData.leadership.forEach((l, i) => {
    if (l.kbLeadershipId && !leadershipIds.has(l.kbLeadershipId)) {
      flags.push({
        kind: "unknown-leadership-id",
        severity: "warning",
        path: `leadership[${i}].kbLeadershipId`,
        message: `kbLeadershipId "${l.kbLeadershipId}" does not exist in the knowledge base`,
        value: l.kbLeadershipId,
      });
    }
  });

  const ok = !flags.some((f) => f.severity === "error");
  return { ok, flags };
}
