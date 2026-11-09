-- رمزِ حساب روی هر دسترسی و لینک/راهنمای هر سرویس (۲.۵۸.۰).
-- `secret_enc` رمزگذاری‌شده با AES-256-GCM است؛ خالی یعنی رمزی ثبت نشده.
ALTER TABLE "services" ADD COLUMN "download_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "guide" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_grants" ADD COLUMN "secret_enc" text DEFAULT '' NOT NULL;
