-- ۲.۲۷.۰ — یک واریز برای چند پروژه: هر پروژه ردیفِ دفترِ خودش را دارد و
-- `split_group` آن‌ها را به هم وصل می‌کند. خالی = ردیفِ تکی (همهٔ ردیف‌های قبلی).

ALTER TABLE ledger ADD COLUMN IF NOT EXISTS split_group text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ledger_split_group_ix ON ledger (split_group) WHERE split_group IS NOT NULL;
