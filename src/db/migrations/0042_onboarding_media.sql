-- فایل‌های راهنمای آیتمِ آنبوردینگ (۲.۶.۰).
--
-- تصویر، ویدئو یا سندِ راهنما روی **آیتمِ کتابخانه** می‌نشیند، نه روی کارِ هر
-- نفر: ویرایشِ کتابخانه بی‌درنگ به چک‌لیستِ همه می‌رسد و فایل یک بار ذخیره
-- می‌شود. ردیف همان `attachments` است (همان گاردِ دانلود و پیش‌نمایش)؛
-- `project_id` تهی می‌ماند، پس در تبِ فایل‌های هیچ پروژه‌ای دیده نمی‌شود.

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS onboarding_item_id bigint
  REFERENCES onboarding_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS attachments_onboarding_item_ix
  ON attachments (onboarding_item_id) WHERE onboarding_item_id IS NOT NULL;
