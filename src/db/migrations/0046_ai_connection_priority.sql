-- چند هوشِ مصنوعی با اولویت برای هر کاربر (۲.۱۲.۰).
--
-- اگر اولی به سقف خورد، کلیدش کار نکرد یا جواب نداد، ربات همان درخواست را به
-- بعدی می‌دهد. اتصالِ فعلیِ هر کاربر اولویتِ صفر (اول) می‌گیرد؛ چیزی از دست
-- نمی‌رود.

ALTER TABLE ai_connections DROP CONSTRAINT IF EXISTS ai_connections_user_id_key;
--> statement-breakpoint
ALTER TABLE ai_connections ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_connections_user_ix ON ai_connections (user_id, priority);
