// @vitest-environment node
/**
 * RLS per-user isolation proof (security-critical).
 *
 * Runs against the Docker-Compose Postgres (pnpm db:up && pnpm db:migrate).
 * Proves, while connected as the non-BYPASSRLS `app_user` role:
 *   1. The app role really is non-superuser and lacks BYPASSRLS.
 *   2. Each user, scoped via withUser(), sees ONLY their own rows.
 *   3. User A cannot SELECT / UPDATE / DELETE user B's rows on EVERY RLS table.
 *   4. Without app.user_id set (withoutUser), the app role sees ZERO rows
 *      (fail-closed) and INSERTs are rejected.
 *   5. The GUC is transaction-local — it does not leak across withUser calls
 *      sharing the pooled connection.
 *   6. The privileged owner connection bypasses RLS (can see all rows).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql as sqlRaw } from "drizzle-orm";
import { getOwnerDb, closeDb } from "@/lib/db/client";
import { withUser, withoutUser } from "@/lib/db/rls";
import {
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
  profiles,
  resumeUploads,
  jobDescriptions,
  cvDocuments,
  artifacts,
  providerKeys,
  usageEvents,
} from "@/lib/db/schema";
import {
  appRoleAttributes,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers/db";

let userA: TestUser;
let userB: TestUser;

// One representative row per RLS table, owned by a given user.
// `mk` builds the values; `table` is the Drizzle table; `extra` carries ids we
// need to chain FKs (kb id, cv doc id).
interface Seeded {
  kbId: string;
  cvDocId: string;
}

async function seedFor(u: TestUser): Promise<Seeded> {
  return withUser(u.id, async (tx) => {
    const [kb] = await tx
      .insert(knowledgeBases)
      .values({ userId: u.id, version: 1, narrative: `kb-${u.id}` })
      .returning({ id: knowledgeBases.id });

    await tx.insert(kbExperiences).values({
      knowledgeBaseId: kb.id,
      userId: u.id,
      ord: 0,
      company: "TestCo",
      role: "Engineer",
      bulletsFull: ["did things"],
    });
    await tx.insert(kbEducation).values({
      knowledgeBaseId: kb.id,
      userId: u.id,
      ord: 0,
      institution: "Test University",
    });
    await tx.insert(kbSkills).values({
      knowledgeBaseId: kb.id,
      userId: u.id,
      category: "professional",
      ord: 0,
      value: "TypeScript",
    });
    await tx.insert(profiles).values({ userId: u.id, fullName: `User ${u.id}` });
    await tx.insert(resumeUploads).values({
      userId: u.id,
      storagePath: `uploads/${u.id}/x.pdf`,
      filename: "x.pdf",
      mimeType: "application/pdf",
      byteSize: 1234,
      sha256: "abc",
    });
    const [jd] = await tx
      .insert(jobDescriptions)
      .values({ userId: u.id, rawText: "JD text", sha256: "jdhash" })
      .returning({ id: jobDescriptions.id });

    const [doc] = await tx
      .insert(cvDocuments)
      .values({
        userId: u.id,
        kind: "baseline",
        templateId: "sidebar",
        knowledgeBaseId: kb.id,
        kbVersion: 1,
        jobDescriptionId: jd.id,
        cvData: { schemaVersion: 1 },
      })
      .returning({ id: cvDocuments.id });

    await tx.insert(artifacts).values({
      userId: u.id,
      cvDocumentId: doc.id,
      storagePath: `artifacts/${u.id}/x.pdf`,
      byteSize: 50000,
      sha256: "pdfhash",
      pageCount: 1,
    });
    await tx.insert(providerKeys).values({
      userId: u.id,
      provider: "anthropic",
      ciphertext: Buffer.from("ct"),
      iv: Buffer.from("iv"),
      authTag: Buffer.from("tag"),
      last4: "AB12",
    });
    await tx.insert(usageEvents).values({
      userId: u.id,
      kind: "tailor",
      status: "ok",
    });

    return { kbId: kb.id, cvDocId: doc.id };
  });
}

let seededA: Seeded;
let seededB: Seeded;

beforeAll(async () => {
  userA = await createTestUser("A");
  userB = await createTestUser("B");
  seededA = await seedFor(userA);
  seededB = await seedFor(userB);
}, 60_000);

afterAll(async () => {
  if (userA) await deleteTestUser(userA.id);
  if (userB) await deleteTestUser(userB.id);
  await closeDb();
});

describe("app_user role hardening", () => {
  it("is non-superuser and has NO BYPASSRLS", async () => {
    const attrs = await appRoleAttributes();
    expect(attrs.current_user).toBe("app_user");
    expect(attrs.rolsuper).toBe(false);
    expect(attrs.rolbypassrls).toBe(false);
  });
});

describe("withUser scopes SELECT to the owner", () => {
  it("user A sees only their own knowledge_bases / cv_documents", async () => {
    const aRows = await withUser(userA.id, (tx) => tx.select().from(knowledgeBases));
    expect(aRows.length).toBeGreaterThan(0);
    expect(aRows.every((r) => r.userId === userA.id)).toBe(true);
    expect(aRows.some((r) => r.id === seededB.kbId)).toBe(false);

    const aDocs = await withUser(userA.id, (tx) => tx.select().from(cvDocuments));
    expect(aDocs.every((r) => r.userId === userA.id)).toBe(true);
    expect(aDocs.some((r) => r.id === seededB.cvDocId)).toBe(false);
  });

  it("user B sees only their own rows", async () => {
    const bRows = await withUser(userB.id, (tx) => tx.select().from(knowledgeBases));
    expect(bRows.every((r) => r.userId === userB.id)).toBe(true);
    expect(bRows.some((r) => r.id === seededA.kbId)).toBe(false);
  });
});

// Per-table cross-tenant isolation matrix.
const TABLES = [
  { name: "profiles", table: profiles, pk: profiles.userId, ownerKey: (u: TestUser) => u.id },
  { name: "knowledge_bases", table: knowledgeBases, pk: knowledgeBases.id },
  { name: "kb_experiences", table: kbExperiences, pk: kbExperiences.id },
  { name: "kb_education", table: kbEducation, pk: kbEducation.id },
  { name: "kb_skills", table: kbSkills, pk: kbSkills.id },
  { name: "resume_uploads", table: resumeUploads, pk: resumeUploads.id },
  { name: "job_descriptions", table: jobDescriptions, pk: jobDescriptions.id },
  { name: "cv_documents", table: cvDocuments, pk: cvDocuments.id },
  { name: "artifacts", table: artifacts, pk: artifacts.id },
  { name: "provider_keys", table: providerKeys, pk: providerKeys.id },
  { name: "usage_events", table: usageEvents, pk: usageEvents.id },
] as const;

describe("cross-tenant isolation on every RLS table", () => {
  for (const { name, table } of TABLES) {
    describe(name, () => {
      const userIdCol = (table as { userId: typeof profiles.userId }).userId;

      it("A cannot SELECT B's rows (B's rows invisible to A)", async () => {
        // What does B own?
        const bOwned = (await withUser(userB.id, (tx) =>
          tx.select({ userId: userIdCol }).from(table as never),
        )) as Array<{ userId: string }>;
        expect(bOwned.length).toBeGreaterThan(0);
        expect(bOwned.every((r) => r.userId === userB.id)).toBe(true);

        // A's view must contain none of B's rows.
        const aView = (await withUser(userA.id, (tx) =>
          tx.select({ userId: userIdCol }).from(table as never),
        )) as Array<{ userId: string }>;
        expect(aView.every((r) => r.userId === userA.id)).toBe(true);
        expect(aView.some((r) => r.userId === userB.id)).toBe(false);
      });

      it("A's UPDATE of a B-owned row affects 0 rows", async () => {
        // Attempt to update every B row while scoped as A, filtering on B's id.
        const updated = (await withUser(userA.id, (tx) =>
          tx
            .update(table as never)
            // set user_id to A — RLS USING clause filters to A's rows first,
            // so no B row is visible and nothing is updated.
            .set({ userId: userA.id } as never)
            .where(eq(userIdCol, userB.id))
            .returning({ userId: userIdCol }),
        )) as Array<{ userId: string }>;
        expect(updated.length).toBe(0);
      });

      it("A's DELETE of B-owned rows affects 0 rows", async () => {
        const deleted = (await withUser(userA.id, (tx) =>
          tx.delete(table as never).where(eq(userIdCol, userB.id)).returning({ userId: userIdCol }),
        )) as Array<{ userId: string }>;
        expect(deleted.length).toBe(0);

        // Confirm B still sees its rows (nothing was actually removed).
        const bStill = (await withUser(userB.id, (tx) =>
          tx.select({ userId: userIdCol }).from(table as never),
        )) as Array<{ userId: string }>;
        expect(bStill.length).toBeGreaterThan(0);
      });
    });
  }
});

/** Assert a thrown DB error is an RLS WITH CHECK violation (PG code 42501). */
async function expectRlsViolation(p: Promise<unknown>) {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught, "expected the write to be rejected by RLS").toBeDefined();
  // Drizzle wraps the driver error; the real PostgresError is on `.cause`.
  const cause = (caught as { cause?: { code?: string; message?: string } }).cause ?? caught;
  const code = (cause as { code?: string }).code;
  const message = String((cause as { message?: string }).message ?? caught);
  expect(
    code === "42501" || /row-level security|violates row-level/i.test(message),
    `expected RLS violation (42501), got code=${code} message=${message}`,
  ).toBe(true);
}

