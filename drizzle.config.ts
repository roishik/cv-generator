import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Drizzle owns the table DDL (src/lib/db/schema.ts) and
 * generates SQL migrations into drizzle/migrations/. The RLS roles/policies are
 * authored by hand in a companion SQL migration (0001_rls_policies.sql) that the
 * db:migrate script applies AFTER the Drizzle-generated DDL.
 *
 * Migrations connect with the privileged owner role (DATABASE_URL = postgres).
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/cvgen",
  },
  strict: true,
  verbose: true,
});
