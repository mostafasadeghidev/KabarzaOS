import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { canSignIn, type MemberState } from '@/domain/people/offboarding';
import type { Locale } from '@/i18n/config';
import { users, userRoles, userPermissions } from '@/db/schema';
import { readSessionToken, SESSION_COOKIE } from '@/domain/auth/session';
import type { Actor, Permission, Role } from '@/domain/access/permissions';
import { tagPermissionsFor } from '@/server/people/tag-caps';

/**
 * پلِ بینِ دیتابیس و لایهٔ دامنه.
 *
 * ⚠️ مجوزها **هر بار از دیتابیس** خوانده می‌شوند، نه از توکن.
 * اگر در توکن بودند، پس‌گرفتنِ دسترسی تا انقضای نشست بی‌اثر می‌ماند.
 */

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set (32+ chars) in production');
    }
    return 'dev-only-secret-not-for-production-use';
  }
  return secret;
}

/**
 * نشستِ فعلی: بازیگر + نامِ نمایشی و زبان.
 *
 * ⚠️ تنها جایی است که نشست خوانده و گاردِ ورود اعمال می‌شود (R-PEOPLE-03).
 * `Actor` عمداً فقط هویت و مجوز دارد تا در تست‌ها ساختنش ارزان بماند؛
 * چیزهای نمایشی جدا برمی‌گردند، بدونِ کوئریِ دوم.
 */
export async function currentSession(): Promise<
  { actor: Actor; name: string; locale: Locale | null; timezone: string; memberState: MemberState } | null
> {
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!session) return null;

  const rows = await db.select().from(users).where(eq(users.id, session.userId));
  const user = rows[0];
  // R-PEOPLE-03 — «قطع‌شده» و حذف‌شده بازیگر نیستند؛ «فقط مالی» هست.
  if (!user || !canSignIn(user.memberState, user.deletedAt !== null)) return null;

  const [roleRows, permRows, tagPermissions] = await Promise.all([
    db.select().from(userRoles).where(eq(userRoles.userId, user.id)),
    db.select().from(userPermissions).where(eq(userPermissions.userId, user.id)),
    // پورتِ `sync_caps_from_tags()`: تگِ «حسابدار»/«مدیر حسابداری» دسترسیِ مالی می‌دهد.
    tagPermissionsFor(user.id),
  ]);

  return {
    actor: {
      id: user.id,
      roles: roleRows.map((r) => r.role as Role),
      permissions: [...new Set([...permRows.map((p) => p.permission as Permission), ...tagPermissions])],
      privateAccess: user.privateAccess,
    },
    name: user.name,
    // ⚠️ خالی می‌ماند اگر کاربر انتخابی نکرده باشد؛ حل‌کردنش کارِ
    // `currentLocale()` است که تنظیمِ سامانه را هم می‌بیند (R-I18N-14).
    locale: (user.locale as Locale | null) ?? null,
    /** منطقهٔ زمانیِ کاربر — برای نمایشِ تاریخ‌ها؛ خالی یعنی مرورگر. */
    timezone: user.timezone ?? '',
    /** برای تشخیصِ عضوِ سابقِ «فقط مالی» در چیدمان (R-PEOPLE-01). */
    memberState: user.memberState as MemberState,
  };
}

/** بازیگرِ فعلی، یا null اگر وارد نشده باشد. */
export async function currentActor(): Promise<Actor | null> {
  return (await currentSession())?.actor ?? null;
}

/** بازیگرِ فعلی یا خطا — برای مسیرهایی که ورود اجباری است. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new Error('unauthenticated');
  return actor;
}

export { sessionSecret };
