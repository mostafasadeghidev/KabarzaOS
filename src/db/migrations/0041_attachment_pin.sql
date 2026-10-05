-- سنجاقِ پیوست و لینکِ پروژه (۲.۳.۰).
--
-- منبعِ مهم («طراحیِ نهایی»، «UI Kit ِ کارفرما») بالای فهرستِ تبِ فایل‌ها
-- می‌ماند تا لای فایل‌های تازه گم نشود. پیش‌فرض false، پس ردیف‌های موجود
-- همان ترتیبِ قبلی (تازه‌ترین بالا) را دارند.

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
