-- OAuth 2.1 برای اتصالِ نسخه‌های وب (claude.ai، ChatGPT و …) به MCP (۲.۸.۰).
--
-- اپِ هوشِ مصنوعی خودش را ثبت می‌کند (oauth_clients)، کاربر در صفحهٔ «اجازه»
-- تأیید می‌کند (کدِ یک‌بارمصرف در oauth_codes)، و اپ یک «اتصال» می‌گیرد
-- (oauth_grants) با توکنِ تمدید. توکنِ دسترسیِ کوتاه‌عمر همان ردیفِ api_keys
-- است با تاریخِ انقضا — پس همان مسیرِ احرازِ MCP و همان گاردها.
-- ⚠️ هیچ کد یا توکنی خام ذخیره نمی‌شود؛ فقط هشِ SHA-256.

CREATE TABLE IF NOT EXISTS oauth_clients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  client_id bigint NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_grants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  refresh_hash text NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_grants_user_ix ON oauth_grants (user_id);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS oauth_grant_id bigint REFERENCES oauth_grants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS api_keys_grant_ix ON api_keys (oauth_grant_id) WHERE oauth_grant_id IS NOT NULL;
