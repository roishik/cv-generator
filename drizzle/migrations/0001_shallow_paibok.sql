ALTER TABLE "cv_documents" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "diff" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "truthfulness" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD COLUMN "tailor_cache_key" text;--> statement-breakpoint
CREATE INDEX "cvdoc_tailor_cache_idx" ON "cv_documents" USING btree ("user_id","tailor_cache_key");