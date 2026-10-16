-- ۲.۳۶.۰ — لینکِ عضویتِ گروهِ تلگرامِ پروژه؛ ربات می‌سازد و فقط اعضای تیم را می‌پذیرد.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_group_invite text NOT NULL DEFAULT '';
