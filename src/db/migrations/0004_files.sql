-- لایهٔ فایل — جدولِ مرکزیِ فایل‌ها + ارجاع‌ها (docs/rules/FILES.md)

CREATE TABLE IF NOT EXISTS "files" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  -- کلیدِ شیء در S3؛ یکتا تا دو ردیف هرگز یک شیء را نشان ندهند و
  -- حذفِ یکی، دیگری را از کار نیندازد.
  "storage_key" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "original_name" text DEFAULT '' NOT NULL,
  "purpose" text NOT NULL,
  "uploaded_by" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
  CONSTRAINT "files_purpose_ck" CHECK ("purpose" in ('avatar','receipt','attachment')),
  CONSTRAINT "files_size_ck" CHECK ("size" > 0)
);

DO $$ BEGIN
  ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "files_purpose_ix" ON "files" ("purpose");

-- آواتارِ کاربر: یک تصویر برای هر نفر.
CREATE TABLE IF NOT EXISTS "user_avatars" (
  "user_id" bigint PRIMARY KEY NOT NULL,
  "file_id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_file_id_fk"
    FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- پیوستِ پروژه به جدولِ مرکزی وصل می‌شود؛ ستونِ کلیدِ خامِ قبلی کنار می‌رود.
ALTER TABLE "attachments" DROP COLUMN IF EXISTS "storage_key";
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "file_id" bigint;

DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_fk"
    FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ردیف‌هایی که به ستونِ حذف‌شدهٔ storage_key اشاره می‌کردند حالا به هیچ اشاره
-- می‌کنند؛ پیش از افزودنِ قید پاک می‌شوند. (هیچ فایلی هرگز آپلود نشده بود —
-- لایهٔ فایل تا این مهاجرت وجود نداشت.)
DELETE FROM "attachments" WHERE "external_url" IS NULL AND "file_id" IS NULL;

-- ⚠️ پیوست یا فایل است یا لینکِ بیرونی — هرگز هیچ‌کدام و هرگز هر دو.
-- بدونِ این قید، ردیفِ بی‌محتوا در فهرست ظاهر می‌شود و کلیک‌کردنش خطا می‌دهد.
DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_target_ck"
    CHECK (("file_id" IS NOT NULL) <> ("external_url" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- تصویرِ شاخصِ پروژه.
ALTER TABLE "projects" DROP COLUMN IF EXISTS "thumbnail_key";
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "thumbnail_file_id" bigint;

DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_thumbnail_file_id_fk"
    FOREIGN KEY ("thumbnail_file_id") REFERENCES "files"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
