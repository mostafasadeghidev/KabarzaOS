-- ترجمهٔ وضعیت، به‌ازای خودِ تگ و نه به‌ازای گروهش.
--
-- ⚠️ ۰۰۱۶ ترجمه‌ها را با تطبیقِ `status_group` می‌نوشت، اما گروه یک **سطل**
-- است نه یک نام: `in_progress` هم «در حال انجام» را دارد هم «در حال بررسی».
-- هر دو «In progress» گرفتند، پس منوی وضعیت در هر زبانی جز زبانِ مبدأ یک
-- گزینه را دو بار نشان می‌داد — کاربر می‌دید «تکراری است».
--
-- ⚠️ ۰۱۹ نمی‌توانست جبرانش کند: هر اسلاگی که از قبل باشد را رد می‌کند، و
-- خودِ ۰۱۹ چند خط بالاتر همین ردیف‌ها را اسلاگ‌دار کرده بود.
--
-- فقط ردیفی دست می‌خورد که هنوز دقیقاً بلوکِ ۰۰۱۶ را دارد — با انگلیسیِ
-- همان بلوک به‌علاوهٔ نبودِ کلیدِ فارسی، که ۰۰۱۶ هرگز نمی‌نوشت و فهرستِ
-- پایهٔ ۰۱۹ همیشه می‌نویسد. تگی که مدیر ترجمه‌اش کرده باشد اینجا نمی‌افتد.
--
-- ⚠️ `fa` از خودِ `name` ِ ردیف برداشته می‌شود، نه از فهرستِ پایه: این سه
-- ردیف را ۰۱۵ دستی نام گذاشته («متوقف»، نه «نگه‌داشته‌شده») و نوشتنِ نامِ
-- فهرست، آنها را برای خوانندهٔ فارسی تغییرِ نام می‌داد در حالی که فهرستِ
-- تنظیمات هنوز نامِ قدیم را نشان می‌دهد — یک تگ با دو نام.

UPDATE tags
   SET name_i18n = '{"en": "In review", "de": "In Prüfung", "ckb": "لە پێداچوونەوەدایە", "ar": "قيد المراجعة", "tr": "İnceleniyor", "fr": "En révision", "es": "En revisión", "pt": "Em revisão"}'::jsonb
                   || jsonb_build_object('fa', name)
 WHERE slug = 'project_status-3'
   AND name_i18n->>'fa' IS NULL
   AND name_i18n->>'en' = 'In progress';

UPDATE tags
   SET name_i18n = '{"en": "On hold", "de": "Pausiert", "ckb": "راگیراوە", "ar": "معلّق", "tr": "Beklemede", "fr": "En attente", "es": "En espera", "pt": "Em espera"}'::jsonb
                   || jsonb_build_object('fa', name)
 WHERE slug = 'project_status-5'
   AND name_i18n->>'fa' IS NULL
   AND name_i18n->>'en' = 'On hold';

UPDATE tags
   SET name_i18n = '{"en": "Cancelled", "de": "Storniert", "ckb": "هەڵوەشاوە", "ar": "ملغى", "tr": "İptal edildi", "fr": "Annulé", "es": "Cancelado", "pt": "Cancelado"}'::jsonb
                   || jsonb_build_object('fa', name)
 WHERE slug = 'project_status-6'
   AND name_i18n->>'fa' IS NULL
   AND name_i18n->>'en' = 'Cancelled';
