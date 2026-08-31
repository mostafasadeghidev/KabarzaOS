-- تایمرِ کار + ساعتِ عمومی (docs/rules/TIMELOGS.md)

-- ⚠️ نسخهٔ قبلی ساعتِ «عمومی» (بدونِ پروژه) هم دارد — کارِ اداری و حسابداری که به
-- هیچ پروژه‌ای نمی‌خورد. ستون باید nullable باشد وگرنه آن ساعت‌ها جایی ندارند.
ALTER TABLE "timelogs" ALTER COLUMN "project_id" DROP NOT NULL;

/*
 * تایمرِ در حالِ اجرا یا پارک‌شده — یک ردیف برای هر کاربر.
 *
 * ⚠️ تایمر سمتِ سرور است: فقط لحظهٔ شروع نگه داشته می‌شود و مدت هنگامِ توقف
 * حساب می‌شود، پس بستنِ تبِ مرورگر چیزی را از بین نمی‌برد.
 */
CREATE TABLE IF NOT EXISTS "work_timers" (
  "user_id" bigint PRIMARY KEY NOT NULL,
  -- null یعنی ساعتِ عمومی، نه «بدونِ مقدار».
  "project_id" bigint,
  -- حالتِ در حالِ اجرا.
  "started_at" timestamp with time zone,
  -- حالتِ پارک‌شده (بیش از ۵ ساعت، منتظرِ تأییدِ کاربر).
  "pending_minutes" integer,
  "pending_log_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- ⚠️ کاربر یا در حالِ شمارش است یا پارک‌شده — هرگز هر دو و هرگز هیچ‌کدام.
  -- بدونِ این قید، «توقف» می‌توانست ردیفی بسازد که هم می‌شمارد هم منتظر است.
  CONSTRAINT "work_timers_state_ck"
    CHECK (("started_at" IS NOT NULL) <> ("pending_minutes" IS NOT NULL))
);

DO $$ BEGIN
  ALTER TABLE "work_timers" ADD CONSTRAINT "work_timers_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "work_timers" ADD CONSTRAINT "work_timers_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

/*
 * در دسترس بودنِ هفتگی — هر عضو روزها و بازه‌های ساعتی‌اش را علامت می‌زند.
 * ترتیبِ هفته ایرانی است: ۰ = شنبه … ۶ = جمعه.
 */
CREATE TABLE IF NOT EXISTS "availability_slots" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" bigint NOT NULL,
  "weekday" integer NOT NULL,
  "from_time" text NOT NULL,
  "to_time" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "availability_weekday_ck" CHECK ("weekday" BETWEEN 0 AND 6),
  -- بازهٔ وارونه بی‌معناست و در نمایشِ ماتریس ردیفِ خالی می‌سازد.
  CONSTRAINT "availability_range_ck" CHECK ("from_time" < "to_time")
);

DO $$ BEGIN
  ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "availability_user_ix" ON "availability_slots" ("user_id", "weekday");
