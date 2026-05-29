/**
 * db:seed — seeds a couple of obviously-fake demo users + a sample knowledge
 * base so the app has data locally. No real personal data.
 *
 * Users + profiles are created with the PRIVILEGED owner connection (the same
 * path the Auth.js adapter uses — users/sessions are not RLS tables). The
 * user-owned KB rows are written through the RLS-scoped `withUser()` path to
 * prove that the normal application code path can write its own rows under RLS.
 *
 * Idempotent: re-running upserts the demo users and replaces their KB.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getOwnerDb, closeDb } from "@/lib/db/client";
import { withUser } from "@/lib/db/rls";
import {
  users,
  profiles,
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
  cvDocuments,
} from "@/lib/db/schema";

interface DemoUser {
  id: string;
  email: string;
  name: string;
  template: "sidebar" | "clean";
}

const DEMO_USERS: DemoUser[] = [
  {
    id: "00000000-0000-4000-8000-00000000a001",
    email: "ada.demo@example.test",
    name: "Ada Sample",
    template: "sidebar",
  },
  {
    id: "00000000-0000-4000-8000-00000000b002",
    email: "blake.demo@example.test",
    name: "Blake Fixture",
    template: "clean",
  },
];

async function seedAuthRows() {
  const db = getOwnerDb();
  for (const u of DEMO_USERS) {
    await db
      .insert(users)
      .values({ id: u.id, email: u.email, name: u.name })
      .onConflictDoUpdate({ target: users.id, set: { name: u.name, email: u.email } });

    await db
      .insert(profiles)
      .values({
        userId: u.id,
        fullName: u.name,
        defaultTemplate: u.template,
        defaultThemeId: u.template === "sidebar" ? "sidebar-default" : "clean-default",
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { fullName: u.name, defaultTemplate: u.template },
      });
  }
}

/** Clear a user's existing KB rows (owner path) so seeding is idempotent. */
async function clearUserData(userId: string) {
  const db = getOwnerDb();
  const kbs = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.userId, userId));
  const kbIds = kbs.map((k) => k.id);
  await db.delete(cvDocuments).where(eq(cvDocuments.userId, userId));
  if (kbIds.length) {
    await db.delete(kbExperiences).where(inArray(kbExperiences.knowledgeBaseId, kbIds));
    await db.delete(kbEducation).where(inArray(kbEducation.knowledgeBaseId, kbIds));
    await db.delete(kbSkills).where(inArray(kbSkills.knowledgeBaseId, kbIds));
    await db.delete(knowledgeBases).where(eq(knowledgeBases.userId, userId));
  }
}

