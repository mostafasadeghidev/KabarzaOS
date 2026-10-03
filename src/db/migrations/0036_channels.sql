-- کانالِ تیم و گروهِ پروژه — دو نوعِ گفتگوی گروهی کنارِ گفتگوی دونفره.
--
-- ⚠️ عضویتِ گروه‌ها در `thread_users` نگه داشته نمی‌شود؛ زنده از پروژه، نقش و
-- دفتر حساب می‌شود. `thread_users` برای آن‌ها فقط رسیدِ خواندن و «بی‌صدا» است.
-- ⚠️ گفتگوهای موجود همه `direct` می‌شوند (پیش‌فرض) — رفتارشان عوض نمی‌شود.

ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'direct' NOT NULL;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "title" text DEFAULT '' NOT NULL;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "audience" jsonb;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "project_id" bigint;

DO $$ BEGIN
  ALTER TABLE "threads" ADD CONSTRAINT "threads_kind_ck" CHECK ("kind" in ('direct','channel','project'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "threads" ADD CONSTRAINT "threads_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "threads_kind_ix" ON "threads" ("kind");
-- یک گروه به‌ازای هر پروژه — دو کلیکِ هم‌زمان روی «ساختِ گروه» دو گروه نمی‌سازد.
CREATE UNIQUE INDEX IF NOT EXISTS "threads_project_group_uq" ON "threads" ("project_id") WHERE "kind" = 'project';

ALTER TABLE "thread_users" ADD COLUMN IF NOT EXISTS "muted" boolean DEFAULT false NOT NULL;
