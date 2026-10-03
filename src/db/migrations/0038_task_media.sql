-- تصویر و فایل در تسک، یادداشتِ تسک و کامنت.
--
-- ⚠️ همان جدولِ `attachments` — نه جدولِ تازه: گاردِ فایل (`canViewFile`)،
-- حذفِ پروژه و «سبک‌کردنِ پروژه» همه از همین جدول می‌خوانند و رسانهٔ تازه
-- خودبه‌خود زیرِ همان قاعده‌ها می‌آید. `project_id` همیشه پر است.
-- ⚠️ ردیفِ بی‌تسک و بی‌کامنت همان فایلِ پروژه است (تبِ فایل‌ها)؛ رسانهٔ تسک و
-- کامنت آنجا فهرست نمی‌شود، چون تسکِ خصوصی را هر بیننده‌ای نمی‌بیند.
-- ⚠️ رسانهٔ یادداشتِ تسک هر دو ستون را دارد: کامنت برای جایش، تسک برای گاردش.

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "task_id" bigint;
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "comment_id" bigint;

DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_comments_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "attachments_task_ix" ON "attachments" ("task_id") WHERE "task_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "attachments_comment_ix" ON "attachments" ("comment_id") WHERE "comment_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "attachments_file_ix" ON "attachments" ("file_id");
