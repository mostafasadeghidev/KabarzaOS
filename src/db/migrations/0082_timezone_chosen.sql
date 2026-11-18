-- منطقهٔ زمانیِ خودکار (۳.۱۵.۱): زمانی که کاربر خودش منطقه را انتخاب کرده (حتی «پیش‌فرضِ سامانه»).
-- تا وقتی خالی است، برنامه منطقه را از دستگاهِ کاربر تشخیص می‌دهد و ذخیره می‌کند؛ پس از انتخابِ دستی
-- هرگز به آن دست نمی‌زند. کاربرانی که از پیش منطقه داشتند «انتخاب‌کرده» حساب می‌شوند.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone_chosen_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users" SET "timezone_chosen_at" = now() WHERE "timezone" <> '' AND "timezone_chosen_at" IS NULL;
