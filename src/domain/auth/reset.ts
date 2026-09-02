import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * توکنِ تعیین/بازنشانیِ رمز — پورتِ لینکِ تعیینِ رمزِ دعوت‌نامه و
 * «رمزم را فراموش کرده‌ام» ِ نسخهٔ قبلی (`get_password_reset_key` +
 * `password_reset_expiration`).
 *
 * ⚠️ فقط **هشِ** توکن ذخیره می‌شود؛ خودِ توکن یک بار در ایمیل می‌رود.
 * نشتِ دیتابیس نباید بتواند رمزِ کسی را عوض کند.
 */

/** بازنشانیِ عادی — همان پیش‌فرضِ یک‌روزهٔ وردپرس. */
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;
/** دعوت‌نامه — ۳ روز (پورتِ فیلترِ `password_reset_expiration` برای دعوتِ معلق). */
export const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function newResetToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resetExpiry(now: Date, invite: boolean): Date {
  return new Date(now.getTime() + (invite ? INVITE_TTL_MS : RESET_TTL_MS));
}

export type ResetCheck = 'ok' | 'invalid' | 'expired';

export function checkResetToken(
  row: { resetTokenHash: string | null; resetExpiresAt: Date | null },
  token: string,
  now: Date,
): ResetCheck {
  if (!row.resetTokenHash || !row.resetExpiresAt || !token) return 'invalid';
  const given = Buffer.from(hashResetToken(token));
  const stored = Buffer.from(row.resetTokenHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return 'invalid';
  if (row.resetExpiresAt.getTime() < now.getTime()) return 'expired';
  return 'ok';
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** برچسبِ نقش در ایمیل — پورتِ `role_label()`. */
export function roleLabelFor(role: string): string {
  if (role === 'client') return 'کارفرما';
  if (role === 'member') return 'عضوِ تیم';
  return role;
}

/**
 * متنِ دعوت‌نامه — پورتِ `send_invite()`: کاربرِ تازه لینکِ تعیینِ رمز (۳ روز)
 * می‌گیرد، کاربرِ موجود فقط آدرسِ داشبورد. به زبانِ پنلِ مدیر ساخته می‌شود.
 */
export function inviteMailLines(
  input: { isNew: boolean; roleLabel: string; site: string; link: string | null; dashboard: string },
  t: Translate,
): { subject: string; body: string } {
  const subject = t('دعوت به {site}', { site: input.site });
  const lines = input.isNew
    ? [
        t('شما به‌عنوان «{role}» به {site} دعوت شدید.', { role: input.roleLabel, site: input.site }),
        '',
        t('برای تعیین رمز عبور و فعال‌سازیِ حساب، روی این لینک بزنید (تا ۳ روز معتبر است):'),
        input.link ?? input.dashboard,
        '',
        t('پس از تعیین رمز، از این آدرس وارد داشبورد شوید:'),
        input.dashboard,
      ]
    : [
        t('شما به‌عنوان «{role}» به {site} دسترسی یافتید.', { role: input.roleLabel, site: input.site }),
        '',
        t('با حساب کاربریِ خودتان از این آدرس وارد داشبورد شوید:'),
        input.dashboard,
      ];
  return { subject, body: lines.join('\n') };
}

/** متنِ ایمیلِ «رمزم را فراموش کرده‌ام». */
export function resetMailLines(input: { site: string; link: string }, t: Translate): { subject: string; body: string } {
  return {
    subject: t('بازنشانیِ رمزِ عبور — {site}', { site: input.site }),
    body: [
      t('برای تعیینِ رمزِ تازه روی این لینک بزنید (تا ۲۴ ساعت معتبر است):'),
      input.link,
      '',
      t('اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید؛ رمزتان تغییری نمی‌کند.'),
    ].join('\n'),
  };
}
