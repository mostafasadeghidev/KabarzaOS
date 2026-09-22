-- دفترِ دسترسی‌های بیرونی — «چه کسی به چه سامانه‌ای دسترسی دارد».
--
-- ⚠️ هیچ اعتبارنامه‌ای اینجا نمی‌نشیند: نه رمز، نه توکن، نه کلید. فقط
-- «چه کسی، کجا، با چه سطحی، از کی». راز در password manager می‌ماند و
-- `vault_ref` صرفاً نامِ آن آیتم است تا بشود پیدایش کرد.

CREATE TABLE IF NOT EXISTS "services" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'other' NOT NULL,
  -- مسئولِ اعطا و قطع — کسی که پنلِ مدیریتِ سرویس دستِ اوست.
  "owner_user_id" bigint,
  "admin_url" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  -- مثلِ دفتر: حذف نمی‌شود، غیرفعال می‌شود تا گرنت‌های تاریخی نشکنند.
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "services_kind_ck" CHECK ("kind" in ('ai','voip','storage','email','design','dev','social','finance','other'))
);

DO $$ BEGIN
  ALTER TABLE "services" ADD CONSTRAINT "services_owner_user_id_users_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "services_name_lower_ix" ON "services" (lower("name"));

CREATE TABLE IF NOT EXISTS "service_grants" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  "service_id" bigint NOT NULL,
  "user_id" bigint NOT NULL,
  -- شناسهٔ حساب در آن سرویس — ایمیل، نامِ کاربری یا شمارهٔ داخلی. هرگز رمز.
  "account_ref" text DEFAULT '' NOT NULL,
  "level" text DEFAULT 'member' NOT NULL,
  -- نامِ آیتم در password manager؛ فقط یک اشاره، نه خودِ راز.
  "vault_ref" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "granted_by" bigint,
  "revoked_at" timestamp with time zone,
  "revoked_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_grants_level_ck" CHECK ("level" in ('admin','member','viewer'))
);

DO $$ BEGIN
  ALTER TABLE "service_grants" ADD CONSTRAINT "service_grants_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "service_grants" ADD CONSTRAINT "service_grants_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "service_grants" ADD CONSTRAINT "service_grants_granted_by_users_id_fk"
    FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "service_grants" ADD CONSTRAINT "service_grants_revoked_by_users_id_fk"
    FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ یکتایی فقط روی گرنتِ **باز**: کسی که رفت و برگشت باید بتواند دوباره
-- دسترسی بگیرد، ولی همزمان دو ردیفِ بازِ یک سرویس نداشته باشد.
CREATE UNIQUE INDEX IF NOT EXISTS "service_grants_open_uq"
  ON "service_grants" ("service_id","user_id") WHERE "revoked_at" is null;

CREATE INDEX IF NOT EXISTS "service_grants_user_ix" ON "service_grants" ("user_id");
CREATE INDEX IF NOT EXISTS "service_grants_service_ix" ON "service_grants" ("service_id");
