-- ۲.۴۷.۰ — کتابخانهٔ کد، نسخهٔ دوم: گام‌های غنی (متن + تصویر + کد + گزینه)،
-- کارتِ کاملِ گزینه، دسته، نسخه‌ها، پیش‌نیازِ کتابخانه‌ای، ویدیوی آموزشی و تصویرِ شاخص.

ALTER TABLE library_entries
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS version_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cloneable_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instances text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS change_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cover_attachment_id bigint REFERENCES attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_id bigint REFERENCES library_entries(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE library_entries ADD CONSTRAINT library_entries_category_ck
    CHECK (category in ('','slider','menu','animation','form','cms','layout','media','integration','seo','utility','checklist','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS library_entries_superseded_ix ON library_entries (superseded_by_id);

-- گام‌ها: هر گام یک ردیف، با تکه‌کد (جایگاه)، گزینه (نام) و تصویر (id ِ پیوست) ِ خودش.
CREATE TABLE IF NOT EXISTS library_steps (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  block_indexes integer[] NOT NULL DEFAULT '{}'::integer[],
  option_names text[] NOT NULL DEFAULT '{}'::text[],
  media_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS library_steps_entry_ix ON library_steps (entry_id);

-- ⚠️ گام‌های قبلی (هر خط یک گام) پیش از برداشتنِ ستون به ردیف تبدیل می‌شوند.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_entries' AND column_name = 'steps') THEN
    INSERT INTO library_steps (entry_id, title, sort_order)
      SELECT e.id, btrim(regexp_replace(t.line, '^\s*(?:[-*•]|\d+[.)])\s+', '')), (t.ord - 1)::int
      FROM library_entries e
      CROSS JOIN LATERAL unnest(regexp_split_to_array(e.steps, E'\\r?\\n')) WITH ORDINALITY AS t(line, ord)
      WHERE btrim(t.line) <> '';
    ALTER TABLE library_entries DROP COLUMN steps;
  END IF;
END $$;

-- گزینه: کارتِ کامل.
ALTER TABLE library_options
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'setting',
  ADD COLUMN IF NOT EXISTS value text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS element text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS allowed_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS important text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS example text NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE library_options ADD CONSTRAINT library_options_role_ck CHECK (role in ('required','element','setting'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- «چطور با هم».
ALTER TABLE library_relations ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';

-- پیش‌نیازِ کتابخانه‌ای.
CREATE TABLE IF NOT EXISTS library_requires (
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  requires_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, requires_id),
  CONSTRAINT library_requires_self_ck CHECK (entry_id <> requires_id)
);
CREATE INDEX IF NOT EXISTS library_requires_requires_ix ON library_requires (requires_id);
