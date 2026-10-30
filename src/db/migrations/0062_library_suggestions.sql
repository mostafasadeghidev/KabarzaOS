-- ۲.۴۶.۰ — پیشنهادِ ویرایش در کتابخانهٔ کد: عضو تغییرش را روی کدِ همکار می‌فرستد،
-- نویسنده یا مدیر می‌بیند و می‌پذیرد یا رد می‌کند.

CREATE TABLE IF NOT EXISTS library_suggestions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entry_id bigint NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  author_id bigint REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  proposed jsonb NOT NULL,
  base_updated_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by bigint REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_suggestions_status_ck CHECK (status in ('pending','accepted','rejected','withdrawn'))
);
CREATE INDEX IF NOT EXISTS library_suggestions_entry_ix ON library_suggestions (entry_id, created_at);
-- هر نفر روی هر مورد یک پیشنهادِ باز دارد؛ فرستادنِ دوباره همان را تازه می‌کند.
CREATE UNIQUE INDEX IF NOT EXISTS library_suggestions_open_uq ON library_suggestions (entry_id, author_id) WHERE status = 'pending';
