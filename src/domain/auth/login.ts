/**
 * ورود — قواعدِ امنیتی.
 *
 * این ماژول عمداً به دیتابیس وابسته نیست: یک قرارداد (`UserLookup`) می‌گیرد
 * تا بشود بدونِ زیرساخت تستش کرد (R-ARCH-01 — منطق در دامنه).
 */

import { verifyPassword } from './password';

export interface AuthUser {
  id: number;
  email: string;
  passwordHash: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface UserLookup {
  /**
   * جست‌وجو با **شناسه**: ایمیل یا نامِ کاربری.
   * ⚠️ پیاده‌سازی باید هر دو را بی‌اعتنا به حروف بگردد.
   */
  findByIdentifier(identifier: string): Promise<AuthUser | null>;
}

/**
 * شناسه را نرمال می‌کند — چه ایمیل باشد چه نامِ کاربری.
 * ⚠️ فقط trim و lower: نامِ کاربری هم مثلِ ایمیل نباید به حروفِ بزرگ و
 * کوچک حساس باشد، وگرنه «Ali» و «ali» دو حساب می‌شوند.
 */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/** نامِ کاربریِ مجاز: حروفِ لاتین، رقم، نقطه، خط تیره و زیرخط. */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value.trim().toLowerCase());
}

export type LoginFailure = 'invalid_credentials' | 'inactive' | 'rate_limited';

export type LoginResult =
  | { ok: true; userId: number }
  | { ok: false; reason: LoginFailure };

/** ایمیل همیشه نرمال می‌شود تا «A@x.com» و «a@x.com» یک حساب باشند. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * هشِ ساختگی برای زمانی که کاربر وجود ندارد.
 * ⚠️ بدونِ این، زمانِ پاسخ لو می‌دهد که ایمیل ثبت شده است یا نه
 * (user enumeration). با این کار هر دو مسیر یک بار argon2 اجرا می‌کنند.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

export interface LoginOptions {
  /** تعدادِ تلاشِ ناموفقِ اخیر — برای محدودیتِ نرخ. */
  recentFailures?: number;
  maxFailures?: number;
}

export async function attemptLogin(
  lookup: UserLookup,
  identifier: string,
  password: string,
  options: LoginOptions = {},
): Promise<LoginResult> {
  const { recentFailures = 0, maxFailures = 10 } = options;

  if (recentFailures >= maxFailures) {
    return { ok: false, reason: 'rate_limited' };
  }

  const user = await lookup.findByIdentifier(normalizeIdentifier(identifier));

  // همیشه یک بررسیِ رمز انجام می‌شود — حتی وقتی کاربر نیست (زمان‌بندیِ ثابت).
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(hashToCheck, password);

  if (!user || !user.passwordHash || !passwordOk) {
    // ⚠️ پیامِ یکسان برای «حساب نیست» و «رمز غلط» — تا وجودِ حساب لو نرود.
    return { ok: false, reason: 'invalid_credentials' };
  }

  // R-NOTIF-02 و منطقِ عضوِ سابق: کاربرِ غیرفعال یا حذف‌شده وارد نمی‌شود.
  if (!user.isActive || user.deletedAt !== null) {
    return { ok: false, reason: 'inactive' };
  }

  return { ok: true, userId: user.id };
}
