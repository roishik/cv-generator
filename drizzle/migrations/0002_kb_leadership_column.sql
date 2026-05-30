-- Persist leadership/impact entries on the knowledge base.
-- Previously leadership was extracted but never stored, so reconstructing the KB
-- from the DB (for tailoring) always yielded an empty leadership list and the
-- tailored CV silently dropped the whole "Leadership & Impact" section.
-- Stored as JSON on the KB row, mirroring the existing `languages` column.
ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS leadership jsonb NOT NULL DEFAULT '[]'::jsonb;
