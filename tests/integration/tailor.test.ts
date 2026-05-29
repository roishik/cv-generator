// @vitest-environment node
/**
 * Integration tests — JD → tailored CV pipeline (M8/M10).
 *
 * Requires: Docker-Compose Postgres up + migrated (pnpm db:up && pnpm db:migrate).
 * Uses the mock AI provider (zero cost, deterministic, no key needed), wrapped in
 * a call-counting spy so we can PROVE the one-LLM-call + cache invariants.
 *
 * Proves:
 *  1. Full pipeline → one-page-fitting tailored CV with provenance + PDF artifact + QA pass.
 *  2. Structured diff vs baseline is correct (rewritten/reordered/added/removed).
 *  3. Truthfulness flags fire on a fabrication attempt (and never auto-fabricate).
 *  4. Cache hit on identical re-run avoids a second LLM call AND reuses the artifact.
 *  5. Versioning preserves the immutable baseline; the tailored doc is a NEW row.
 *  6. Template heuristic picks `clean` for a formal JD, `sidebar` by default.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { getOwnerDb, closeDb } from "@/lib/db/client";
import { withUser } from "@/lib/db/rls";
import {
  users,
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
  cvDocuments,
} from "@/lib/db/schema";
import { closeBrowser } from "@/lib/pdf/browser-pool";
import { MockProvider } from "@/lib/ai/mock";
import type { LLMProvider, TailorInput } from "@/lib/ai/provider";
import type { TailorResult } from "@/lib/schemas/llm-contracts";
import { tailorToJob } from "@/lib/tailor/pipeline";
import { recommendTemplate } from "@/lib/tailor/template-heuristic";

// A spy wrapper around the mock provider that counts tailor() invocations.
class CountingProvider implements LLMProvider {
  readonly id = "mock" as const;
  tailorCalls = 0;
  constructor(
    private inner: LLMProvider,
    private mutate?: (r: TailorResult) => TailorResult,
  ) {}
  validateKey() {
    return this.inner.validateKey();
  }
  extractProfile(input: import("@/lib/ai/provider").ExtractProfileInput) {
    return this.inner.extractProfile(input);
  }
  async tailor(input: TailorInput): Promise<TailorResult> {
    this.tailorCalls++;
    const r = await this.inner.tailor(input);
    return this.mutate ? this.mutate(r) : r;
  }
}

let userId: string;
const expId: string = randomUUID();
const exp2Id: string = randomUUID();
const eduId: string = randomUUID();

const TECH_JD =
  "We are a fast-growing startup hiring a senior software engineer to build our " +
  "machine learning platform. You will own widgets infrastructure, mentor engineers, " +
  "and drive performance and latency improvements across our cloud SaaS product.";

beforeAll(async () => {
  const db = getOwnerDb();
  userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `tailor-test-${userId}@example.test`,
    name: "Tailor Test User",
  });

  // Seed a knowledge base (version 1) with two experiences + skills + baseline.
  await withUser(userId, async (tx) => {
    const kbId = randomUUID();
    await tx.insert(knowledgeBases).values({
      id: kbId,
      userId,
      version: 1,
      narrative: "Test engineer profile.",
      header: {
        name: "Tailor Test User",
        title: "Staff Widget Engineer",
        summaryLong: "Engineer with a decade building widget platforms.",
      },
      contact: { email: "test@example.test", location: "Remote" },
      languages: [{ name: "English", level: "Native" }],
    });
    await tx.insert(kbExperiences).values([
      {
        id: expId,
        knowledgeBaseId: kbId,
        userId,
        ord: 0,
        company: "Acme Widgets",
        role: "Staff Widget Engineer",
        period: "2021 — Present",
        location: "Remote",
        bulletsFull: [
          "Built a widget pipeline that processed 2,000,000 records per day.",
          "Mentored a team of four engineers on machine learning workflows.",
          "Reduced platform latency by 40% across the cloud SaaS product.",
        ],
        angles: [
          { label: "ML", jdSignals: ["machine", "learning", "platform"], bulletIdxs: [1] },
          { label: "Performance", jdSignals: ["latency", "performance", "cloud"], bulletIdxs: [2] },
        ],
        tags: ["widgets", "machine", "learning", "latency", "performance", "cloud"],
      },
      {
        id: exp2Id,
        knowledgeBaseId: kbId,
        userId,
        ord: 1,
        company: "Globex Co",
        role: "Widget Engineer",
        period: "2017 — 2021",
        location: "NYC",
        bulletsFull: [
          "Designed an onboarding flow for enterprise customers.",
          "Wrote integration tests for the billing service.",
        ],
        angles: [{ label: "Onboarding", jdSignals: ["onboarding"], bulletIdxs: [0] }],
        tags: ["widgets", "onboarding", "billing"],
      },
    ]);
    await tx.insert(kbEducation).values({
      id: eduId,
      knowledgeBaseId: kbId,
      userId,
      ord: 0,
      institution: "Test University",
      degree: "B.S. Engineering",
      period: "2013 — 2017",
    });
    await tx.insert(kbSkills).values([
      { knowledgeBaseId: kbId, userId, category: "professional", ord: 0, value: "TypeScript", tags: [] },
      { knowledgeBaseId: kbId, userId, category: "professional", ord: 1, value: "Machine Learning", tags: ["machine", "learning"] },
      { knowledgeBaseId: kbId, userId, category: "professional", ord: 2, value: "PostgreSQL", tags: [] },
      { knowledgeBaseId: kbId, userId, category: "soft", ord: 0, value: "Mentoring", tags: [] },
    ]);
    // Baseline document (immutable).
    await tx.insert(cvDocuments).values({
      userId,
      kind: "baseline",
      version: 1,
      templateId: "sidebar",
      themeId: "sidebar-default",
      knowledgeBaseId: kbId,
      kbVersion: 1,
      cvData: {
        schemaVersion: 1,
        header: { name: "Tailor Test User", title: "Staff Widget Engineer", summary: "Engineer with a decade building widget platforms." },
        contact: { email: "test@example.test", location: "Remote" },
        summary: "Engineer with a decade building widget platforms.",
        skills: { professional: ["TypeScript", "Machine Learning", "PostgreSQL"], soft: ["Mentoring"] },
        experience: [
          {
            kbExperienceId: expId,
            company: "Acme Widgets",
            role: "Staff Widget Engineer",
            period: "2021 — Present",
            location: "Remote",
            bullets: [
              "Built a widget pipeline that processed 2,000,000 records per day.",
              "Mentored a team of four engineers on machine learning workflows.",
              "Reduced platform latency by 40% across the cloud SaaS product.",
            ],
          },
          {
            kbExperienceId: exp2Id,
            company: "Globex Co",
            role: "Widget Engineer",
            period: "2017 — 2021",
            location: "NYC",
            bullets: [
              "Designed an onboarding flow for enterprise customers.",
              "Wrote integration tests for the billing service.",
            ],
          },
        ],
        education: [{ kbEducationId: eduId, institution: "Test University", degree: "B.S. Engineering", period: "2013 — 2017" }],
        leadership: [],
        languages: [{ name: "English", level: "Native" }],
      },
      label: "Baseline CV",
    });
  });
}, 60_000);

afterAll(async () => {
  const db = getOwnerDb();
  await db.delete(users).where(eq(users.id, userId));
  await closeBrowser();
  await closeDb();
});

describe("template-selection heuristic", () => {
  it("recommends sidebar for a tech/startup JD", () => {
    const r = recommendTemplate(TECH_JD);
    expect(r.templateId).toBe("sidebar");
  });
  it("recommends clean for a formal consulting/finance JD", () => {
    const r = recommendTemplate(
      "Top-tier management consulting firm seeking an associate. Investment banking " +
        "and private equity experience preferred. Strong financial modeling required.",
    );
    expect(r.templateId).toBe("clean");
  });
});

describe("tailorToJob — full pipeline", () => {
  it(
    "produces a one-page tailored CV with provenance, PDF artifact, QA pass, diff, and exactly ONE LLM call",
    async () => {
      const provider = new CountingProvider(new MockProvider());
      const res = await tailorToJob({ userId, jobDescription: TECH_JD, providerOverride: provider });

      expect(res.ok).toBe(true);
      expect(res.fits).toBe(true);
      expect(res.cacheHit).toBe(false);
      expect(res.llmCalled).toBe(true);
      expect(provider.tailorCalls).toBe(1); // exactly one LLM call

      // Provenance: every tailored experience id traces to a KB experience.
      const kbIds = new Set([expId, exp2Id]);
      for (const e of res.cvData.experience) expect(kbIds.has(e.kbExperienceId)).toBe(true);
      expect(res.truthfulness.ok).toBe(true);

      // Template heuristic chose sidebar.
      expect(res.templateId).toBe("sidebar");

      // Artifact exists + QA passed + one page.
      expect(res.artifact).toBeTruthy();
      expect(res.artifact!.pageCount).toBe(1);
      expect(res.artifact!.qa.ok).toBe(true);
      expect(res.artifact!.byteSize).toBeGreaterThan(40 * 1024);

      // Structured diff vs baseline is non-trivial and well-formed.
      expect(res.diff.entries.length).toBeGreaterThan(0);
      const kinds = new Set(res.diff.entries.map((e) => e.kind));
      // The mock drops/reorders bullets, so we expect at least a removed or reordered entry.
      expect(kinds.has("removed") || kinds.has("reordered")).toBe(true);

      // Versioning: baseline (kind=baseline, v1) still present + immutable; tailored is a NEW row.
      const docs = await withUser(userId, (tx) =>
        tx.select().from(cvDocuments).where(eq(cvDocuments.userId, userId)),
      );
      const baseline = docs.find((d) => d.kind === "baseline");
      const tailored = docs.find((d) => d.id === res.cvDocumentId);
      expect(baseline).toBeTruthy();
      expect(baseline!.version).toBe(1);
      expect(tailored).toBeTruthy();
      expect(tailored!.kind).toBe("tailored");
      expect(tailored!.id).not.toBe(baseline!.id);
    },
    180_000,
  );

  it(
    "cache hit on identical re-run: ZERO LLM calls, reuses the stored document + artifact",
    async () => {
      const provider = new CountingProvider(new MockProvider());
      const res = await tailorToJob({ userId, jobDescription: TECH_JD, providerOverride: provider });

      expect(res.cacheHit).toBe(true);
      expect(res.llmCalled).toBe(false);
      expect(provider.tailorCalls).toBe(0); // no second LLM call
      expect(res.fits).toBe(true);
      expect(res.artifact).toBeTruthy();

      // No duplicate tailored row was created for the same cache key.
      const tailoredDocs = await withUser(userId, (tx) =>
        tx
          .select()
          .from(cvDocuments)
          .where(and(eq(cvDocuments.userId, userId), eq(cvDocuments.kind, "tailored"))),
      );
      expect(tailoredDocs.length).toBe(1);
    },
    120_000,
  );

  it(
    "truthfulness gate flags a fabrication attempt (poisoned kbExperienceId) and never auto-fabricates",
    async () => {
      // A provider that injects a fabricated experience id + new employer.
      const poison = new CountingProvider(new MockProvider(), (r) => ({
        ...r,
        cvData: {
          ...r.cvData,
          experience: [
            {
              kbExperienceId: "ffffffff-ffff-4fff-8fff-ffffffffffff", // not in KB
              company: "Fabricated Corp", // not in KB
              role: "Imaginary VP",
              bullets: ["Invented a 10x revenue increase that never happened."],
            },
            ...r.cvData.experience,
          ],
        },
      }));

      const res = await tailorToJob({
        userId,
        jobDescription: `${TECH_JD} unique-token-${randomUUID()}`, // distinct cache key → forces LLM call
        providerOverride: poison,
      });

      expect(poison.tailorCalls).toBe(1);
      // The gate must fire: errors present, ok === false. Flags surfaced, not dropped.
      expect(res.truthfulness.ok).toBe(false);
      const kinds = res.truthfulness.flags.map((f) => f.kind);
      expect(kinds).toContain("unknown-kb-experience-id");
      expect(kinds).toContain("new-employer");
      // The fabricated company is surfaced verbatim for human review (never silently shipped clean).
      const newEmployer = res.truthfulness.flags.find((f) => f.kind === "new-employer");
      expect(newEmployer?.value).toBe("Fabricated Corp");
    },
    120_000,
  );
});