async function seedKnowledgeBase(u: DemoUser) {
  await clearUserData(u.id);

  // All writes go through the RLS-scoped path (proves app_user can write its
  // own rows when app.user_id is set).
  await withUser(u.id, async (tx) => {
    const kbId = randomUUID();
    const expId = randomUUID();
    const exp2Id = randomUUID();
    const eduId = randomUUID();

    await tx.insert(knowledgeBases).values({
      id: kbId,
      userId: u.id,
      version: 1,
      narrative:
        "Fictional demo profile for local development. All companies, dates and metrics are invented and reference no real person.",
      header: {
        name: u.name,
        title: "Senior Widget Engineer",
        website: "example.test/portfolio",
        summaryLong:
          "Made-up engineer with a decade of imaginary experience shipping fictional widgets to nobody in particular.",
      },
      contact: {
        email: u.email,
        phone: "+1 555 0100",
        location: "Sampleville, ZZ",
        linkedin: "linkedin.test/in/demo",
      },
      languages: [
        { name: "English", level: "Native" },
        { name: "Demolang", level: "Professional" },
      ],
    });

    await tx.insert(kbExperiences).values([
      {
        id: expId,
        knowledgeBaseId: kbId,
        userId: u.id,
        ord: 0,
        company: "Acme Fictional Co",
        role: "Staff Widget Engineer",
        period: "2021 — Present",
        location: "Remote",
        bulletsFull: [
          "Invented a make-believe widget pipeline that processed zero real records.",
          "Mentored an imaginary team of four pretend engineers.",
          "Reduced fictional latency by an unverifiable 99%.",
        ],
        angles: [
          { label: "Leadership", jdSignals: ["mentoring", "team lead"], bulletIdxs: [1] },
          { label: "Performance", jdSignals: ["latency", "scale"], bulletIdxs: [2] },
        ],
        tags: ["widgets", "leadership", "performance"],
      },
      {
        id: exp2Id,
        knowledgeBaseId: kbId,
        userId: u.id,
        ord: 1,
        company: "Globex Placeholder LLC",
        role: "Widget Engineer",
        period: "2017 — 2021",
        location: "Sampleville, ZZ",
        bulletsFull: [
          "Built a hypothetical onboarding flow for users who do not exist.",
          "Wrote tests for features that were never specified.",
        ],
        angles: [],
        tags: ["widgets", "onboarding"],
      },
    ]);

    await tx.insert(kbEducation).values({
      id: eduId,
      knowledgeBaseId: kbId,
      userId: u.id,
      ord: 0,
      institution: "University of Examples",
      degree: "B.S. Imaginary Engineering",
      period: "2013 — 2017",
      note: "Minor in Placeholder Studies",
    });

    await tx.insert(kbSkills).values([
      { knowledgeBaseId: kbId, userId: u.id, category: "professional", ord: 0, value: "Widget Design", tags: ["core"] },
      { knowledgeBaseId: kbId, userId: u.id, category: "professional", ord: 1, value: "TypeScript", tags: [] },
      { knowledgeBaseId: kbId, userId: u.id, category: "professional", ord: 2, value: "PostgreSQL", tags: [] },
      { knowledgeBaseId: kbId, userId: u.id, category: "soft", ord: 0, value: "Imaginary Collaboration", tags: [] },
      { knowledgeBaseId: kbId, userId: u.id, category: "soft", ord: 1, value: "Pretend Communication", tags: [] },
    ]);

    // Baseline CvData snapshot (deterministic projection of the KB).
    const cvData = {
      schemaVersion: 1 as const,
      header: {
        name: u.name,
        title: "Senior Widget Engineer",
        website: "example.test/portfolio",
        summary: "Fictional engineer for local demo purposes only.",
      },
      contact: {
        email: u.email,
        phone: "+1 555 0100",
        location: "Sampleville, ZZ",
        linkedin: "linkedin.test/in/demo",
      },
      summary: "Fictional engineer for local demo purposes only.",
      skills: {
        professional: ["Widget Design", "TypeScript", "PostgreSQL"],
        soft: ["Imaginary Collaboration", "Pretend Communication"],
      },
      experience: [
        {
          kbExperienceId: expId,
          company: "Acme Fictional Co",
          role: "Staff Widget Engineer",
          period: "2021 — Present",
          location: "Remote",
          bullets: [
            "Invented a make-believe widget pipeline.",
            "Mentored an imaginary team of four pretend engineers.",
          ],
        },
        {
          kbExperienceId: exp2Id,
          company: "Globex Placeholder LLC",
          role: "Widget Engineer",
          period: "2017 — 2021",
          location: "Sampleville, ZZ",
          bullets: ["Built a hypothetical onboarding flow."],
        },
      ],
      education: [
        {
          kbEducationId: eduId,
          institution: "University of Examples",
          degree: "B.S. Imaginary Engineering",
          period: "2013 — 2017",
          note: "Minor in Placeholder Studies",
        },
      ],
      leadership: [],
      languages: [
        { name: "English", level: "Native" },
        { name: "Demolang", level: "Professional" },
      ],
    };

    await tx.insert(cvDocuments).values({
      userId: u.id,
      kind: "baseline",
      version: 1,
      templateId: u.template,
      themeId: u.template === "sidebar" ? "sidebar-default" : "clean-default",
      knowledgeBaseId: kbId,
      kbVersion: 1,
      cvData,
      label: "Baseline CV",
    });
  });
}

async function main() {
  console.log("→ Seeding demo Auth.js users + profiles…");
  await seedAuthRows();
  for (const u of DEMO_USERS) {
    console.log(`→ Seeding knowledge base for ${u.email}…`);
    await seedKnowledgeBase(u);
  }
  console.log(`✅ Seed complete: ${DEMO_USERS.length} demo users.`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  await closeDb();
  process.exit(1);
});
