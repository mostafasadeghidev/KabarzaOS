/**
 * رمز عبور — argon2id.
 *
 * ⚠️ نکتهٔ مهاجرت (DATA-MODEL.md): هشِ رمزهای سامانهٔ قبلی منتقل **نمی‌شود**.
 * سامانهٔ قبلی از phpass استفاده می‌کند؛ آوردنش یعنی وارد کردنِ یک الگوریتمِ
 * قدیمی به سیستمِ جدید. کاربران در مهاجرت رمزشان را بازنشانی می‌کنند.
 */

import { hash, verify } from '@node-rs/argon2';

/** پارامترها طبقِ توصیهٔ OWASP برای argon2id. */
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/** بررسیِ رمز. هرگز throw نمی‌کند — هشِ خراب یعنی «نادرست». */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, OPTIONS);
  } catch {
    return false;
  }
}

export interface PasswordPolicy {
  ok: boolean;
  reason?: 'too_short' | 'too_common';
}

/** رمزهای پرتکرار که هرگز پذیرفته نمی‌شوند. */
const COMMON = new Set(['password', '12345678', 'qwertyui', 'admin123', '123456789']);

export function checkPasswordPolicy(plain: string): PasswordPolicy {
  if (plain.length < 8) return { ok: false, reason: 'too_short' };
  if (COMMON.has(plain.toLowerCase())) return { ok: false, reason: 'too_common' };
  return { ok: true };
}
