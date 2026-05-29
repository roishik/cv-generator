/**
 * Integration-test DB helpers. Assumes the Docker-Compose Postgres is up and
 * migrated (pnpm db:up && pnpm db:migrate). Creates/cleans throwaway test users
 * via the privileged owner connection.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getOwnerDb, getOwnerSql } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export interface TestUser {
  id: string;
  email: string;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const db = getOwnerDb();
  const id = randomUUID();
  const email = `rls-test-${label}-${id}@example.test`;
  await db.insert(users).values({ id, email, name: `RLS Test ${label}` });
  return { id, email };
}

export async function deleteTestUser(id: string) {
  const db = getOwnerDb();
  // ON DELETE CASCADE removes all owned rows across every table.
  await db.delete(users).where(eq(users.id, id));
}

/** Verify the app role is genuinely non-superuser and lacks BYPASSRLS. */
export async function appRoleAttributes() {
  // Use a fresh connection AS app_user to read its own role attributes.
  const { default: postgres } = await import("postgres");
  const url = process.env.APP_DATABASE_URL!;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ rolsuper: boolean; rolbypassrls: boolean; current_user: string }[]>`
      SELECT r.rolsuper, r.rolbypassrls, current_user
      FROM pg_roles r WHERE r.rolname = current_user
    `;
    return rows[0];
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export { getOwnerSql };
