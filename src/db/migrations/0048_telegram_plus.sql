-- رباتِ تلگرام، دورِ دوم (۲.۱۴.۰).
--
-- ۱. «بی‌صدا در تلگرام» به‌ازای نوعِ اعلان — دکمهٔ «🔕 دیگر نفرست» زیرِ هر
--    یادآوری؛ فقط کانالِ تلگرام را می‌بندد، زنگولهٔ داخلِ برنامه می‌ماند.
--    نوعِ مجازیِ `brief` گزارشِ صبحگاهی است.
-- ۲. ساعتِ گزارشِ صبحگاهی (به وقتِ خودِ کاربر). خالی = خاموش.
-- ۳. گروهِ تلگرامِ هر پروژه — مدیر از برنامه وصلش می‌کند (توکنِ یک‌بارمصرف).

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_muted text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS brief_at text NOT NULL DEFAULT '08:30';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_group_id text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_group_token text;
