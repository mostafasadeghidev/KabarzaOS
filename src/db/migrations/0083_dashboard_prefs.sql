-- ترجیحاتِ داشبورد (۳.۱۸.۰): چیدمانِ هر پنل (مدیر/عضو/کارفرما)، «یادداشتِ من» و «هدفِ ساعتِ هفته» روی خودِ
-- کاربر، نه مرورگر — تا روی هر دستگاهی یکی باشد. شکل: { layouts: { admin|member|client: … }, note, hoursGoal }.
-- ⚠️ پیش از این در localStorage بود؛ مرورگر بارِ اول آنچه دارد را خودش به اینجا می‌آورد (dash-prefs.tsx).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboard_prefs" jsonb NOT NULL DEFAULT '{}'::jsonb;