describe("INSERT WITH CHECK prevents writing rows for another user", () => {
  it("A cannot insert a usage_event owned by B", async () => {
    await expectRlsViolation(
      withUser(userA.id, (tx) =>
        tx.insert(usageEvents).values({ userId: userB.id, kind: "tailor", status: "ok" }),
      ),
    );
  });
});

describe("fail-closed default (no app.user_id set)", () => {
  it("sees ZERO rows on a user-owned table", async () => {
    const rows = await withoutUser((tx) => tx.select().from(knowledgeBases));
    expect(rows.length).toBe(0);
  });

  it("rejects INSERT (no identity → WITH CHECK fails)", async () => {
    await expectRlsViolation(
      withoutUser((tx) =>
        tx.insert(usageEvents).values({ userId: userA.id, kind: "tailor", status: "ok" }),
      ),
    );
  });
});

describe("GUC is transaction-local (no pool leakage)", () => {
  it("a later withUser(B) does not inherit A's identity", async () => {
    await withUser(userA.id, (tx) => tx.select().from(knowledgeBases));
    const bRows = await withUser(userB.id, (tx) => tx.select().from(knowledgeBases));
    expect(bRows.every((r) => r.userId === userB.id)).toBe(true);
    // And an unscoped call right after still sees nothing.
    const none = await withoutUser((tx) => tx.select().from(knowledgeBases));
    expect(none.length).toBe(0);
  });

  it("app.user_id resets to empty after a withUser transaction commits", async () => {
    await withUser(userA.id, (tx) => tx.select().from(knowledgeBases));
    // A fresh (unscoped) transaction must NOT inherit A's id from the pool.
    const rows = (await withoutUser((tx) =>
      tx.execute(sqlRaw`SELECT current_setting('app.user_id', true) AS uid`),
    )) as unknown as Array<{ uid: string | null }>;
    const value = rows[0]?.uid;
    expect(value === "" || value == null).toBe(true);
    expect(value).not.toBe(userA.id);
  });
});

describe("privileged owner connection bypasses RLS", () => {
  it("owner sees BOTH users' knowledge_bases", async () => {
    const db = getOwnerDb();
    const aKb = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, seededA.kbId)));
    const bKb = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, seededB.kbId)));
    expect(aKb.length).toBe(1);
    expect(bKb.length).toBe(1);
  });
});
