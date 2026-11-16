-- ۳.۴.۰ — فضای ابری (Nextcloud): هر اتصال یک سرورِ Nextcloud است و یک سرویس در دفترِ دسترسی‌ها.
-- رمزِ برنامه (app password) رمزگذاری‌شده است (server/ai/secret-box) و هرگز به مرورگر نمی‌رسد.
-- service_id بی cascade: پاک شدنِ سرویس نباید اتصال و تاریخچهٔ دسترسی‌ها را بی‌صدا ببرد.
CREATE TABLE IF NOT EXISTS cloud_connections (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  base_url text NOT NULL,
  username text NOT NULL,
  secret_enc text NOT NULL DEFAULT '',
  group_id text NOT NULL,
  default_quota_gb integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  service_id bigint NOT NULL REFERENCES services(id),
  status jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_connections_service_uq ON cloud_connections (service_id);
