/**
 * کپچای کلودفلر (Turnstile) روی فرم‌های عمومی — ورود و «رمزم را فراموش کرده‌ام» (۲.۳۱.۰).
 *
 * ⚠️ مثلِ اعتبارِ باتِ تلگرام جدا از `SystemConfig` ِ بی‌مجوز نگه داشته می‌شود:
 * کلیدِ محرمانه رازِ مشترک است و هرگز نباید در مسیرِ خواندنِ عمومی باشد.
 *
 * ⚠️ قفل‌شدنِ مالک بیرونِ سامانه بدترین حالت است، پس سه محافظ:
 *  ۱. روشن‌کردن فقط پس از یک آزمونِ موفقِ همان کلیدها (`verifiedFor`)؛ عوض‌کردنِ
 *     هر کلید آزمون را باطل و کپچا را خاموش می‌کند.
 *  ۲. `TURNSTILE_DISABLED=1` در محیط، بی‌اعتنا به تنظیمات، خاموشش می‌کند.
 *  ۳. کلیدهای محیط (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`) بر مقدارِ
 *     ذخیره‌شده مقدم‌اند؛ آن‌وقت فرمِ تنظیمات فقط‌خواندنی است.
 */

export interface TurnstileStored {
  siteKey: string;
  /** کلیدِ محرمانه، رمزگذاری‌شده (`secret-box`) — هرگز متنِ خام. */
  secretSealed: string;
  enabled: boolean;
  /** اثرِ انگشتِ کلیدهایی که آزمونشان موفق شد؛ با کلیدِ دیگر معتبر نیست. */
  verifiedFor: string;
}

export const EMPTY_TURNSTILE: TurnstileStored = { siteKey: '', secretSealed: '', enabled: false, verifiedFor: '' };

/** کلیدهای Turnstile مثلِ `0x4AAAAAAA…` اند؛ کلیدهای آزمونیِ کلودفلر `1x000…`. */
export function isValidTurnstileKey(value: string): boolean {
  return /^[0-9]x[0-9A-Za-z_-]{10,}$/.test(value.trim());
}

export function normalizeTurnstile(input: Partial<Record<keyof TurnstileStored, unknown>>): TurnstileStored {
  const siteKey = String(input.siteKey ?? '').trim();
  return {
    siteKey: isValidTurnstileKey(siteKey) ? siteKey : '',
    secretSealed: String(input.secretSealed ?? ''),
    enabled: input.enabled === true,
    verifiedFor: String(input.verifiedFor ?? ''),
  };
}

export interface TurnstileEnv {
  siteKey?: string;
  secret?: string;
  disabled?: string;
}

export interface TurnstileActive {
  siteKey: string;
  secret: string;
}

/**
 * کپچا الان روشن است؟ و با کدام کلیدها.
 * محیط اول؛ بعد مقدارِ ذخیره‌شده — فقط اگر روشن **و** آزموده‌شده برای همین کلیدها.
 */
export function resolveTurnstile(
  env: TurnstileEnv,
  stored: TurnstileStored,
  secret: string | null,
  fingerprint: (siteKey: string, secret: string) => string,
): TurnstileActive | null {
  if (['1', 'true', 'yes'].includes((env.disabled ?? '').trim().toLowerCase())) return null;
  const envSite = (env.siteKey ?? '').trim();
  const envSecret = (env.secret ?? '').trim();
  if (envSite && envSecret) return { siteKey: envSite, secret: envSecret };
  if (!stored.enabled || !stored.siteKey || !secret) return null;
  if (stored.verifiedFor !== fingerprint(stored.siteKey, secret)) return null;
  return { siteKey: stored.siteKey, secret };
}

/** پاسخِ `siteverify` ِ کلودفلر. */
export interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

export function siteverifyOk(response: SiteverifyResponse | null): boolean {
  return response?.success === true;
}

/** نامِ فیلدی که ویجتِ کلودفلر در فرم می‌گذارد. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';
