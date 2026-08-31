-- نامِ کاربری — شناسهٔ دومِ ورود، کنارِ ایمیل.
--
-- ⚠️ اختیاری و nullable: کاربرانِ موجود نام کاربری ندارند و باید با همان
-- ایمیل واردِ سیستم شوند. اجبارِ آن یعنی ساختنِ نامِ خودکار برای همه —
-- که هم زشت است هم قابلِ حدس.
--
-- ⚠️ یکتاییِ حساس‌به‌حروف کافی نیست: «Ali» و «ali» باید یک حساب باشند،
-- وگرنه دو نفر می‌توانند نام‌های عملاً یکسان بردارند و ورود مبهم شود.
-- پس شاخصِ یکتا روی lower() ساخته می‌شود، نه روی خودِ ستون.
alter table users
  add column if not exists username text;

create unique index if not exists users_username_lower_ux
  on users (lower(username))
  where username is not null;

-- ایمیل هم همین مشکل را داشت: تا امروز هیچ قیدِ یکتایی نداشت و فقط کدِ
-- اپ آن را می‌پایید. یک درجِ مستقیم می‌توانست دو حساب با یک ایمیل بسازد.
create unique index if not exists users_email_lower_ux
  on users (lower(email));
