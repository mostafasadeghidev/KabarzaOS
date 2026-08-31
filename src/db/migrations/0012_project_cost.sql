-- جهتِ چهارمِ پرداختِ پروژه: هزینهٔ **جذب‌شده**.
--
-- ⚠️ `project_expense` هزینه‌ای است که به کارفرما صورتحساب می‌شود و به بدهیِ
-- او اضافه می‌گردد؛ `project_cost` هزینه‌ای است که خودِ شرکت جذب می‌کند و
-- **نباید** در «مبلغِ» پروژه بیاید. بدونِ این جهت، تیکِ «قابلِ صورتحساب» در
-- فرمِ دفتر هیچ اثری نداشت و هر هزینه‌ای به گردنِ کارفرما می‌افتاد.
alter table project_payments
  drop constraint if exists project_payments_direction_ck;

alter table project_payments
  add constraint project_payments_direction_ck
  check (direction in ('incoming', 'member_payout', 'project_expense', 'project_cost'));
