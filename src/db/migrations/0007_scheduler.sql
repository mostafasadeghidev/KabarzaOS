-- زمان‌بند — مهرهای «آخرین اجرا» (docs/rules/SCHEDULER.md)

/**
 * ⚠️ یک ردیفِ **بازنویسی‌شونده** برای هر کاربر/کار، نه یک ردیف در روز.
 * عمداً تک‌مقداری نگه داشته می‌شود تا تلنگرِ روزانه
 * دنباله‌ای از ردیف در دیتابیس نگذارد.
 */
CREATE TABLE IF NOT EXISTS "scheduler_stamps" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- پرچمِ «یادآوریِ تایمرِ رهاشده فرستاده شد» — با توقفِ تایمر پاک می‌شود.
ALTER TABLE "work_timers" ADD COLUMN IF NOT EXISTS "reminded_at" timestamp with time zone;

-- پرچمِ «یادآوریِ جلسه فرستاده شد» — یک‌بار برای هر جلسه.
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "reminded" boolean DEFAULT false NOT NULL;
