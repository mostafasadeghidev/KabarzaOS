-- آپلودِ تکه‌ای و ازسرگرفتنی (۳.۱۰.۰): هر فایلِ در حالِ آپلود یک جلسه دارد. تکه‌ها مستقیم به مقصدِ
-- نهایی می‌روند (آپلودِ تکه‌ایِ Nextcloud یا multipart ِ S3) و هیچ‌وقت روی دیسکِ سرور نمی‌مانند؛
-- این جدول فقط می‌داند کدام تکه رسیده تا پس از قطعی از همان‌جا ادامه دهد.
CREATE TABLE IF NOT EXISTS "upload_sessions" (
  "id" text PRIMARY KEY,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" bigint NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "label" text NOT NULL DEFAULT '',
  "name" text NOT NULL,
  "declared_mime" text NOT NULL DEFAULT '',
  "mime" text,
  "size" bigint NOT NULL,
  "chunk_size" integer NOT NULL,
  "total_chunks" integer NOT NULL,
  "storage_key" text,
  "backend_id" text,
  "parts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_sessions_user_ix" ON "upload_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_sessions_updated_ix" ON "upload_sessions" ("updated_at");
