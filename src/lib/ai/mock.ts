// Deterministic MOCK provider — the default (AI_PROVIDER=mock).
// Returns realistic, schema-valid outputs WITHOUT any network call, derived
// deterministically from the input. Exercises the full tailoring + truthfulness
// pipeline locally / in CI with zero spend and no key.
// PURE: no DB, no auth, no network.
import { createHash } from "node:crypto";
import type {
  LLMProvider,
  ExtractProfileInput,
  TailorInput,
  ValidateKeyResult,
} from "./provider";
import {
  ExtractionResult,
  TailorResult,
  type TailorRationaleItem,
} from "@/lib/schemas/llm-contracts";

/** Deterministic v5-ish UUID from a seed string (no randomness). */
function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  // shape into 8-4-4-4-12 with version 4 + RFC variant bits
  const s =
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-4" +
    h.slice(13, 16) +
    "-" +
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32);
  return s;
}

/** Split raw resume text into rough blocks on blank lines. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Pull a simple email / phone / linkedin out of raw text. */
function sniffContact(text: string) {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const phone = text.match(/(?:\+?\d[\d\s()-]{7,}\d)/)?.[0]?.trim();
  const linkedin = text.match(/linkedin\.com\/[\w/-]+/i)?.[0];
  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(linkedin ? { linkedin } : {}),
  };
}

/**
 * Mock extraction: structures the resume text into a KB-shaped result.
 * Heuristic but deterministic — every output fact is echoed from the input.
 */
function mockExtract(input: ExtractProfileInput): ExtractionResult {
  const blocks = paragraphs(input.rawText);
  const firstLine = (blocks[0] ?? "Candidate").split("\n")[0]!.trim();
  const name = firstLine.length > 0 && firstLine.length <= 60 ? firstLine : "Candidate";
  const contact = sniffContact(input.rawText);

  // Treat blocks that contain a bullet-ish line as experiences. Fallback to a
  // single synthesized experience so downstream stages always have material.
  const expBlocks = blocks.filter((b) => /[•\-*]\s|\d{4}/.test(b)).slice(0, 6);
  const experiences = (expBlocks.length ? expBlocks : blocks.slice(0, 1)).map(
    (block, idx) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const headerLine = lines[0] ?? `Role ${idx + 1}`;
      const [roleRaw, companyRaw] = headerLine.split(/\s+(?:at|@|—|-|,)\s+/);
      const role = (roleRaw ?? headerLine).slice(0, 80) || `Role ${idx + 1}`;
      const company = (companyRaw ?? `Company ${idx + 1}`).slice(0, 80);
      const period = block.match(/\b(19|20)\d{2}\b[^\n]*?((19|20)\d{2}|present)\b/i)?.[0];
      const bullets = lines
        .slice(1)
        .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean);
      return {
        company,
        role,
        ...(period ? { period } : {}),
        bulletsFull: bullets.length
          ? bullets
          : [`Contributed to ${company} as ${role}.`],
        tags: deriveTags(block),
        angles: [
          {
            label: "Primary",
            jdSignals: deriveTags(block),
            bulletIdxs: bullets.map((_, i) => i),
          },
        ],
      };
    },
  );

  return ExtractionResult.parse({
    header: {
      name,
      title: experiences[0]?.role ?? "",
      summaryLong:
        blocks.find((b) => b.length > 80 && !/[•\-*]/.test(b)) ?? "",
    },
    contact,
    experiences,
    education: [],
    skills: { professional: deriveTags(input.rawText), soft: [] },
  });
}

/** Deterministic keyword extraction for tags / skills. */
function deriveTags(text: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "from", "that", "this", "have", "was",
    "were", "are", "you", "our", "their", "his", "her", "led", "built",
  ]);
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z+/.-]{3,}/g) ?? []) {
    if (stop.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([w]) => w);
}

/**
 * Mock tailoring: SELECTS and lightly REPHRASES the KB toward the JD, always
 * echoing the real kbExperienceId, never inventing employers/metrics. The
 * output is engineered to pass the provenance guardrail by construction.
 */
