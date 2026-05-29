-- ============================================================================
-- 0001_rls_policies.sql  (hand-authored; runs AFTER the Drizzle DDL migration)
--
-- Implements per-user isolation in Postgres RLS exactly as planning/03 §3.3 and
-- planning/04 §1.1 specify:
--   * a non-superuser, non-BYPASSRLS application role `app_user`
--   * `user_id` denormalized onto every user-owned table (done in schema.ts)
--   * `app_uid()` reads a transaction-local GUC `app.user_id`
--   * ENABLE + FORCE RLS and SELECT/INSERT/UPDATE/DELETE policies on every
--     user-owned table, keyed on `user_id = app_uid()`
--   * the privileged owner role (postgres) bypasses RLS for migrations/auth
--
-- Idempotent: safe to re-run (used by the migrate script and the test bootstrap).
-- ============================================================================

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ── Application role (non-superuser, NO BYPASSRLS) ───────────────────────────
-- Password matches APP_DATABASE_URL in .env (app_user / app_pw).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    -- Make sure an existing role can never bypass RLS.
    ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- The role needs to reach the schema and the (owner-owned) tables.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- Future tables/sequences created by the owner are reachable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- ── Identity helper: the transaction-local GUC the app sets per request ──────
-- Returns NULL when unset/empty → policies deny all rows (fail-closed).
CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_uid() TO app_user;

-- ── Enable + FORCE RLS and (re)create policies on every user-owned table ─────
-- FORCE RLS so policies apply even to the table owner if it ever queries through
-- these tables without intending to bypass (defense-in-depth). The owner role
-- still bypasses for migrations because RLS owner-bypass applies; FORCE closes
-- the accidental-owner-read gap. Auth.js adapter writes use BYPASSRLS-less owner
-- but only touch the Auth.js tables (users/accounts/sessions), which are NOT in
-- this list, so they are unaffected.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles',
    'knowledge_bases',
    'kb_experiences',
    'kb_education',
    'kb_skills',
    'resume_uploads',
    'job_descriptions',
    'cv_documents',
    'artifacts',
    'provider_keys',
    'usage_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS p_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS p_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS p_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS p_delete ON %I', t);

    EXECUTE format(
      'CREATE POLICY p_select ON %I FOR SELECT TO app_user USING (user_id = app_uid())', t);
    EXECUTE format(
      'CREATE POLICY p_insert ON %I FOR INSERT TO app_user WITH CHECK (user_id = app_uid())', t);
    EXECUTE format(
      'CREATE POLICY p_update ON %I FOR UPDATE TO app_user USING (user_id = app_uid()) WITH CHECK (user_id = app_uid())', t);
    EXECUTE format(
      'CREATE POLICY p_delete ON %I FOR DELETE TO app_user USING (user_id = app_uid())', t);
  END LOOP;
END
$$;
