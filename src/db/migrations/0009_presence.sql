-- حضورِ زنده — دو مهرِ زمانی برای هر کاربر (docs/rules/PRESENCE.md)
--
-- ⚠️ روی خودِ ردیفِ کاربر، نه جدولِ جدا: هر کاربر فقط ردیفِ خودش را
-- می‌نویسد، پس رقابتی بینِ کاربرها نیست و جدول هم رشد نمی‌کند.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone;