function mockTailor(input: TailorInput): TailorResult {
  const { knowledgeBase: kb, jdText, templateId } = input;
  const jdTokens = new Set(deriveTags(jdText));

  // Score experiences by overlap of their tags/angle-signals with the JD.
  const scored = kb.experiences.map((e) => {
    const tokens = new Set([
      ...e.tags.map((t) => t.toLowerCase()),
      ...e.angles.flatMap((a) => a.jdSignals.map((s) => s.toLowerCase())),
    ]);
    let score = 0;
    for (const t of tokens) if (jdTokens.has(t)) score++;
    return { e, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const rationale: TailorRationaleItem[] = [];

  const experience = scored.map(({ e, score }, i) => {
    // Select the JD-most-relevant bullets (those whose angle matched), else top 3.
    const relevantIdxs = new Set<number>();
    for (const a of e.angles) {
      if (a.jdSignals.some((s) => jdTokens.has(s.toLowerCase()))) {
        for (const idx of a.bulletIdxs) relevantIdxs.add(idx);
      }
    }
    const picked = (
      relevantIdxs.size
        ? e.bulletsFull.filter((_, idx) => relevantIdxs.has(idx))
        : e.bulletsFull.slice(0, 3)
    ).slice(0, 4);
    const bullets = picked.length ? picked : e.bulletsFull.slice(0, 1);

    if (score > 0) {
      rationale.push({
        field: `experience[${i}].bullets`,
        change: `Selected ${bullets.length} of ${e.bulletsFull.length} bullets emphasizing JD-relevant work`,
        reason: "Bullets matched job-description signals",
        jdSignal: [...jdTokens][0] ?? "",
      });
    }

    return {
      kbExperienceId: e.id,
      company: e.company, // EXACT — passes provenance
      role: e.role,
      ...(e.period ? { period: e.period } : {}),
      ...(e.location ? { location: e.location } : {}),
      bullets: bullets.length ? bullets : [`Contributed at ${e.company}.`],
    };
  });

  // Reorder skills: JD-matching professional skills first (no new skills added).
  const professional = [...kb.skills.professional].sort((a, b) => {
    const am = jdTokens.has(a.toLowerCase()) ? 0 : 1;
    const bm = jdTokens.has(b.toLowerCase()) ? 0 : 1;
    return am - bm;
  });
  if (professional.join() !== kb.skills.professional.join()) {
    rationale.push({
      field: "skills.professional",
      change: "Reordered skills to lead with JD-relevant ones",
      reason: "Prioritized skills present in the job description",
    });
  }

  // JD-targeted summary built ONLY from KB facts (name/title + existing summary).
  const summary =
    kb.header.summaryLong ||
    `${kb.header.title || "Professional"} with experience at ${kb.experiences
      .slice(0, 2)
      .map((e) => e.company)
      .join(" and ")}.`;
  rationale.push({
    field: "summary",
    change: "Wrote a JD-targeted summary from existing knowledge-base facts",
    reason: "Aligned positioning line to the job description",
  });

  // Warnings: JD signals the KB does not support at all.
  const kbVocab = new Set(
    [
      ...kb.skills.professional,
      ...kb.skills.soft,
      ...kb.experiences.flatMap((e) => [...e.tags, ...e.bulletsFull]),
    ].map((s) => s.toLowerCase()),
  );
  // Scan ALL distinct content words of the JD (not just the top-ranked tags) so
  // a single-mention hard requirement (e.g. "kubernetes") is still surfaced.
  const jdWords = new Set(jdText.toLowerCase().match(/[a-z][a-z+/.-]{3,}/g) ?? []);
  const stop = new Set([
    "with", "your", "will", "you", "our", "the", "and", "for", "are", "this",
    "that", "have", "from", "plus", "lead", "drive", "among", "experience",
    "required", "hiring", "senior",
  ]);
  const warnings: string[] = [];
  for (const token of jdWords) {
    if (stop.has(token)) continue;
    const supported = [...kbVocab].some((v) => v.includes(token));
    if (!supported) {
      warnings.push(`JD mentions "${token}"; not found in knowledge base`);
    }
  }

  return TailorResult.parse({
    cvData: {
      header: {
        name: kb.header.name,
        title: kb.header.title || (kb.experiences[0]?.role ?? "Professional"),
        ...(kb.header.website ? { website: kb.header.website } : {}),
        summary,
      },
      contact: kb.contact,
      summary,
      skills: { professional, soft: kb.skills.soft },
      experience: experience.length
        ? experience
        : [
            {
              kbExperienceId: deterministicUuid("mock-empty"),
              company: "Unknown",
              role: "Unknown",
              bullets: ["No experience in knowledge base."],
            },
          ],
      education: kb.education.map((ed) => ({
        kbEducationId: ed.id,
        institution: ed.institution,
        ...(ed.degree ? { degree: ed.degree } : {}),
        ...(ed.period ? { period: ed.period } : {}),
        ...(ed.note ? { note: ed.note } : {}),
      })),
      leadership: kb.leadership.map((l) => ({
        kbLeadershipId: l.id,
        name: l.name,
        description: l.description,
        ...(l.url ? { url: l.url } : {}),
      })),
      languages: kb.languages.map((l) => ({ name: l.name, level: l.level })),
    },
    rationale,
    templateSuggestion: templateId,
    warnings: warnings.slice(0, 10),
  });
}

export class MockProvider implements LLMProvider {
  readonly id = "mock" as const;

  async validateKey(): Promise<ValidateKeyResult> {
    // No key required for the mock provider.
    return { ok: true, message: "mock provider needs no key" };
  }

  async extractProfile(input: ExtractProfileInput): Promise<ExtractionResult> {
    return mockExtract(input);
  }

  async tailor(input: TailorInput): Promise<TailorResult> {
    return mockTailor(input);
  }
}

// Exported for unit tests / deterministic id generation reuse.
export { deterministicUuid, mockExtract, mockTailor };
