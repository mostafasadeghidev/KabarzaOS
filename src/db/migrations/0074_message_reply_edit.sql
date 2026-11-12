-- پاسخ به یک پیام و ویرایشِ پیام (۲.۶۵.۰).
-- reply_to_id: پیامی که به آن پاسخ داده شده؛ با حذفِ آن پیام خالی می‌شود.
ALTER TABLE "messages" ADD COLUMN "reply_to_id" bigint REFERENCES "messages"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "edited_at" timestamp with time zone;
