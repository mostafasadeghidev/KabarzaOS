-- ۲.۵۱.۰ — نوعِ دستمزدِ هر عضو در پروژه: قراردادی یا تعدادی.
-- خالی یعنی «مثلِ پروژه» (projects.is_unit_based) — ردیف‌های موجود دست نمی‌خورند.
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS pay_type text;
DO $$ BEGIN
  ALTER TABLE project_members ADD CONSTRAINT project_member_pay_type_ck CHECK (pay_type IS NULL OR pay_type IN ('fixed', 'unit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
