-- نامِ یکتای ردیفِ کارکرد و ساعتِ کاریِ هر ردیف (۲.۲۱.۰):
--  · `unit_entries.name` — مثلاً «CAT»؛ داخلِ یک پروژه یکتاست (بی‌توجه به بزرگی/کوچکیِ حرف)
--    و خالی یعنی بی‌نام (ردیف‌های قدیمی).
--  · `timelogs.unit_entry_id` و `work_timers.unit_entry_id` — ساعت و تایمر می‌توانند
--    روی یک ردیف ثبت شوند. ⚠️ `project_id` سرِ جایش می‌ماند، پس گزارش‌های پروژه
--    بی‌تغییر درست می‌مانند. با حذفِ ردیف، ساعت می‌ماند و فقط پیوندش پاک می‌شود.

ALTER TABLE unit_entries ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS unit_entries_project_name_ux ON unit_entries (project_id, lower(name)) WHERE name <> '';
--> statement-breakpoint
ALTER TABLE timelogs ADD COLUMN IF NOT EXISTS unit_entry_id bigint REFERENCES unit_entries(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS timelogs_unit_entry_ix ON timelogs (unit_entry_id) WHERE unit_entry_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE work_timers ADD COLUMN IF NOT EXISTS unit_entry_id bigint REFERENCES unit_entries(id) ON DELETE SET NULL;
