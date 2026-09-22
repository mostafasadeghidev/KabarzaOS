-- هزینهٔ هر سرویس از ماژولِ مالی می‌آید، نه از یک ستونِ جداگانه.
--
-- ⚠️ چرا اتصال و نه ستونِ مبلغ: هزینهٔ اشتراک‌ها از قبل در
-- `recurring_expenses` ثبت می‌شود (مبلغ، ارز، دوره، سررسید). ستونِ دومِ مبلغ
-- یعنی دو منبعِ حقیقت که فردا از هم دور می‌افتند.
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurring_expense_id bigint;

DO $$ BEGIN
  ALTER TABLE services ADD CONSTRAINT services_recurring_expense_id_fk
    FOREIGN KEY ("recurring_expense_id") REFERENCES "recurring_expenses"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "services_recurring_ix" ON "services" ("recurring_expense_id");
