-- خبرِ ایمیلِ تازه (۲.۶۳.۰): تازه‌ترین زمانِ دریافتی که برایش خبر داده شده.
-- خالی = هنوز هیچ؛ بارِ اول فقط مقدار می‌گیرد تا ایمیل‌های قدیمی خبر نشوند.
ALTER TABLE "service_grants" ADD COLUMN "mail_notified_at" timestamp with time zone;
