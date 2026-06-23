ALTER TABLE "cv_documents" ADD COLUMN "fit_assessment" jsonb;
-- NOTE: knowledge_bases.leadership is added idempotently by the hand-authored
-- 0002_kb_leadership_column.sql (phase 2). drizzle-kit re-emitted it here only
-- because the prior snapshot predated that out-of-band migration; adding it again
-- with a plain ADD COLUMN would fail on already-migrated databases, so it is
-- intentionally omitted. The snapshot now records the column, keeping future
-- `db:generate` runs clean.
