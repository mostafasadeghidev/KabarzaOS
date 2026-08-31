-- ترجیحاتِ اعلانِ هر کاربر.
--
-- ⚠️ پیش‌فرضِ همه «روشن» است: ستون‌های خاموشی بولینِ `false` می‌گیرند و
-- فهرستِ بی‌صدا خالی است. کاربرِ تازه باید همه‌چیز را بگیرد، نه هیچ‌چیز.
alter table users
  add column notify_email text not null default '',
  add column notify_email_off boolean not null default false,
  add column notify_email_muted jsonb not null default '[]'::jsonb,
  add column telegram_off boolean not null default false;
