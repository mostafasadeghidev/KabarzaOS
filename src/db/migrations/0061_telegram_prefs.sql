-- ۲.۴۱.۰ — ترجیحاتِ تلگرام: دسته‌های خاموش، ساعتِ سکوت، گزارشِ عصر.

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
