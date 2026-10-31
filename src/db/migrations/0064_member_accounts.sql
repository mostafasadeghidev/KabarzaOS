-- ۲.۴۹.۰ — حسابِ اعضا: قرض، هدیه و هزینه‌ای که شرکت برای عضو داده، با ماندهٔ بدهیِ هر نفر.
-- بدهی = قرض + هزینه − بازپرداخت − کسر از دستمزد − بخشیده. هدیه بدهی نمی‌سازد.

CREATE TABLE IF NOT EXISTS member_account_entries (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id bigint NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  amount numeric(20,4) NOT NULL,
  currency_id bigint NOT NULL REFERENCES currencies(id),
  amount_eur numeric(20,4) NOT NULL DEFAULT 0,
  -- سهمِ عضو از ردیفِ دفتر، درصد — هزینهٔ اشتراکی که نصفش با شرکت است.
  share_pct numeric(5,2) NOT NULL DEFAULT 100,
  entry_date date NOT NULL,
  due_date date,
  note text NOT NULL DEFAULT '',
  -- پولِ واقعیِ قرض/هدیه/هزینه/بازپرداخت؛ با حذفِ ردیفِ دفتر این هم می‌رود.
  ledger_id bigint REFERENCES ledger(id) ON DELETE CASCADE,
  -- کسر از دستمزد: ردیفِ پرداختِ پروژه که بی‌پولِ نقد ساخته شد.
  payment_id bigint REFERENCES project_payments(id) ON DELETE CASCADE,
  project_id bigint REFERENCES projects(id) ON DELETE SET NULL,
  recurring_expense_id bigint REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_account_kind_ck CHECK (kind in ('loan','gift','charge','repayment','offset','forgive')),
  CONSTRAINT member_account_amount_ck CHECK (amount > 0),
  CONSTRAINT member_account_share_ck CHECK (share_pct > 0 AND share_pct <= 100)
);
CREATE INDEX IF NOT EXISTS member_account_user_ix ON member_account_entries (user_id, entry_date);
CREATE INDEX IF NOT EXISTS member_account_ledger_ix ON member_account_entries (ledger_id);
CREATE INDEX IF NOT EXISTS member_account_payment_ix ON member_account_entries (payment_id);

-- اشتراکی که برای یک عضو پرداخت می‌شود: هر نوبتِ پرداخت، سهمِ او به بدهی‌اش اضافه می‌شود.
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS charge_user_id bigint REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS charge_pct numeric(5,2) NOT NULL DEFAULT 100;

-- دستهٔ «هدیه» کنارِ «وام» در دسته‌های دفتر.
INSERT INTO tags (slug, type, name, color, grants_cap, status_group,
                  is_review, is_closed, is_protected, sort_order, name_i18n)
SELECT 'ledger-gift', 'ledger_category', 'هدیه', '#d94f8a', '', 'out', false, false, false, 19,
       '{"fa": "هدیه", "en": "Gift", "de": "Geschenk", "ckb": "دیاری", "ar": "هدية", "tr": "Hediye", "fr": "Cadeau", "es": "Regalo", "pt": "Presente"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.slug = 'ledger-gift');
