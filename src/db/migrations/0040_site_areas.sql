-- «بخشِ سایت» — نوعِ هفتمِ تگ (۱.۱۱۷.۰).
--
-- فهرستِ آمادهٔ بخش‌ها (هدر، فوتر، منو…) برای موردهای بازبینی؛ در «تنظیمات ←
-- تگ‌ها» اداره می‌شود. ⚠️ تسک فقط **متنِ** بخش را نگه می‌دارد، نه شناسهٔ تگ:
-- کاربر می‌تواند متنِ آزاد هم بنویسد، و حذف یا تغییرِ نامِ یک بخش در فهرست
-- تسک‌های قبلی را دست نمی‌زند.

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_ck;
ALTER TABLE tags ADD CONSTRAINT tags_type_ck CHECK (
  type in ('member_role','ledger_category','project_status','task_status','task_priority','service_category','site_area')
);

-- چند بخشِ رایج برای شروع — گارد روی اسلاگ، مثلِ ۰۰۱۹ و ۰۰۳۲.
INSERT INTO tags (slug, type, name, color, grants_cap, status_group,
                  is_review, is_closed, is_protected, sort_order, name_i18n)
SELECT v.slug, 'site_area', v.name, '', '', '', false, false, false, v.sort_order, v.name_i18n
FROM (VALUES
  ('site_area-header', 'هدر', 1, '{"fa": "هدر", "en": "Header", "de": "Header", "ckb": "سەرپەڕە", "ar": "الترويسة", "tr": "Üst bölüm", "fr": "En-tête", "es": "Cabecera", "pt": "Cabeçalho"}'::jsonb),
  ('site_area-menu', 'منو و ناوبری', 2, '{"fa": "منو و ناوبری", "en": "Menu & navigation", "de": "Menü & Navigation", "ckb": "مێنیو و ڕێنیشاندەر", "ar": "القائمة والتنقل", "tr": "Menü ve gezinme", "fr": "Menu et navigation", "es": "Menú y navegación", "pt": "Menu e navegação"}'::jsonb),
  ('site_area-hero', 'بخشِ اول (Hero)', 3, '{"fa": "بخشِ اول (Hero)", "en": "Hero", "de": "Hero", "ckb": "بەشی یەکەم (Hero)", "ar": "القسم الرئيسي (Hero)", "tr": "Hero", "fr": "Hero", "es": "Hero", "pt": "Hero"}'::jsonb),
  ('site_area-footer', 'فوتر', 4, '{"fa": "فوتر", "en": "Footer", "de": "Footer", "ckb": "ژێرپەڕە", "ar": "التذييل", "tr": "Alt bölüm", "fr": "Pied de page", "es": "Pie de página", "pt": "Rodapé"}'::jsonb),
  ('site_area-forms', 'فرم‌ها', 5, '{"fa": "فرم‌ها", "en": "Forms", "de": "Formulare", "ckb": "فۆرمەکان", "ar": "النماذج", "tr": "Formlar", "fr": "Formulaires", "es": "Formularios", "pt": "Formulários"}'::jsonb),
  ('site_area-mobile', 'نسخهٔ موبایل', 6, '{"fa": "نسخهٔ موبایل", "en": "Mobile version", "de": "Mobilversion", "ckb": "وەشانی مۆبایل", "ar": "نسخة الجوال", "tr": "Mobil sürüm", "fr": "Version mobile", "es": "Versión móvil", "pt": "Versão mobile"}'::jsonb),
  ('site_area-cms', 'CMS و محتوا', 7, '{"fa": "CMS و محتوا", "en": "CMS & content", "de": "CMS & Inhalte", "ckb": "CMS و ناوەڕۆک", "ar": "إدارة المحتوى", "tr": "CMS ve içerik", "fr": "CMS et contenu", "es": "CMS y contenido", "pt": "CMS e conteúdo"}'::jsonb),
  ('site_area-seo', 'سئو', 8, '{"fa": "سئو", "en": "SEO", "de": "SEO", "ckb": "SEO", "ar": "تحسين محركات البحث", "tr": "SEO", "fr": "SEO", "es": "SEO", "pt": "SEO"}'::jsonb)
) AS v(slug, name, sort_order, name_i18n)
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.slug = v.slug);
