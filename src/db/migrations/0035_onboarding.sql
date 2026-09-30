-- آنبوردینگِ نقش‌محور — کتابخانهٔ کارهای روزهای اول (به‌ازای نقش) و
-- چک‌لیستِ هر عضوِ تازه.
--
-- ⚠️ `onboarding_tasks` عکسِ آیتم در لحظهٔ شروع است، نه ارجاعِ زنده: ویرایش یا
-- حذفِ کتابخانه چک‌لیستِ کسی را که وسطِ کار است عوض نمی‌کند (`item_id` خالی می‌شود).
-- ⚠️ هیچ اعتبارنامه‌ای اینجا نیست؛ آیتمِ «دسترسی» فقط به سرویس اشاره می‌کند.

CREATE TABLE IF NOT EXISTS "onboarding_items" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  -- تگِ نقش؛ خالی = همهٔ نقش‌ها.
  "role_tag_id" bigint,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'task' NOT NULL,
  "assignee" text DEFAULT 'member' NOT NULL,
  "assignee_user_id" bigint,
  "service_id" bigint,
  "link" text DEFAULT '' NOT NULL,
  "due_day" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_items_kind_ck" CHECK ("kind" in ('learn','task','access','meeting','document')),
  CONSTRAINT "onboarding_items_assignee_ck" CHECK ("assignee" in ('member','office_manager','service_owner','user')),
  CONSTRAINT "onboarding_items_due_ck" CHECK ("due_day" between 1 and 90)
);

DO $$ BEGIN
  ALTER TABLE "onboarding_items" ADD CONSTRAINT "onboarding_items_role_tag_id_tags_id_fk"
    FOREIGN KEY ("role_tag_id") REFERENCES "tags"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_items" ADD CONSTRAINT "onboarding_items_assignee_user_id_users_id_fk"
    FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_items" ADD CONSTRAINT "onboarding_items_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "onboarding_items_role_ix" ON "onboarding_items" ("role_tag_id");

CREATE TABLE IF NOT EXISTS "onboarding_tasks" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" bigint NOT NULL,
  "item_id" bigint,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'task' NOT NULL,
  "link" text DEFAULT '' NOT NULL,
  "service_id" bigint,
  -- انجام‌دهنده، یک‌بار در لحظهٔ شروع حل می‌شود؛ خالی = هر مدیرِ اعضا.
  "assignee_user_id" bigint,
  "due_date" date NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "done_at" timestamp with time zone,
  "done_by" bigint,
  -- گرنتی که تیکِ آیتمِ «دسترسی» در سیاهه ساخت.
  "grant_id" bigint,
  "overdue_notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_tasks_kind_ck" CHECK ("kind" in ('learn','task','access','meeting','document'))
);

DO $$ BEGIN
  ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_item_id_onboarding_items_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "onboarding_items"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_assignee_user_id_users_id_fk"
    FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_done_by_users_id_fk"
    FOREIGN KEY ("done_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_grant_id_service_grants_id_fk"
    FOREIGN KEY ("grant_id") REFERENCES "service_grants"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ همگام‌سازی با کتابخانه تکراری نمی‌سازد: هر آیتم یک بار برای هر نفر.
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_tasks_item_uq"
  ON "onboarding_tasks" ("user_id", "item_id") WHERE "item_id" is not null;
CREATE INDEX IF NOT EXISTS "onboarding_tasks_user_ix" ON "onboarding_tasks" ("user_id");
CREATE INDEX IF NOT EXISTS "onboarding_tasks_assignee_ix" ON "onboarding_tasks" ("assignee_user_id");
