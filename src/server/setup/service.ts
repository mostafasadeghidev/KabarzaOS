import { sql as raw } from 'drizzle-orm';
import { db } from '@/db/client';
import { userRoles, users } from '@/db/schema';
import { hashPassword, checkPasswordPolicy } from '@/domain/auth/password';
import { isValidUsername, normalizeIdentifier } from '@/domain/auth/login';

/**
 * نصبِ اولیه — ساختِ مالکِ اول روی دیتابیسِ خالی.
 *
 * ⚠️ تنها قفلِ این مسیر «هیچ کاربری وجود ندارد» است، نه یک راز. همان
 * الگویی که سامانهٔ قبلی و Gitea دارند: کسی که سامانه را تازه بالا آورده باید
 * بتواند بدونِ ترمینال حسابش را بسازد. در عوض، **پنجرهٔ بینِ دیپلوی و
 * نصب باید کوتاه باشد** — تا وقتی کسی ثبت نشده، هر کسی که آدرس را بداند
 * می‌تواند مالک شود. بعد از اولین کاربر، این مسیر برای همیشه بسته است.
 */

export type SetupFailure =
  | 'already_installed'
  | 'name_required'
  | 'email_invalid'
  | 'email_taken'
  | 'username_invalid'
  | 'username_taken'
  | 'password_too_short'
  | 'password_too_common'
  | 'password_mismatch';

export class SetupError extends Error {
  constructor(readonly reason: SetupFailure) {
    super(reason);
    this.name = 'SetupError';
  }
}

/** آیا سامانه از قبل نصب شده؟ (حتی یک کاربر = بله) */
export async function isInstalled(): Promise<boolean> {
  const rows = await db.select({ n: raw<number>`count(*)::int` }).from(users);
  return (rows[0]?.n ?? 0) > 0;
}

export interface SetupInput {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  passwordRepeat: string;
}

/**
 * ساختِ مالک. شناسهٔ بازگشتی برای ورودِ خودکار به‌کار می‌رود.
 *
 * ⚠️ ترتیبِ بررسی‌ها عمدی است: اول «نصب شده؟» تا هیچ اعتبارسنجیِ دیگری
 * نتواند از وجود یا نبودِ داده چیزی لو بدهد.
 */
export async function installOwner(input: SetupInput): Promise<number> {
  if (await isInstalled()) throw new SetupError('already_installed');

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (firstName === '') throw new SetupError('name_required');

  const email = normalizeIdentifier(input.email);
  // اعتبارسنجیِ ساده و عمدی: یک @ با متن در دو طرف و یک نقطه در دامنه.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SetupError('email_invalid');

  const username = normalizeIdentifier(input.username);
  if (!isValidUsername(username)) throw new SetupError('username_invalid');
  // ⚠️ نامِ کاربری نباید شکلِ ایمیل داشته باشد، وگرنه می‌شود با نامِ
  // کاربریِ «a@b.com» حسابِ دیگری را در ورود مبهم کرد.
  if (username.includes('@')) throw new SetupError('username_invalid');

  if (input.password !== input.passwordRepeat) throw new SetupError('password_mismatch');
  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) {
    throw new SetupError(policy.reason === 'too_common' ? 'password_too_common' : 'password_too_short');
  }

  const fullName = lastName === '' ? firstName : `${firstName} ${lastName}`;

  return db.transaction(async (tx) => {
    // ⚠️ دوباره داخلِ تراکنش: بینِ بررسیِ اول و اینجا ممکن است کسی سبقت
    // بگیرد. شاخصِ یکتای دیتابیس آخرین سدّ است.
    const guard = await tx.select({ n: raw<number>`count(*)::int` }).from(users);
    if ((guard[0]?.n ?? 0) > 0) throw new SetupError('already_installed');

    const [row] = await tx.insert(users).values({
      name: fullName,
      email,
      username,
      passwordHash: await hashPassword(input.password),
    }).returning({ id: users.id });

    await tx.insert(userRoles).values({ userId: row!.id, role: 'owner' });
    return row!.id;
  });
}
