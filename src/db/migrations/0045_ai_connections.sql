-- «مغزِ» ربات تلگرام برای هر کاربر (۲.۹.۰).
--
-- هر کاربر ارائه‌دهندهٔ هوشِ مصنوعیِ خودش را وصل می‌کند (OpenRouter با ورود،
-- یا کلیدِ DeepSeek/OpenAI/Claude/Z.ai/…) و هزینه یا سهمیهٔ رایگانش مالِ
-- خودش است. ⚠️ کلید **رمزگذاری‌شده** (AES-256-GCM) ذخیره می‌شود و هرگز به
-- مرورگر برنمی‌گردد.

CREATE TABLE IF NOT EXISTS ai_connections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  base_url text NOT NULL,
  model text NOT NULL DEFAULT '',
  api_key_enc text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
