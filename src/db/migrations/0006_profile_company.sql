-- مشخصاتِ بانکیِ فرد، تنظیماتِ per-user، و مشخصاتِ صادرکنندهٔ فاکتور
-- (docs/rules/PROFILE.md)

-- ⚠️ اطلاعاتِ بانکی روی خودِ کاربر می‌نشیند، نه در جدولِ جدا: یک‌به‌یک است و
-- جدولِ جدا فقط یک join ِ همیشگی اضافه می‌کرد.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bank_account" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bank_iban" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bank_card" text DEFAULT '' NOT NULL;

-- منطقهٔ زمانیِ کاربر — ساعتِ نمایش بر مبنای ساعتِ دیواریِ خودش.
-- خالی یعنی «منطقهٔ زمانیِ سامانه».
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT '' NOT NULL;

-- شناسهٔ چتِ تلگرام + توکنِ یک‌بارمصرفِ اتصال.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_chat_id" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_link_token" text;

CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_token_ix"
  ON "users" ("telegram_link_token") WHERE "telegram_link_token" IS NOT NULL;

/**
 * مشخصاتِ شرکت (صادرکنندهٔ فاکتور).
 *
 * ⚠️ جدولِ **جدا** از تنظیماتِ عمومی، دقیقاً به همان دلیلی که نسخهٔ قبلی آپشنِ
 * جدا داشت: ذخیرهٔ تنظیماتِ عمومی کلِ رکورد را بازنویسی می‌کند و این
 * فیلدها را پاک می‌کرد.
 * تک‌ردیفی است؛ قیدِ `singleton` نمی‌گذارد ردیفِ دوم ساخته شود.
 */
CREATE TABLE IF NOT EXISTS "company" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "tax_id" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "website" text DEFAULT '' NOT NULL,
  "bank" text DEFAULT '' NOT NULL,
  "invoice_footer" text DEFAULT '' NOT NULL,
  "logo_file_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_singleton_ck" CHECK ("id" = 1)
);

DO $$ BEGIN
  ALTER TABLE "company" ADD CONSTRAINT "company_logo_file_id_fk"
    FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO "company" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
