-- یادآوریِ روزانهٔ ثبتِ ساعت (۳.۲۰.۰): ایمیلش پیش‌فرض خاموش. دستهٔ تازهٔ `timelog` در فهرستِ بی‌صداهای ایمیلِ
-- همهٔ کاربرانِ فعلی می‌نشیند و پیش‌فرضِ ستون هم همین می‌شود؛ هر کس خواست از پروفایل روشنش می‌کند.
-- زنگِ داخلِ برنامه و تلگرام دست نمی‌خورند.
ALTER TABLE "users" ALTER COLUMN "notify_email_muted" SET DEFAULT '["timelog"]'::jsonb;
--> statement-breakpoint
UPDATE "users" SET "notify_email_muted" = "notify_email_muted" || '["timelog"]'::jsonb
  WHERE NOT ("notify_email_muted" @> '["timelog"]'::jsonb);
