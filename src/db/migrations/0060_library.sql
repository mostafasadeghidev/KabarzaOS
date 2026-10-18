-- ۲.۳۷.۰ — کتابخانهٔ کد و راهنما: کدِ اختصاصیِ پروژه‌ها، راهنمای کارفرما و یادداشتِ آموزشیِ تیم.

CREATE TABLE IF NOT EXISTS library_entries (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  kind text NOT NULL DEFAULT 'code',
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT 'webflow',
  status text NOT NULL DEFAULT 'ready',
  topics text[] NOT NULL DEFAULT '{}'::text[],
  body text NOT NULL DEFAULT '',
  steps text NOT NULL DEFAULT '',
  warnings text NOT NULL DEFAULT '',
  dependencies text NOT NULL DEFAULT '',
  demo_url text NOT NULL DEFAULT '',
  client_visible boolean NOT NULL DEFAULT false,
  origin_project_id bigint REFERENCES projects(id) ON DELETE SET NULL,
  forked_from_id bigint REFERENCES library_entries(id) ON DELETE SET NULL,
  author_id bigint REFERENCES users(id) ON DELETE SET NULL,
  updated_by bigint REFERENCES users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_entries_kind_ck CHECK (kind in ('code','guide','note')),
  CONSTRAINT library_entries_platform_ck CHECK (platform in ('webflow','wordpress','shopify','html','other')),
  CONSTRAINT library_entries_status_ck CHECK (status in ('draft','ready','deprecated'))
);
CREATE INDEX IF NOT EXISTS library_entries_kind_ix ON library_entries (kind);
CREATE INDEX IF NOT EXISTS library_entries_origin_ix ON library_entries (origin_project_id);
CREATE INDEX IF NOT EXISTS library_entries_author_ix ON library_entries (author_id);

CREATE TABLE IF NOT EXISTS library_blocks (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'js',
  placement text NOT NULL DEFAULT 'site_body_end',
  placement_note text NOT NULL DEFAULT '',
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT library_blocks_language_ck CHECK (language in ('html','css','js','json','php','liquid','text')),
  CONSTRAINT library_blocks_placement_ck CHECK (placement in ('site_head','site_body_end','page_head','page_body_end','embed','external','other'))
);
CREATE INDEX IF NOT EXISTS library_blocks_entry_ix ON library_blocks (entry_id);

CREATE TABLE IF NOT EXISTS library_options (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'attribute',
  description text NOT NULL DEFAULT '',
  default_value text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT library_options_kind_ck CHECK (kind in ('attribute','class','id','variable','setting'))
);
CREATE INDEX IF NOT EXISTS library_options_entry_ix ON library_options (entry_id);

CREATE TABLE IF NOT EXISTS library_projects (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  values_note text NOT NULL DEFAULT '',
  installed_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS library_projects_uq ON library_projects (entry_id, project_id);
CREATE INDEX IF NOT EXISTS library_projects_project_ix ON library_projects (project_id);

CREATE TABLE IF NOT EXISTS library_relations (
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  related_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, related_id),
  CONSTRAINT library_relations_order_ck CHECK (entry_id < related_id)
);
CREATE INDEX IF NOT EXISTS library_relations_related_ix ON library_relations (related_id);

CREATE TABLE IF NOT EXISTS library_revisions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  author_id bigint REFERENCES users(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_revisions_entry_ix ON library_revisions (entry_id, created_at);

-- تصویرهای هر مورد در همان جدولِ مرکزیِ پیوست‌ها، با گاردِ کتابخانه.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS library_entry_id bigint REFERENCES library_entries(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS attachments_library_entry_ix ON attachments (library_entry_id) WHERE library_entry_id IS NOT NULL;
