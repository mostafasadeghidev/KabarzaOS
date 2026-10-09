-- مشخصاتِ بانکیِ حساب (۲.۱۸.۰): نامِ بانک، صاحبِ حساب، شمارهٔ حساب،
-- شمارهٔ بین‌المللی (IBAN/شبا) و شمارهٔ کارت. همه اختیاری؛ خالی = ثبت نشده.
-- ⚠️ یکدست ذخیره می‌شوند (بی‌فاصله، ارقامِ لاتین) و نمایش گروه‌بندی می‌کند.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS holder_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS iban text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_number text NOT NULL DEFAULT '';
