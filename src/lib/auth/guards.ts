/**
 * Auth guards and session helpers.
 *
 * `requireSession()` — use in Server Actions and Route Handlers to assert an
 *   authenticated session. Throws a redirect to /sign-in when unauthenticated.
 *   Returns the userId string (the Auth.js DB user.id / UUID).
 *
 * `getCurrentUser()` — returns the full session user object, or null.
 *
 * `withAuthedDb(fn)` — convenience wrapper: requireSession() + withUser(userId, fn).
 *   Use in Server Actions so every query runs inside an RLS-scoped transaction.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { withUser } from "@/lib/db/rls";
import type { RlsDb } from "@/lib/db/rls";

/**
 * Assert an authenticated session.
 * Redirects to /sign-in when the user is not signed in.
 *
 * @returns the authenticated user's id (UUID string)
 */
export async function requireSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  return session.user.id;
}

/**
 * Return the current session user, or null if unauthenticated.
 * Prefer `requireSession()` in guarded contexts.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as { id: string; email?: string | null; name?: string | null; image?: string | null };
}

/**
 * Convenience wrapper for server actions:
 *   1. Calls `requireSession()` → redirects if unauthenticated.
 *   2. Wraps `fn` in `withUser(userId, …)` → every query is RLS-scoped.
 *
 * Usage:
 *   export async function myAction(input: unknown) {
 *     return withAuthedDb(async (tx, userId) => {
 *       return tx.select(…).from(someTable);
 *     });
 *   }
 */
export async function withAuthedDb<T>(
  fn: (tx: RlsDb, userId: string) => Promise<T>,
): Promise<T> {
  const userId = await requireSession();
  return withUser(userId, (tx) => fn(tx, userId));
}
