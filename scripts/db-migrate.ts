/**
 * db:migrate — applies the full schema to the Docker-Compose Postgres.
 *
 * Two phases, both connecting with the PRIVILEGED owner role (DATABASE_URL):
 *   1. Drizzle-generated DDL migrations in drizzle/migrations/ (tracked by
 *      drizzle-kit's own journal) via drizzle-orm's `migrate()`.
 *   2. Hand-authored raw-SQL RLS migrations (drizzle/migrations/*_rls*.sql and
 *      any other .sql not in the Drizzle journal) applied idempotently and
 *      tracked in a small `_rls_migrations` table.
 *
 * The owner role is used because creating roles/policies and running DDL
 * requires privileges the app_user role intentionally does not have.
 */

import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run migrations");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);

  try {
    // pgcrypto is required for the gen_random_uuid() column defaults.
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    // ── Phase 1: Drizzle-generated DDL ──────────────────────────────────────
    console.log("→ Applying Drizzle DDL migrations…");
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("  ✓ Drizzle DDL up to date");

    // ── Phase 2: hand-authored RLS/raw SQL migrations ───────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS _rls_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    // Files we manage by hand (RLS roles/policies). Drizzle's own files are
    // tracked in meta/_journal.json and skipped here.
    const journalPath = join(MIGRATIONS_DIR, "meta", "_journal.json");
    const drizzleTracked = new Set<string>();
    if (existsSync(journalPath)) {
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
        entries: { tag: string }[];
      };
      for (const e of journal.entries) drizzleTracked.add(`${e.tag}.sql`);
    }

    const rlsFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !drizzleTracked.has(f))
      .sort();

    for (const file of rlsFiles) {
      const already = await sql`
        SELECT 1 FROM _rls_migrations WHERE filename = ${file}
      `;
      if (already.length > 0) {
        console.log(`  • ${file} (already applied)`);
        continue;
      }
      console.log(`→ Applying RLS migration ${file}…`);
      const ddl = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await sql.unsafe(ddl);
      await sql`INSERT INTO _rls_migrations (filename) VALUES (${file})`;
      console.log(`  ✓ ${file}`);
    }

    console.log("✅ Migrations complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
