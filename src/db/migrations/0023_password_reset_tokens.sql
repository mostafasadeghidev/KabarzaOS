-- توکنِ تعیین/بازنشانیِ رمز — پورتِ لینکِ تعیینِ رمزِ دعوت‌نامه (۳ روز) و
-- «رمزم را فراموش کرده‌ام». فقط هشِ توکن ذخیره می‌شود؛ `invite_pending` می‌گوید
-- این توکن دعوت است (پنجرهٔ سه‌روزه) و با تعیینِ رمز مصرف می‌شود.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_pending boolean NOT NULL DEFAULT false;
