-- ظاهرِ اپ (روشن/تیره و پالت) per-user می‌شود، نه per-browser.
--
-- ⚠️ چرا: نسخهٔ قبلی تم را روی خودِ کاربر نگه می‌داشت (`_kteam_theme`)؛ اینجا
-- فقط در localStorage بود، پس کسی که روی لپ‌تاپ «تیره» گذاشته بود روی گوشی
-- دوباره «روشن» می‌دید و با هر پاک‌کردنِ مرورگر انتخابش گم می‌شد.
--
-- ⚠️ خالی یعنی «هنوز انتخابی نکرده» — آن‌وقت همان ترجیحِ مرورگر اثر می‌کند.
-- پیش‌فرضِ 'system' می‌گذاشت هر کاربرِ فعلی که در مرورگرش «تیره» دارد با
-- اولین بارگذاری روشن شود.
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS palette text NOT NULL DEFAULT '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_theme_ck;
ALTER TABLE users ADD CONSTRAINT users_theme_ck CHECK (theme in ('', 'system', 'light', 'dark'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_palette_ck;
ALTER TABLE users ADD CONSTRAINT users_palette_ck CHECK (
  palette in ('', 'stone', 'ocean', 'forest', 'sunset', 'violet', 'slate')
);
