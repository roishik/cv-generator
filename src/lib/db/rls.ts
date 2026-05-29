/**
 * RLS scoping wrapper.
 *
 * `withUser(userId, fn)` opens a transaction on the RLS-enforced app connection,
 * sets the transaction-local GUC `app.user_id` (read by the `app_uid()` SQL
 * helper inside every RLS policy), and runs `fn` with a Drizzle handle bound to
 * that transaction. Because the GUC is set with `set_config(..., true)` it is
 * scoped to the transaction only — when the txn commits/rolls back the setting
 * is gone, so connection-pool reuse can NEVER leak one user's identity into
 * another user's request.
 *
 * `userId` MUST always come from the verified Auth.js session (requireSession()),
 * never from user input. RLS is defense-in-depth: even a query that forgets its
 * `WHERE user_id = ...` clause cannot cross tenants.
 */

import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { getAppDb } from "./client";
import { schema } from "./schema";

/** RLS-scoped transaction handle (a Drizzle pg transaction over the app pool). */
export type RlsDb = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Run `fn` inside a transaction scoped to `userId` via RLS.
 *
 * Uses Drizzle's transaction API so the SET LOCAL and every query share one
 * connection/transaction. `set_config(..., true)` makes `app.user_id`
 * transaction-local, so pooled-connection reuse can never leak identity.
 *
 * @param userId  the authenticated user's id (UUID string)
 * @param fn      callback receiving an RLS-scoped Drizzle transaction handle
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: RlsDb) => Promise<T>,
): Promise<T> {
  if (!userId || typeof userId !== "string") {
    throw new Error("withUser: a non-empty userId is required");
  }
  const db = getAppDb();
  return db.transaction(async (tx) => {
    // Transaction-local; parameterized to avoid any injection.
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx as RlsDb);
  });
}

/**
 * Escape hatch: run `fn` on the app connection WITHOUT any user scoping
 * (app.user_id unset → app_uid() is NULL → RLS denies all user-owned rows).
 * Used by tests to prove the fail-closed default.
 */
export async function withoutUser<T>(fn: (tx: RlsDb) => Promise<T>): Promise<T> {
  const db = getAppDb();
  return db.transaction(async (tx) => {
    // Explicitly clear any inherited setting for clarity.
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    return fn(tx as RlsDb);
  });
}

export { sql };
