-- ۲.۵۷.۰ — باطل کردنِ نشست‌ها: کوکیِ نشستی که پیش از این زمان امضا شده پذیرفته نمی‌شود.
-- با تغییر یا بازنشانیِ رمز پر می‌شود؛ null یعنی «همهٔ نشست‌های امضاشده معتبرند».
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_after timestamptz;
