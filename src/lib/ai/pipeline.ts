// The two high-level structured contracts the rest of the app calls.
// PURE: no DB, no auth, no network beyond the injected provider.
import { randomUUID } from "node:crypto";
import type { LLMProvider } from "./provider";
import {
  KnowledgeBase,
  type KnowledgeBaseForLLM,
} from "@/lib/schemas/knowledge-base";
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";
import type { ExtractionResult, TailorFit } from "@/lib/schemas/llm-contracts";
import { normalizeTailorCvData, computeDiff, type CvDiffEntry } from "./contracts";
import { verifyTruthfulness, type TruthfulnessReport } from "./truthfulness";
import { lintStyle, type StyleReport } from "./style-lint";
import { sanitizeSkills } from "./sanitize-skills";

export interface ExtractProfileOutput {
  /** Raw provider extraction (resume facts, no synthesized ids). */
  profile: ExtractionResult;
  /** A persistable KnowledgeBase with stable ids minted for each entity. */
  knowledgeBase: KnowledgeBase;
}

/**
 * Contract A: resume text → { profile, knowledgeBase }.
 * The provider returns id-less facts; we mint deterministic-shaped UUIDs so the
 * KB has the provenance ids the tailoring contract echoes back. By default uses
 * randomUUID; pass `idFor` to make ids deterministic (tests/CI).
 */
export async function extractProfile(
  provider: LLMProvider,
  resumeText: string,
  opts: { idFor?: (kind: string, index: number) => string } = {},
): Promise<ExtractProfileOutput> {
  const idFor = opts.idFor ?? (() => randomUUID());
  const profile = await provider.extractProfile({ rawText: resumeText });

  const knowledgeBase = KnowledgeBase.parse({
    narrative: profile.header.summaryLong ?? "",
    header: {
      name: profile.header.name,
      title: profile.header.title ?? "",
      ...(profile.header.website ? { website: profile.header.website } : {}),
      summaryLong: profile.header.summaryLong ?? "",
    },
    contact: profile.contact,
    experiences: profile.experiences.map((e, i) => ({
      id: idFor("experience", i),
      company: e.company,
      role: e.role,
      ...(e.period ? { period: e.period } : {}),
      ...(e.location ? { location: e.location } : {}),
      bulletsFull: e.bulletsFull,
      angles: (e.angles ?? []).map((a) => ({
        label: a.label,
        jdSignals: a.jdSignals,
        bulletIdxs: a.bulletIdxs ?? [],
      })),
      tags: e.tags ?? [],
    })),
    education: profile.education.map((ed, i) => ({
      id: idFor("education", i),
      institution: ed.institution,
      ...(ed.degree ? { degree: ed.degree } : {}),
      ...(ed.period ? { period: ed.period } : {}),
      ...(ed.note ? { note: ed.note } : {}),
    })),
    leadership: (profile.leadership ?? []).map((l, i) => ({
      id: idFor("leadership", i),
      name: l.name,
      description: l.description,
      ...(l.url ? { url: l.url } : {}),
      tags: l.tags ?? [],
    })),
    // Drop header-like / empty skill values (e.g. a stray "Soft Skills" item)
    // so the projected CV never renders a degenerate skill section.
    skills: sanitizeSkills(profile.skills),
    languages: profile.languages ?? [],
  });

  return { profile, knowledgeBase };
}

export interface TailorCvInput {
  knowledgeBase: KnowledgeBaseForLLM;
  jobDescription: string;
  templateId: TemplateId;
  /** Baseline CvData to diff the tailored output against (optional). */
  baselineCvData?: CvData;
  /** Optional free-text user instructions for this tailoring run. */
  instructions?: string;
}

export interface TailorCvOutput {
  cvData: CvData;
  rationale: { field: string; change: string; reason: string; jdSignal?: string }[];
  warnings: string[];
  templateSuggestion: TemplateId;
  diff: CvDiffEntry[];
  /** Code-enforced truthfulness verdict. Caller must reject when !ok. */
  truthfulness: TruthfulnessReport;
  /** Deterministic writing-style review (warnings only; never blocks). */
  style: StyleReport;
  /** The model's holistic JD↔candidate fit judgment. Null on no-JD edit runs. */
  fit: TailorFit | null;
}

/**
 * Contract B: (KB + JD + templateId [+ baseline]) → tailored CvData + rationale
 * + diff, with the truthfulness guardrail applied. The guardrail report is
 * returned (never silently dropped); when `truthfulness.ok === false` the
 * caller must reject the output and trigger a repair/regeneration.
 */
export async function tailorCv(
  provider: LLMProvider,
  input: TailorCvInput,
): Promise<TailorCvOutput> {
  const kb = KnowledgeBase.parse(input.knowledgeBase);
  const result = await provider.tailor({
    knowledgeBase: kb,
    jdText: input.jobDescription,
    templateId: input.templateId,
    ...(input.instructions ? { instructions: input.instructions } : {}),
    ...(input.baselineCvData ? { baselineCvData: input.baselineCvData } : {}),
  });

  const cvData = normalizeTailorCvData(result);

  // Defensive correctness, independent of the provider's behaviour:
  //  - Sanitize skills (drop header-like/empty values the model may echo).
  //  - Carry baseline leadership forward when the model omits it. Leadership is
  //    sidebar-only and providers frequently drop it; the baseline projection is
  //    KB-derived, so this preserves real content without fabricating anything.
  cvData.skills = sanitizeSkills(cvData.skills);
  if (cvData.leadership.length === 0 && (input.baselineCvData?.leadership?.length ?? 0) > 0) {
    cvData.leadership = input.baselineCvData!.leadership;
  }
  // The profile photo is a user asset, never an LLM output — always inherit it
  // from the baseline so every tailored CV (and its PDF) keeps the same photo.
  if (!cvData.photoUrl && input.baselineCvData?.photoUrl) {
    cvData.photoUrl = input.baselineCvData.photoUrl;
  }
  // Likewise carry forward any custom section headings the user set on the baseline.
  if (!cvData.sectionTitles && input.baselineCvData?.sectionTitles) {
    cvData.sectionTitles = input.baselineCvData.sectionTitles;
  }

  const truthfulness = verifyTruthfulness(cvData, kb);
  const style = lintStyle(cvData);
  const diff = input.baselineCvData
    ? computeDiff(input.baselineCvData, cvData)
    : [];

  return {
    cvData,
    rationale: result.rationale,
    warnings: result.warnings,
    templateSuggestion: result.templateSuggestion,
    diff,
    truthfulness,
    style,
    fit: result.fit ?? null,
  };
}
