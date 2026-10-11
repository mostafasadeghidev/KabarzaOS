-- ۲.۲۵.۰ — پرداختِ چندقسطیِ ردیفِ کارکرد (پروژهٔ تعدادی):
--  · `unit_entries.paid_amount` — جمعِ پرداخت‌شده تا امروز (در ارزِ خودِ ردیف). مانده = amount − paid_amount.
--    `status` همان سه حالت می‌ماند: «پرداخت‌شده» فقط وقتی کلِ مبلغ رسیده؛ «بخشی پرداخت‌شده»
--    یعنی status = 'unpaid' و paid_amount > 0 — پس فهرست‌های «پرداخت‌نشده» دست نمی‌خورند.
--  · `unit_payments` — تاریخچهٔ قسط‌ها، هر قسط به ردیفِ دفترِ خودش. با حذفِ آن ردیفِ دفتر قسط هم
--    می‌رود (cascade) و سرویس paid_amount و وضعیت را از نو می‌سازد.
--  · ردیف‌های پرداخت‌شدهٔ قبلی یک قسطِ کامل می‌گیرند تا تاریخچه خالی نماند.

ALTER TABLE unit_entries ADD COLUMN IF NOT EXISTS paid_amount numeric(20,4) NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS unit_payments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  unit_entry_id bigint NOT NULL REFERENCES unit_entries(id) ON DELETE CASCADE,
  ledger_id bigint REFERENCES ledger(id) ON DELETE CASCADE,
  amount numeric(20,4) NOT NULL,
  paid_at date NOT NULL,
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_payments_amount_ck CHECK (amount > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS unit_payments_unit_ix ON unit_payments (unit_entry_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS unit_payments_ledger_ix ON unit_payments (ledger_id) WHERE ledger_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO unit_payments (unit_entry_id, ledger_id, amount, paid_at)
SELECT u.id, l.id, u.amount, coalesce(l.entry_date, u.updated_at::date)
FROM unit_entries u
LEFT JOIN ledger l ON l.id = u.ledger_id
WHERE u.status = 'paid' AND u.amount > 0
  AND NOT EXISTS (SELECT 1 FROM unit_payments p WHERE p.unit_entry_id = u.id);
--> statement-breakpoint
UPDATE unit_entries SET paid_amount = amount WHERE status = 'paid' AND paid_amount = 0;
