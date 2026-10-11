-- دستهٔ دفتر با «پیش‌فرض قابلِ بازپرداخت از کارفرما» (۲.۲۴.۰): وقتی این دسته روی
-- برداشتِ یک پروژه زده شود، تیکِ «قابل بازپرداخت از کارفرما» خودکار روشن می‌شود.
-- پیش‌فرضِ خودِ تیک خاموش است.

ALTER TABLE tags ADD COLUMN IF NOT EXISTS billable_default boolean NOT NULL DEFAULT false;
