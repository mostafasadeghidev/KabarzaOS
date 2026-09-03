'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { attemptLogin, type AuthUser } from '@/domain/auth/login';
import { createFailureStore, LOGIN_MAX_FAILURES, throttleKeys, worstFailures } from '@/domain/auth/throttle';
import { canSignIn, type MemberState } from '@/domain/people/offboarding';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/domain/auth/session';
import { sessionSecret, currentActor } from '@/server/auth';
import { loginSchema, type LoginState } from './schema';
import { markOffline } from '@/server/people/presence-service';


/** شمارندهٔ شکست‌های ورود — یک نمونه برای عمرِ فرایند (R-AUTH: پنجرهٔ ۱۵ دقیقه، سقفِ ۱۰). */
const failures = createFailureStore();

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'ایمیل یا رمز عبور نادرست است.',
  inactive: 'این حساب غیرفعال است.',
  rate_limited: 'تلاش‌های ناموفق زیاد بوده؛ کمی بعد دوباره تلاش کنید.',
};

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  }

  const lookup = {
    /**
     * ⚠️ یک کوئری برای هر دو شناسه، با مقایسهٔ بی‌اعتنا به حروف: ایمیل و
     * نامِ کاربری هر دو در دیتابیس همان‌طور که کاربر نوشته ذخیره می‌شوند،
     * ولی «Ali@X.com» باید همان «ali@x.com» را پیدا کند. شاخصِ
     * `lower(...)` ِ مهاجرتِ 0017 این جست‌وجو را ارزان نگه می‌دارد.
     */
    async findByIdentifier(identifier: string): Promise<AuthUser | null> {
      const rows = await db.select().from(users).where(or(
        sql`lower(${users.email}) = ${identifier}`,
        sql`lower(${users.username}) = ${identifier}`,
      ));
      const u = rows[0];
      return u
        ? {
            id: u.id,
            email: u.email,
            passwordHash: u.passwordHash,
            /**
             * ⚠️ R-PEOPLE-03 — «فقط مالی» **می‌تواند وارد شود**؛ فقط
             * «قطع‌شده» نمی‌تواند. اینجا اول `=== 'active'` بود و عضوِ سابق
             * را هم بیرون می‌گذاشت — یعنی صفحهٔ تسویه‌اش اصلاً در دسترس
             * نبود. تصمیم یک‌جاست: `canSignIn`.
             */
            isActive: canSignIn(u.memberState as MemberState, u.deletedAt !== null),
            deletedAt: u.deletedAt,
          }
        : null;
    },
  };

  // ⚠️ محدودکننده پیش از این در دامنه بود ولی هیچ شمارنده‌ای نمی‌گرفت — عملاً خاموش.
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const keys = throttleKeys(parsed.data.email, ip);
  const result = await attemptLogin(lookup, parsed.data.email, parsed.data.password, {
    recentFailures: worstFailures(failures, keys),
    maxFailures: LOGIN_MAX_FAILURES,
  });
  if (!result.ok) {
    if (result.reason !== 'rate_limited') for (const k of keys) failures.recordFailure(k);
    return { error: MESSAGES[result.reason] ?? MESSAGES['invalid_credentials']! };
  }
  for (const k of keys) failures.clear(k);

  const token = await createSessionToken({ userId: result.userId }, sessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect('/');
}

export async function logout(): Promise<void> {
  // پورتِ `on_logout()`: خروج یعنی همین حالا آفلاین — نه تا انقضای مهرِ حضور.
  // (بیکنِ `pagehide` بعد از حذفِ کوکی بی‌نشست می‌رسد و هیچ کاری نمی‌کند.)
  const actor = await currentActor();
  if (actor) await markOffline(actor).catch(() => {});
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
