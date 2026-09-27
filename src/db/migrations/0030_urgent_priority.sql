-- «فوری» به اولویت‌های تسک اضافه می‌شود، و برخوردِ ترتیبِ وضعیت‌ها رفع.
--
-- ⚠️ چرا «فوری»: فهرستِ پورت‌شده از افزونه سه پله داشت (بالا/متوسط/پایین) و
-- پلهٔ «همین حالا» نداشت. مالک خواست باشد. بالاتر از «بالا» می‌نشیند.
--
-- ⚠️ گارد روی اسلاگ است، نه نام: اجرای دوباره چیزی اضافه نمی‌کند و اگر کسی
-- نامش را عوض کرده باشد، بازنویسی نمی‌شود.
INSERT INTO tags (slug, type, name, color, grants_cap, status_group,
                  is_review, is_closed, is_protected, sort_order, name_i18n)
SELECT v.slug, v.type, v.name, v.color, '', '', false, false, false, v.sort_order, v.name_i18n
FROM (VALUES
  ('task_priority-urgent', 'task_priority', 'فوری', '#dc2626', 21,
   '{"fa": "فوری", "en": "Urgent", "de": "Dringend", "ckb": "بەپەلە", "ar": "عاجل", "tr": "Acil", "fr": "Urgent", "es": "Urgente", "pt": "Urgente"}'::jsonb)
) AS v(slug, type, name, color, sort_order, name_i18n)
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.slug = v.slug);

-- ⚠️ «در حال بررسی» و «تکمیل شده» هر دو ترتیبِ ۵ داشتند، پس ترتیبشان در
-- فهرست قطعی نبود. ریشه‌اش در مهاجرتِ ۰۰۱۹ است: آنجا ردیفِ قدیمیِ ۰۰۱۵ فقط
-- اسلاگ می‌گیرد و `sort_order` ِ خودش را نگه می‌دارد.
--
-- ⚠️ فقط وقتی اصلاح می‌شود که هنوز همان برخورد برقرار باشد؛ اگر مدیری
-- ترتیب را دستی چیده، دست نمی‌خورد.
UPDATE tags SET sort_order = 4
 WHERE slug = 'project_status-3'
   AND sort_order = 5
   AND EXISTS (
     SELECT 1 FROM tags o
      WHERE o.type = 'project_status' AND o.sort_order = 5 AND o.id <> tags.id
   );
