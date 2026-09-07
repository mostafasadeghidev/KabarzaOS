-- توضیحِ آیتمِ چک‌لیست روی ردیفِ پروژه می‌نشیند.
--
-- ⚠️ چرا: آیتمِ کتابخانهٔ QA عنوان **و توضیح** دارد. مسیرِ تسک‌ساز توضیح را
-- کپی می‌کرد (`tasks.description`) ولی ردیفِ چک‌لیست نه — ستونش اصلاً نبود.
-- نتیجه: تبِ QA فقط عنوان را نشان می‌داد و «چه‌طور تستش کنم» گم می‌شد.
--
-- ⚠️ کپی، نه اتصال به کتابخانه: عنوان هم عمداً عکسِ لحظه‌ای است تا ویرایشِ
-- بعدیِ کتابخانه تاریخچهٔ پروژه‌های قبلی را بازنویسی نکند. توضیح هم همان
-- قاعده را می‌گیرد.
ALTER TABLE project_qa ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- ردیف‌های موجود از کتابخانه پر می‌شوند — تا امروز جایی ذخیره نشده بودند.
UPDATE project_qa pq
SET description = qi.description
FROM qa_items qi
WHERE qi.id = pq.qa_item_id
  AND pq.description = ''
  AND qi.description <> '';
