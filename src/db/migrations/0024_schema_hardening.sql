-- سخت‌سازیِ اسکیما — ایندکس‌ها و قیدهایی که افزونه دارد و در پورت جا مانده بود
-- (ممیزیِ سپتامبر ۲۰۲۶، بخشِ هسته).
--
-- ⚠️ هر NOT NULL اول داده را پر می‌کند تا روی دیتابیسِ زنده نشکند: این ستون‌ها را
-- کد همیشه می‌نویسد، ولی ردیف‌های واردشده از نسخهٔ قبلی می‌توانند خالی باشند.
-- عاملِ ناشناخته = مالک (قدیمی‌ترین)؛ ارزِ ناشناخته = ارزِ پیش‌فرض.

-- ایندکس‌های نسخهٔ قبلی
CREATE INDEX IF NOT EXISTS offices_currency_ix ON offices (default_currency_id);
CREATE INDEX IF NOT EXISTS accounts_office_ix ON accounts (office_id);
CREATE INDEX IF NOT EXISTS accounts_currency_ix ON accounts (currency_id);
CREATE INDEX IF NOT EXISTS account_users_user_ix ON account_users (user_id);
CREATE INDEX IF NOT EXISTS vendors_name_lower_ix ON vendors (lower(name));
CREATE INDEX IF NOT EXISTS project_clients_user_ix ON project_clients (user_id);
CREATE INDEX IF NOT EXISTS timelogs_user_ix ON timelogs (user_id);
CREATE INDEX IF NOT EXISTS timelogs_date_ix ON timelogs (log_date);
CREATE INDEX IF NOT EXISTS comments_user_ix ON comments (user_id);
CREATE INDEX IF NOT EXISTS ledger_office_ix ON ledger (office_id);
CREATE INDEX IF NOT EXISTS ledger_date_ix ON ledger (entry_date);
CREATE INDEX IF NOT EXISTS ledger_receiver_ix ON ledger (receiver_user_id);
CREATE INDEX IF NOT EXISTS ledger_receipts_gin ON ledger USING gin (receipt_ids);
CREATE INDEX IF NOT EXISTS qa_items_role_ix ON qa_items (role_tag_id);
CREATE INDEX IF NOT EXISTS payment_requests_project_ix ON payment_requests (project_id);
CREATE INDEX IF NOT EXISTS fiscal_closings_account_ix ON fiscal_closings (account_id);
CREATE INDEX IF NOT EXISTS notifications_created_ix ON notifications (created_at);
CREATE INDEX IF NOT EXISTS meetings_project_ix ON meetings (project_id);
CREATE INDEX IF NOT EXISTS meeting_attendees_user_ix ON meeting_attendees (user_id);
CREATE INDEX IF NOT EXISTS reminders_user_ix ON reminders (user_id);
CREATE INDEX IF NOT EXISTS threads_creator_ix ON threads (creator_id);
CREATE INDEX IF NOT EXISTS threads_updated_ix ON threads (updated_at);
CREATE INDEX IF NOT EXISTS absences_range_ix ON absences (from_date, to_date);
CREATE INDEX IF NOT EXISTS unit_entries_status_ix ON unit_entries (status);

-- ستون‌هایی که کد همیشه می‌نویسد ولی اسکیما اختیاری نگهشان داشته بود
UPDATE tasks SET created_by = COALESCE((SELECT user_id FROM user_roles WHERE role = 'owner' ORDER BY user_id LIMIT 1), (SELECT MIN(id) FROM users))
 WHERE created_by IS NULL;
UPDATE comments c SET project_id = t.project_id FROM tasks t
 WHERE c.project_id IS NULL AND c.task_id = t.id;
DELETE FROM comments WHERE project_id IS NULL;
UPDATE comments SET user_id = COALESCE((SELECT user_id FROM user_roles WHERE role = 'owner' ORDER BY user_id LIMIT 1), (SELECT MIN(id) FROM users))
 WHERE user_id IS NULL;
UPDATE attachments SET user_id = COALESCE((SELECT user_id FROM user_roles WHERE role = 'owner' ORDER BY user_id LIMIT 1), (SELECT MIN(id) FROM users))
 WHERE user_id IS NULL;
UPDATE ledger SET created_by = COALESCE((SELECT user_id FROM user_roles WHERE role = 'owner' ORDER BY user_id LIMIT 1), (SELECT MIN(id) FROM users))
 WHERE created_by IS NULL;
UPDATE project_payments SET currency_id = COALESCE((SELECT id FROM currencies WHERE is_default ORDER BY id LIMIT 1), (SELECT MIN(id) FROM currencies))
 WHERE currency_id IS NULL;
UPDATE recurring_expenses SET currency_id = COALESCE((SELECT id FROM currencies WHERE is_default ORDER BY id LIMIT 1), (SELECT MIN(id) FROM currencies))
 WHERE currency_id IS NULL;
UPDATE payment_requests SET currency_id = COALESCE((SELECT id FROM currencies WHERE is_default ORDER BY id LIMIT 1), (SELECT MIN(id) FROM currencies))
 WHERE currency_id IS NULL;
UPDATE unit_entries SET currency_id = COALESCE((SELECT id FROM currencies WHERE is_default ORDER BY id LIMIT 1), (SELECT MIN(id) FROM currencies))
 WHERE currency_id IS NULL;

ALTER TABLE tasks ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE comments ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE comments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE attachments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE ledger ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE project_payments ALTER COLUMN currency_id SET NOT NULL;
ALTER TABLE recurring_expenses ALTER COLUMN currency_id SET NOT NULL;
ALTER TABLE payment_requests ALTER COLUMN currency_id SET NOT NULL;
ALTER TABLE unit_entries ALTER COLUMN currency_id SET NOT NULL;

-- پیش‌فرض‌هایی که با واژگانِ واقعیِ کد نمی‌خواندند
ALTER TABLE comments ALTER COLUMN status SET DEFAULT 'needs_review';
ALTER TABLE project_payments ALTER COLUMN type SET DEFAULT 'payment';

-- تاریخِ پرداخت یک **روز** است، نه مهرِ زمانی (R-DATA-02): ستون به date تبدیل می‌شود.
UPDATE project_payments SET paid_at = created_at WHERE paid_at IS NULL;
ALTER TABLE project_payments ALTER COLUMN paid_at TYPE date USING (paid_at AT TIME ZONE 'UTC')::date;
ALTER TABLE project_payments ALTER COLUMN paid_at SET NOT NULL;

-- اسلاگِ پایدار برای تگ‌های دستی (نسخهٔ قبلی: type-N، تغییرناپذیر)
UPDATE tags SET slug = type || '-' || id WHERE slug = '';
