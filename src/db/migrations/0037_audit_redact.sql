-- پاک‌کردنِ راز از لاگِ رویدادها.
--
-- ⚠️ «ویرایشِ فرد» و «حذفِ فرد» تا ۱.۱۱۲.۰ کلِ ردیفِ کاربر را در `before`
-- می‌نوشتند: هشِ رمز، رازِ ورودِ دومرحله‌ای، توکنِ بازنشانی و پیوندِ تلگرام و
-- اطلاعاتِ بانکی. لاگ را مدیرِ مالی هم می‌بیند و در فایلِ پشتیبان هم می‌رود.
-- از این نسخه پیش از نوشتن حذف می‌شوند؛ اینجا ردیف‌های قدیمی پاک می‌شوند.
--
-- فقط کلیدهای رازی برداشته می‌شوند؛ بقیهٔ تاریخچه دست نمی‌خورد. همان فهرستِ
-- `SENSITIVE_KEYS` در `src/domain/activity/details.ts`.

UPDATE audit_log
SET before = before - ARRAY[
  'password', 'passwordHash', 'resetTokenHash', 'resetExpiresAt', 'twoFactorSecret',
  'telegramLinkToken', 'telegramChatId', 'bankAccount', 'bankCard', 'bankIban',
  'token', 'tokenHash', 'secret', 'keyHash'
]
WHERE jsonb_typeof(before) = 'object'
  AND before ?| ARRAY[
    'password', 'passwordHash', 'resetTokenHash', 'resetExpiresAt', 'twoFactorSecret',
    'telegramLinkToken', 'telegramChatId', 'bankAccount', 'bankCard', 'bankIban',
    'token', 'tokenHash', 'secret', 'keyHash'
  ];

UPDATE audit_log
SET after = after - ARRAY[
  'password', 'passwordHash', 'resetTokenHash', 'resetExpiresAt', 'twoFactorSecret',
  'telegramLinkToken', 'telegramChatId', 'bankAccount', 'bankCard', 'bankIban',
  'token', 'tokenHash', 'secret', 'keyHash'
]
WHERE jsonb_typeof(after) = 'object'
  AND after ?| ARRAY[
    'password', 'passwordHash', 'resetTokenHash', 'resetExpiresAt', 'twoFactorSecret',
    'telegramLinkToken', 'telegramChatId', 'bankAccount', 'bankCard', 'bankIban',
    'token', 'tokenHash', 'secret', 'keyHash'
  ];
