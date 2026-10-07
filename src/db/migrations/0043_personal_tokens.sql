-- توکنِ شخصی برای اتصالِ MCP (۲.۷.۰).
--
-- جدولِ `api_keys` از پیش ساخته شده بود ولی هیچ کدی از آن استفاده نمی‌کرد.
-- حالا هر کلید مالِ **یک کاربر** است و دقیقاً دسترسی‌های همان کاربر را دارد —
-- نه بیشتر. فقط هشِ توکن ذخیره می‌شود؛ `prefix` تکهٔ آغازینِ آن است تا کاربر
-- کلیدهایش را از هم تشخیص دهد.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS prefix text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS api_keys_user_ix ON api_keys (user_id);
