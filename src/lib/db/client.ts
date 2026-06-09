/**
 * Pooled Postgres clients.
 *
 * TWO clearly-separated connections:
 *
 *  1. `appDb`   — connects as the non-superuser, non-BYPASSRLS `app_user` role
 *                 (APP_DATABASE_URL). ALL business/data-access queries go through
 *                 this client, and almost always via `withUser()` (see rls.ts) so
 *                 that RLS scopes every row to the authenticated user. Reaching
 *                 this client without first setting `app.user_id` returns ZERO
 *                 rows for user-owned tables — RLS is fail-closed.
 *
 *  2. `ownerDb` — connects as the privileged owner/migration role (DATABASE_URL,
 *                 i.e. `postgres`). Used ONLY for migrations and the Auth.js
 *                 adapter (creating users/sessions/accounts during sign-in, which
 *                 happens before an app.user_id is known). Business code MUST NOT
 *                 import this. It bypasses RLS by virtue of being the table owner.
 *
 * Keeping these on distinct roles means a bug in business code physically cannot
 * read another tenant's rows: the app role has no BYPASSRLS and every policy is
 * keyed on the transaction-local `app.user_id` GUC.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/env";
import { schema } from "./schema";

type AppDb = ReturnType<typeof makeDb>;

const COMMON_OPTIONS = {
  // Disable prepared statements so SET LOCAL + queries share one txn cleanly
  // and connection reuse never leaks a server-side prepared plan across roles.
  prepare: false,
  onnotice: () => {
    /* swallow NOTICE noise (e.g. "policy already exists" during dev) */
  },
} as const;

function makeDb(
  connectionString: string,
  max: number,
  cloudSqlConnectionName?: string,
) {
  const sql = cloudSqlConnectionName
    ? postgres({
        ...connectionOptionsFromUrl(connectionString),
        ...COMMON_OPTIONS,
        host: `/cloudsql/${cloudSqlConnectionName}`,
        max,
      })
    : postgres(connectionString, {
        ...COMMON_OPTIONS,
        max,
      });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

function connectionOptionsFromUrl(connectionString: string): {
  database: string;
  username: string;
  password: string;
} {
  const url = new URL(connectionString);
  return {
    database: url.pathname.replace(/^\//, ""),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

let _app: AppDb | undefined;
let _owner: AppDb | undefined;

/** RLS-enforced application client (role: app_user, NO BYPASSRLS). */
export function getAppDb() {
  if (!_app) {
    const env = getEnv();
    const url = env.APP_DATABASE_URL ?? env.DATABASE_URL;
    _app = makeDb(url, 10, env.CLOUD_SQL_CONNECTION_NAME);
  }
  return _app.db;
}

/** Raw postgres-js handle for the app role (needed to open RLS transactions). */
export function getAppSql() {
  getAppDb();
  return _app!.sql;
}

/**
 * PRIVILEGED client (role: postgres). Migrations + Auth.js adapter ONLY.
 * Never use this for tenant-scoped business queries.
 */
export function getOwnerDb() {
  if (!_owner) {
    const env = getEnv();
    _owner = makeDb(env.DATABASE_URL, 5, env.CLOUD_SQL_CONNECTION_NAME);
  }
  return _owner.db;
}

export function getOwnerSql() {
  getOwnerDb();
  return _owner!.sql;
}

/** Close all pools (tests / graceful shutdown). */
export async function closeDb() {
  await Promise.all([
    _app?.sql.end({ timeout: 5 }),
    _owner?.sql.end({ timeout: 5 }),
  ]);
  _app = undefined;
  _owner = undefined;
}

export { schema };
