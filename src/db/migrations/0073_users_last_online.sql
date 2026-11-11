-- «آخرین حضور» (۲.۶۴.۰): برخلافِ last_seen_at با آفلاین شدن پاک نمی‌شود.
ALTER TABLE "users" ADD COLUMN "last_online_at" timestamp with time zone;
--> statement-breakpoint
-- شروعِ منصفانه: هر که همین حالا ضربانی دارد، همان زمان.
UPDATE "users" SET "last_online_at" = "last_seen_at" WHERE "last_seen_at" IS NOT NULL;
