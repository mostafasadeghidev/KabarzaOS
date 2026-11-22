-- راهنمای تعاملی (۳.۱۹.۰): پیشرفتِ هر کاربر در راهنماها روی خودِ کاربر — راهنماهای تمام‌شده، راهنمای در جریان
-- (تا پس از رفتن به صفحهٔ دیگر یا بستنِ مرورگر ادامه یابد) و راهنماهایی که مدیر برایش فرستاده.
-- شکل: { done: { id: iso }, active: { id, step } | null, assigned: [id], snoozeUntil: iso } (src/tours/types.ts).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tour_state" jsonb NOT NULL DEFAULT '{}'::jsonb;
