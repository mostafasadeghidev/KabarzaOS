-- ۲.۵۰.۰ — حقوقِ ماهانه: دوره‌های حقوقِ هر عضو و پرداختِ هر ماه.
-- هر دوره یک مبلغِ ثابت از ماهِ شروع تا ماهِ پایان (خالی = هنوز ادامه دارد).
-- «توقف» یعنی بستنِ دوره و «ادامه» یعنی دورهٔ تازه؛ ماه‌های بیرونِ دوره‌ها حقوق ندارند.

CREATE TABLE IF NOT EXISTS member_salaries (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id bigint NOT NULL REFERENCES users(id),
  amount numeric(20,4) NOT NULL,
  currency_id bigint NOT NULL REFERENCES currencies(id),
  -- روزِ پرداخت در ماه — تا ۲۸ تا هر ماهی آن را داشته باشد.
  pay_day integer NOT NULL DEFAULT 1,
  -- حسابِ پیش‌فرضِ پرداخت؛ هنگامِ پرداخت عوض‌شدنی است.
  account_id bigint REFERENCES accounts(id) ON DELETE SET NULL,
  -- روزِ اولِ ماه.
  start_month date NOT NULL,
  end_month date,
  note text NOT NULL DEFAULT '',
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_salary_amount_ck CHECK (amount > 0),
  CONSTRAINT member_salary_day_ck CHECK (pay_day BETWEEN 1 AND 28),
  CONSTRAINT member_salary_month_ck CHECK (extract(day from start_month) = 1 AND (end_month IS NULL OR (extract(day from end_month) = 1 AND end_month >= start_month)))
);
CREATE INDEX IF NOT EXISTS member_salary_user_ix ON member_salaries (user_id, start_month);
-- هر عضو فقط یک دورهٔ باز.
CREATE UNIQUE INDEX IF NOT EXISTS member_salary_open_ux ON member_salaries (user_id) WHERE end_month IS NULL;

CREATE TABLE IF NOT EXISTS salary_payments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  salary_id bigint NOT NULL REFERENCES member_salaries(id),
  user_id bigint NOT NULL REFERENCES users(id),
  month date NOT NULL,
  -- حقوقِ پایهٔ همان ماه — عکسِ لحظهٔ پرداخت؛ تغییرِ بعدیِ مبلغ آن را عوض نمی‌کند.
  base_amount numeric(20,4) NOT NULL,
  bonus numeric(20,4) NOT NULL DEFAULT 0,
  deduction numeric(20,4) NOT NULL DEFAULT 0,
  -- قسطِ قرض که از همین حقوق کم شد (ردیفِ «کسر» در حسابِ اعضا).
  installment numeric(20,4) NOT NULL DEFAULT 0,
  net_amount numeric(20,4) NOT NULL,
  currency_id bigint NOT NULL REFERENCES currencies(id),
  paid_at date NOT NULL,
  -- پولِ واقعی؛ حذفِ ردیفِ دفتر پرداخت را هم برمی‌دارد.
  ledger_id bigint REFERENCES ledger(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_payment_month_ck CHECK (extract(day from month) = 1),
  CONSTRAINT salary_payment_net_ck CHECK (net_amount > 0)
);
-- هر ماه یک بار.
CREATE UNIQUE INDEX IF NOT EXISTS salary_payment_month_ux ON salary_payments (user_id, month);
CREATE INDEX IF NOT EXISTS salary_payment_ledger_ix ON salary_payments (ledger_id);
CREATE INDEX IF NOT EXISTS salary_payment_salary_ix ON salary_payments (salary_id);

-- قسطِ قرضی که از حقوق کم شد، با حذفِ پرداختِ همان ماه برمی‌گردد.
ALTER TABLE member_account_entries ADD COLUMN IF NOT EXISTS salary_payment_id bigint REFERENCES salary_payments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS member_account_salary_ix ON member_account_entries (salary_payment_id);
