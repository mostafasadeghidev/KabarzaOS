-- قفلِ دستیِ گروهِ پروژه (۳.۱۰.۰): مدیر یا مدیرِ پروژه گروه را فقط‌خواندنی می‌کند، حتی وقتی
-- پروژه در حالِ اجراست. قفلِ خودکار (بایگانی، تکمیل، لغو، توقف) ذخیره نمی‌شود — از وضعیتِ
-- زندهٔ پروژه حساب می‌شود.
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "locked_by" bigint REFERENCES "users"("id") ON DELETE SET NULL;
