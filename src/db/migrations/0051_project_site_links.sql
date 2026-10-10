-- لینکِ سایتِ پروژه (۲.۱۹.۰): دامنهٔ اصلی و آدرسِ کاملِ سایتِ آزمایشی (مثلاً webflow.io).
-- هر دو اختیاری؛ خالی = ثبت نشده. نمایش به کارفرما با تیکِ جدا کنترل می‌شود و
-- پیش‌فرض خاموش است: آدرسِ آزمایشی چیزی است که تیم باید آگاهانه نشان دهد.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_url text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS test_url text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS urls_client_visible boolean NOT NULL DEFAULT false;
