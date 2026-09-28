-- دستهٔ سرویس‌ها از فهرستِ ثابتِ کد به تگ می‌رود — نوعِ ششمِ تگ.
--
-- ⚠️ چرا: نُه دسته (هوش مصنوعی، ویپ، ذخیره‌سازی، …) در کد و در قیدِ
-- `services_kind_ck` قفل بودند؛ افزودن یا حذفِ یک دسته یعنی مهاجرت و نسخهٔ
-- تازه. حالا مثلِ دستهٔ دفتر در «تنظیمات ← تگ‌ها» اداره می‌شود: نام، رنگ،
-- ترتیب و ترجمه — بی‌دست‌زدن به کد.
--
-- ⚠️ هیچ داده‌ای گم نمی‌شود: همان نُه دسته با ترجمه‌هایشان تگ می‌شوند و هر
-- سرویس به تگِ دستهٔ قبلی‌اش وصل می‌شود. ستونِ `kind` فقط وقتی برداشته
-- می‌شود که هیچ سرویسی بی‌دسته نمانده باشد؛ وگرنه کلِ مهاجرت برمی‌گردد
-- (مهاجرت‌ها در یک تراکنش اجرا می‌شوند).

-- ۱) نوعِ تازه در قیدِ تگ‌ها.
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_ck;
ALTER TABLE tags ADD CONSTRAINT tags_type_ck CHECK (
  type in ('member_role','ledger_category','project_status','task_status','task_priority','service_category')
);

-- ۲) همان نُه دسته، با اسلاگِ پایدار. گارد روی اسلاگ است، مثلِ ۰۰۱۹ و ۰۰۳۰:
-- اجرای دوباره چیزی اضافه نمی‌کند.
INSERT INTO tags (slug, type, name, color, grants_cap, status_group,
                  is_review, is_closed, is_protected, sort_order, name_i18n)
SELECT v.slug, 'service_category', v.name, v.color, '', '', false, false, false, v.sort_order, v.name_i18n
FROM (VALUES
  ('service_category-ai', 'هوش مصنوعی', '#8b5cf6', 1,
   '{"fa": "هوش مصنوعی", "en": "AI", "de": "KI", "ckb": "ژیریی دەستکرد", "ar": "الذكاء الاصطناعي", "tr": "Yapay zekâ", "fr": "IA", "es": "IA", "pt": "IA"}'::jsonb),
  ('service_category-voip', 'ویپ و تلفن', '#06b6d4', 2,
   '{"fa": "ویپ و تلفن", "en": "VoIP & phone", "de": "VoIP & Telefon", "ckb": "ڤۆیپ و تەلەفۆن", "ar": "الهاتف عبر الإنترنت", "tr": "VoIP ve telefon", "fr": "VoIP et téléphone", "es": "VoIP y teléfono", "pt": "VoIP e telefone"}'::jsonb),
  ('service_category-storage', 'ذخیره‌سازی', '#f59e0b', 3,
   '{"fa": "ذخیره‌سازی", "en": "Storage", "de": "Speicher", "ckb": "کۆگا", "ar": "التخزين", "tr": "Depolama", "fr": "Stockage", "es": "Almacenamiento", "pt": "Armazenamento"}'::jsonb),
  ('service_category-email', 'ایمیل', '#3b82f6', 4,
   '{"fa": "ایمیل", "en": "Email", "de": "E-Mail", "ckb": "ئیمەیڵ", "ar": "البريد الإلكتروني", "tr": "E-posta", "fr": "E-mail", "es": "Correo electrónico", "pt": "E-mail"}'::jsonb),
  ('service_category-design', 'طراحی', '#ec4899', 5,
   '{"fa": "طراحی", "en": "Design", "de": "Design", "ckb": "دیزاین", "ar": "التصميم", "tr": "Tasarım", "fr": "Design", "es": "Diseño", "pt": "Design"}'::jsonb),
  ('service_category-dev', 'توسعه و زیرساخت', '#64748b', 6,
   '{"fa": "توسعه و زیرساخت", "en": "Development & infrastructure", "de": "Entwicklung & Infrastruktur", "ckb": "گەشەپێدان و ژێرخان", "ar": "التطوير والبنية التحتية", "tr": "Geliştirme ve altyapı", "fr": "Développement et infrastructure", "es": "Desarrollo e infraestructura", "pt": "Desenvolvimento e infraestrutura"}'::jsonb),
  ('service_category-social', 'شبکه‌های اجتماعی', '#f97316', 7,
   '{"fa": "شبکه‌های اجتماعی", "en": "Social networks", "de": "Soziale Netzwerke", "ckb": "تۆڕە کۆمەڵایەتییەکان", "ar": "الشبكات الاجتماعية", "tr": "Sosyal ağlar", "fr": "Réseaux sociaux", "es": "Redes sociales", "pt": "Redes sociais"}'::jsonb),
  ('service_category-finance', 'مالی و پرداخت', '#16a34a', 8,
   '{"fa": "مالی و پرداخت", "en": "Finance & payments", "de": "Finanzen & Zahlungen", "ckb": "دارایی و پارەدان", "ar": "المالية والمدفوعات", "tr": "Finans ve ödeme", "fr": "Finance et paiements", "es": "Finanzas y pagos", "pt": "Finanças e pagamentos"}'::jsonb),
  ('service_category-other', 'سایر', '#a1a1aa', 9,
   '{"fa": "سایر", "en": "Other", "de": "Sonstiges", "ckb": "هیتر", "ar": "أخرى", "tr": "Diğer", "fr": "Autre", "es": "Otros", "pt": "Outros"}'::jsonb)
) AS v(slug, name, color, sort_order, name_i18n)
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.slug = v.slug);

-- ۳) ستونِ تازه. دسته اختیاری است: سرویسِ تازه می‌تواند بی‌دسته ثبت شود.
ALTER TABLE services ADD COLUMN IF NOT EXISTS category_tag_id bigint;

-- ⚠️ بی `on delete`، مثلِ `projects.status_tag_id`: تگِ در حالِ استفاده
-- حذف نمی‌شود (R-SET-04) و این کلید پشتوانهٔ همان قاعده در خودِ دیتابیس است.
DO $$ BEGIN
  ALTER TABLE services ADD CONSTRAINT services_category_tag_id_tags_id_fk
    FOREIGN KEY (category_tag_id) REFERENCES tags(id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS services_category_ix ON services (category_tag_id);

-- ۴) هر سرویس به تگِ دستهٔ قبلی‌اش.
UPDATE services s
   SET category_tag_id = t.id
  FROM tags t
 WHERE t.slug = 'service_category-' || s.kind
   AND t.type = 'service_category'
   AND s.category_tag_id IS NULL;

-- ۵) ⚠️ پیش از برداشتنِ ستونِ قدیمی: اگر حتی یک سرویس جا مانده، مهاجرت
-- می‌ایستد و همه‌چیز برمی‌گردد — دستهٔ هیچ سرویسی بی‌صدا پاک نمی‌شود.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM services WHERE category_tag_id IS NULL) THEN
    RAISE EXCEPTION 'service category backfill incomplete; services.kind kept';
  END IF;
END $$;

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_kind_ck;
ALTER TABLE services DROP COLUMN IF EXISTS kind;
