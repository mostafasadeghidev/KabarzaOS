-- به‌روزرسانیِ لحظه‌ای (۳.۱۴.۰): دیتابیس خودش خبر می‌دهد که چیزی عوض شد، تا برنامه همان لحظه به
-- مرورگرها برساند (به‌جای اینکه مرورگر هر چند ثانیه بپرسد). در خودِ دیتابیس است، پس همهٔ راه‌ها —
-- برنامه، ربات تلگرام، اتصالِ هوش مصنوعی، زمان‌بند — را می‌گیرد.
-- ⚠️ خبر فقط «چه چیزی برای چه کسی/کدام گفتگو» است، نه متن: مرورگر داده را از همان مسیرهای
-- همیشگی (با همان گاردها) می‌گیرد. پیامِ تکراری در یک تراکنش را خودِ Postgres یکی می‌کند.
CREATE OR REPLACE FUNCTION kz_live_notify() RETURNS trigger AS $$
DECLARE
  payload text;
BEGIN
  IF TG_TABLE_NAME = 'notifications' THEN
    payload := json_build_object('k', 'n', 'u', COALESCE(NEW.user_id, OLD.user_id))::text;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    payload := json_build_object('k', 'm', 't', COALESCE(NEW.thread_id, OLD.thread_id))::text;
  ELSIF TG_TABLE_NAME = 'thread_users' THEN
    payload := json_build_object('k', 'r', 'u', NEW.user_id)::text;
  END IF;
  IF payload IS NOT NULL THEN
    PERFORM pg_notify('kz_live', payload);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS kz_live_notifications ON notifications;
--> statement-breakpoint
-- ⚠️ بی DELETE: پاک‌سازیِ روزانه هزاران اعلانِ کهنه را پاک می‌کند و خبرش به هیچ‌کس کمکی نمی‌کند.
CREATE TRIGGER kz_live_notifications AFTER INSERT OR UPDATE OF is_read ON notifications
  FOR EACH ROW EXECUTE FUNCTION kz_live_notify();
--> statement-breakpoint
DROP TRIGGER IF EXISTS kz_live_messages ON messages;
--> statement-breakpoint
CREATE TRIGGER kz_live_messages AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION kz_live_notify();
--> statement-breakpoint
DROP TRIGGER IF EXISTS kz_live_reads ON thread_users;
--> statement-breakpoint
CREATE TRIGGER kz_live_reads AFTER UPDATE OF last_read_message_id ON thread_users
  FOR EACH ROW EXECUTE FUNCTION kz_live_notify();
