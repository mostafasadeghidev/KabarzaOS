-- ایمیلِ شرکتی (۲.۶۰.۰): سرویسِ وصل به سرورِ ایمیل و شناسهٔ حساب روی آن.
-- `provider` = 'stalwart' فقط برای یک سرویس (شاخصِ یکتای جزئی).
ALTER TABLE "services" ADD COLUMN "provider" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "services_provider_uq" ON "services" ("provider") WHERE "provider" <> '';
--> statement-breakpoint
-- `external_id` = شناسهٔ حساب در Stalwart. هر حساب فقط به یک دسترسیِ باز وصل است.
ALTER TABLE "service_grants" ADD COLUMN "external_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "service_grants_external_open_uq" ON "service_grants" ("service_id", "external_id") WHERE "revoked_at" IS NULL AND "external_id" <> '';
