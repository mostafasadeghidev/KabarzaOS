-- R-MSG-N4 — مهرِ آخرین ارسال، پایهٔ محدودیتِ ۳۰ ثانیه‌ایِ ضدِ اسپم.
ALTER TABLE "users" ADD COLUMN "last_message_sent_at" timestamp with time zone;
