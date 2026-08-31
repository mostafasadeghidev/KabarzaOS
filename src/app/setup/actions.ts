'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/domain/auth/session';
import { sessionSecret } from '@/server/auth';
import { installOwner, SetupError, type SetupFailure } from '@/server/setup/service';

export interface SetupState {
  error?: string;
  /** برای نگه‌داشتنِ مقادیر پس از خطا — رمز عمداً برنمی‌گردد. */
  values?: Record<string, string>;
}

const MESSAGES: Record<SetupFailure, string> = {
  already_installed: 'این سامانه از قبل نصب شده است.',
  name_required: 'نام را وارد کنید.',
  email_invalid: 'ایمیل معتبر نیست.',
  email_taken: 'این ایمیل قبلاً ثبت شده است.',
  username_invalid: 'نامِ کاربری باید ۳ تا ۳۲ نویسهٔ لاتین، رقم، نقطه، خط تیره یا زیرخط باشد.',
  username_taken: 'این نامِ کاربری گرفته شده است.',
  password_too_short: 'رمز دستِ‌کم ۸ نویسه باشد.',
  password_too_common: 'این رمز خیلی پرتکرار است؛ یکی دیگر انتخاب کنید.',
  password_mismatch: 'دو رمز یکی نیستند.',
};

/**
 * ویزاردِ نصب — می‌سازد و **بلافاصله وارد می‌کند**.
 *
 * ⚠️ ورودِ خودکار عمدی است: کاربر همین الان رمز را خودش انتخاب کرده، پس
 * پرسیدنِ دوبارهٔ آن در صفحهٔ ورود فقط یک پلهٔ اضافه است. همان کوکیِ
 * نشستِ مسیرِ عادی ساخته می‌شود، نه چیزی ویژه.
 */
export async function installAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const read = (key: string) => String(formData.get(key) ?? '');
  const values = {
    firstName: read('firstName'),
    lastName: read('lastName'),
    email: read('email'),
    username: read('username'),
  };

  let userId: number;
  try {
    userId = await installOwner({
      ...values,
      password: read('password'),
      passwordRepeat: read('passwordRepeat'),
    });
  } catch (error) {
    if (error instanceof SetupError) {
      return { error: MESSAGES[error.reason], values };
    }
    /**
     * ⚠️ خطای یکتاییِ دیتابیس هم اینجا می‌افتد — دو نفر هم‌زمان فرم را
     * فرستاده‌اند. پیامِ عمومی درست است: نفرِ دوم باید ببیند که نصب انجام
     * شده، نه اینکه جزئیاتِ خطای Postgres را بخواند.
     */
    return { error: MESSAGES.already_installed, values };
  }

  const token = await createSessionToken({ userId }, sessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect('/');
}
