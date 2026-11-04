-- ۲.۵۶.۰ — اعلانِ فوری (Web Push): هر دستگاهِ هر کاربر یک اشتراک.
-- endpoint نشانیِ یکتای دستگاه نزدِ سرویسِ اعلانِ مرورگر است؛ p256dh و auth کلیدهای رمزگذاریِ پیام‌اند.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint_ux ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscription_user_ix ON push_subscriptions (user_id);
