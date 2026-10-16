/**
 * تنظیماتِ ایمیلِ خروجی (SMTP) از پنل (۲.۳۲.۰).
 *
 * ⚠️ مثلِ اعتبارِ باتِ تلگرام و کلیدِ کپچا جدا از `SystemConfig` ِ بی‌مجوز
 * نگه داشته می‌شود؛ رمزِ SMTP رازِ مشترک است.
 *
 * ⚠️ متغیرهای محیط برنده‌اند — و **همه با هم**: اگر `SMTP_HOST` در محیط هست،
 * هیچ مقداری از پنل خوانده نمی‌شود. نیمی از محیط و نیمی از پنل یعنی میزبانِ
 * یکی و رمزِ دیگری، و ایمیلی که بی‌صدا نمی‌رود.
 */

export interface SmtpStored {
  host: string;
  port: number;
  user: string;
  /** رمز، رمزگذاری‌شده (`secret-box`) — هرگز متنِ خام. */
  passwordSealed: string;
  /** نشانیِ فرستنده؛ خالی ← همان نامِ کاربری. */
  from: string;
}

export const EMPTY_SMTP: SmtpStored = { host: '', port: 587, user: '', passwordSealed: '', from: '' };

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** نامِ میزبان یا IP — بی‌فاصله، بی‌پروتکل. */
export function isValidSmtpHost(value: string): boolean {
  return /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(value.trim());
}

export function normalizePort(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 587;
}

/** «نام <ایمیل>» یا فقط ایمیل؛ چیزِ دیگر ← خالی (یعنی همان نامِ کاربری). */
export function normalizeFrom(value: unknown): string {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  const email = text.match(/<([^<>\s]+@[^<>\s]+)>$/)?.[1] ?? text;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? text : '';
}

export function normalizeSmtp(input: Partial<Record<keyof SmtpStored, unknown>>): SmtpStored {
  const host = String(input.host ?? '').trim();
  return {
    host: isValidSmtpHost(host) ? host : '',
    port: normalizePort(input.port),
    user: String(input.user ?? '').trim(),
    passwordSealed: String(input.passwordSealed ?? ''),
    from: normalizeFrom(input.from),
  };
}

export interface SmtpEnv {
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  from?: string;
}

/** محیط اول (همه با هم)؛ بعد مقدارِ پنل؛ هیچ‌کدام ← null (ایمیل خاموش). */
export function resolveSmtp(env: SmtpEnv, stored: SmtpStored, password: string | null): SmtpConfig | null {
  const envHost = (env.host ?? '').trim();
  if (envHost) {
    const user = (env.user ?? '').trim();
    return {
      host: envHost,
      port: normalizePort(env.port ?? 587),
      user,
      pass: env.password ?? '',
      from: (env.from ?? '').trim() || user || 'kabarza@localhost',
    };
  }
  if (!stored.host) return null;
  return {
    host: stored.host,
    port: stored.port,
    user: stored.user,
    pass: password ?? '',
    from: stored.from || stored.user || 'kabarza@localhost',
  };
}

/** اثرِ انگشتِ پیکربندی — ترابرِ کش‌شده با تغییرِ تنظیمات دوباره ساخته می‌شود. */
export function smtpFingerprint(config: SmtpConfig | null): string {
  return config ? [config.host, config.port, config.user, config.pass, config.from].join('\u0000') : '';
}
