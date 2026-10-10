-- ۲.۲۲.۰ — سه افزوده:
--  · `unit_entries.work_status_tag_id` — وضعیتِ کارِ هر ردیفِ کارکرد (همان وضعیت‌های پروژه)،
--    جدا از وضعیتِ پرداخت (`status`). ⚠️ روی وضعیتِ خودِ پروژه اثری ندارد.
--  · `tasks.unit_entry_id` — تسک می‌تواند به یک ردیفِ کارکرد وصل شود («Simon - CAT»).
--    با حذفِ ردیف، تسک می‌ماند و فقط پیوندش پاک می‌شود.
--  · `review_users` — مخاطبِ بازبینی به‌جز نقش، شخص هم می‌تواند باشد.
--    هیچ نقش و هیچ شخص = کلِ تیمِ پروژه (پیش‌فرض، مثلِ قبل).

ALTER TABLE unit_entries ADD COLUMN IF NOT EXISTS work_status_tag_id bigint REFERENCES tags(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unit_entry_id bigint REFERENCES unit_entries(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tasks_unit_entry_ix ON tasks (unit_entry_id) WHERE unit_entry_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS review_users (
  review_id bigint NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT review_users_pk PRIMARY KEY (review_id, user_id)
);
