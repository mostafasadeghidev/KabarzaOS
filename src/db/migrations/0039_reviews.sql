-- بازبینی‌های پروژه — ویدئوی لوم/یوتیوب/ویمئو، ویدئوی بارگذاری‌شده یا هر منبعِ
-- دیگری (واتس‌اپ، سند، جلسه) که نتیجه‌اش فهرستی از کارهای اصلاحی است.
--
-- ⚠️ مخاطب: نقش‌های `review_roles` (تهی = کلِ تیم). کارفرما فقط وقتی می‌بیند
-- که `client_visible` روشن باشد — پیش‌فرض **خاموش**، چون بیشترِ بازبینی‌ها
-- گفتگوی داخلیِ تیم است.
-- ⚠️ هر موردِ بازبینی یک **تسکِ معمولی** است (`tasks.review_id`) تا وضعیت،
-- مسئول، یادداشت و اعلانش همان مسیرِ همیشگی را برود. `client_hidden` آن را از
-- کارفرما پنهان می‌کند — هر جا که کارفرما تسک می‌بیند.
-- ⚠️ حذفِ بازبینی تسک‌هایش را پاک نمی‌کند (کارِ ثبت‌شده است)؛ فقط پیوندشان
-- می‌رود و پنهان‌بودن از کارفرما سرِ جایش می‌ماند.

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "project_id" bigint NOT NULL,
  "title" text NOT NULL,
  "source" text DEFAULT 'video' NOT NULL,
  "video_url" text,
  "notes" text DEFAULT '' NOT NULL,
  "client_visible" boolean DEFAULT false NOT NULL,
  "created_by" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_source_ck"
    CHECK ("source" in ('video','loom','youtube','vimeo','upload','whatsapp','document','meeting','other'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "reviews_project_ix" ON "reviews" ("project_id");

CREATE TABLE IF NOT EXISTS "review_roles" (
  "review_id" bigint NOT NULL,
  "role_tag_id" bigint NOT NULL,
  CONSTRAINT "review_roles_pk" PRIMARY KEY ("review_id", "role_tag_id")
);
DO $$ BEGIN
  ALTER TABLE "review_roles" ADD CONSTRAINT "review_roles_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "review_roles" ADD CONSTRAINT "review_roles_role_tag_id_tags_id_fk"
    FOREIGN KEY ("role_tag_id") REFERENCES "tags"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "review_id" bigint;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "review_start" integer;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "review_end" integer;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "area" text DEFAULT '' NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "client_hidden" boolean DEFAULT false NOT NULL;
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "tasks_review_ix" ON "tasks" ("review_id") WHERE "review_id" IS NOT NULL;

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "review_id" bigint;
DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "attachments_review_ix" ON "attachments" ("review_id") WHERE "review_id" IS NOT NULL;

-- سه وضعیتِ تازهٔ تسک که بازبینی‌ها لازم دارند. ⚠️ همان نگهبانِ slug ِ 0019:
-- نصبی که خودش وضعیتی با همین slug ساخته دست نمی‌خورد.
INSERT INTO tags (slug, type, name, color, grants_cap, status_group,
                  is_review, is_closed, is_protected, sort_order, name_i18n)
SELECT v.slug, v.type, v.name, v.color, v.grants_cap, v.status_group,
       v.is_review, v.is_closed, v.is_protected, v.sort_order, v.name_i18n
FROM (VALUES
  ('needs-design', 'task_status', 'نیاز به طراحی', '#c084fc', '', 'todo', false, false, false, 33, '{"fa": "نیاز به طراحی", "en": "Needs Design", "de": "Design nötig", "ckb": "پێویستی بە دیزاین", "ar": "يحتاج تصميمًا", "tr": "Tasarım gerekli", "fr": "Design requis", "es": "Necesita diseño", "pt": "Precisa de design"}'::jsonb),
  ('waiting-client', 'task_status', 'منتظرِ کارفرما', '#eab308', '', 'in_progress', false, false, false, 34, '{"fa": "منتظرِ کارفرما", "en": "Waiting on Client", "de": "Wartet auf Kunden", "ckb": "چاوەڕێی کڕیار", "ar": "بانتظار العميل", "tr": "Müşteri bekleniyor", "fr": "En attente du client", "es": "Esperando al cliente", "pt": "Aguardando cliente"}'::jsonb),
  ('wont-do', 'task_status', 'انجام نمی‌شود', '#78716c', '', 'complete', false, true, false, 35, '{"fa": "انجام نمی‌شود", "en": "Won''t Do", "de": "Wird nicht gemacht", "ckb": "ناکرێت", "ar": "لن يُنفَّذ", "tr": "Yapılmayacak", "fr": "Ne sera pas fait", "es": "No se hará", "pt": "Não será feito"}'::jsonb)
) AS v(slug, type, name, color, grants_cap, status_group,
       is_review, is_closed, is_protected, sort_order, name_i18n)
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.slug = v.slug);
