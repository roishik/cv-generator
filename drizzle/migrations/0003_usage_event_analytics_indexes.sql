-- Speed up the admin analytics dashboard over the existing privacy-safe event log.
CREATE INDEX IF NOT EXISTS "usage_kind_time_idx"
  ON "usage_events" USING btree ("kind", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "usage_status_time_idx"
  ON "usage_events" USING btree ("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "usage_provider_time_idx"
  ON "usage_events" USING btree ("provider", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "usage_meta_path_idx"
  ON "usage_events" ((meta->>'path'))
  WHERE "kind" IN ('page_view', 'screen_time', 'ui_click');

CREATE INDEX IF NOT EXISTS "usage_meta_action_idx"
  ON "usage_events" ((meta->>'action'))
  WHERE "kind" IN (
    'ui_click',
    'upload_resume',
    'extract_profile',
    'tailor_cv',
    'rerender_cv',
    'download_pdf',
    'provider_key_saved',
    'provider_key_deleted',
    'provider_selected',
    'profile_saved',
    'profile_ai_edit'
  );
