import { createHmac } from 'node:crypto';

/**
 * رازِ سرآیندِ وب‌هوکِ ربات — از رازِ نشست و توکنِ ربات؛ با عوض‌شدنِ توکن
 * عوض می‌شود. ⚠️ ماژولِ جدا و سبک: `instrumentation` هم لازمش دارد و نباید
 * کلِ سرویس‌ها را با خودش بکشد.
 */
export function webhookSecret(botToken: string): string {
  const secret = process.env.SESSION_SECRET || 'dev-only-secret-not-for-production-use';
  return createHmac('sha256', secret).update(`telegram-webhook|${botToken}`).digest('base64url');
}
