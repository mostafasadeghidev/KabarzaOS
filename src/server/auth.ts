import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { canSignIn, type MemberState } from '@/domain/people/offboarding';
import type { Locale } from '@/i18n/config';
import { users, userRoles, userPermissions } from '@/db/schema';
import { readSessionToken, SESSION_COOKIE } from '@/domain/auth/session';
import { canViewAs, readViewAsToken, VIEW_AS_COOKIE } from '@/domain/auth/view-as';
import type { Actor, Permission, Role } from '@/domain/access/permissions';
import { tagPermissionsFor } from '@/server/people/tag-caps';
import { ForbiddenError } from '@/domain/access/guard';
import { storedAppearance } from '@/domain/people/appearance';

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
  {
    actor: Actor; name: string; locale: Locale | null; timezone: string; memberState: MemberState;
    /** ظاهرِ ذخیره‌شده روی کاربر؛ خالی = «انتخابی نکرده» (مهاجرتِ 0033). */
    appearance: ReturnType<typeof storedAppearance>;
    /** «دیدن به‌جای کاربر» (۲.۵۳.۰) — نامِ مالکی که واقعاً پشتِ صفحه است. */
    viewAs: { ownerId: number; ownerName: string } | null;
  } | null
> {
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!session) return null;

  const real = await loadActor(session.userId);
  if (!real) return null;
  let { actor, user } = real;
  let viewAs: { ownerId: number; ownerName: string } | null = null;

  /**
   * ⚠️ کوکیِ «دیدن به‌جای» فقط وقتی پذیرفته می‌شود که مالکِ داخلِ توکن همین
   * نشستِ واقعی باشد و هنوز هم مالک باشد؛ وگرنه بی‌صدا نادیده گرفته می‌شود و
   * کاربر خودش می‌ماند. هدف هم باید هنوز واردشدنی باشد.
   */
  const va = await readViewAsToken(store.get(VIEW_AS_COOKIE)?.value, sessionSecret());
  if (va && va.ownerId === real.actor.id && va.targetId !== real.actor.id) {
    const target = await loadActor(va.targetId);
    if (target && canViewAs(real.actor, target.actor)) {
      viewAs = { ownerId: real.actor.id, ownerName: real.user.name };
      actor = { ...target.actor, viewOnly: true };
      user = target.user;
    }
  }

  return {
    actor,
    name: user.name,
    // ⚠️ خالی می‌ماند اگر کاربر انتخابی نکرده باشد؛ حل‌کردنش کارِ
    // `currentLocale()` است که تنظیمِ سامانه را هم می‌بیند (R-I18N-14).
    locale: (user.locale as Locale | null) ?? null,
    /** منطقهٔ زمانیِ کاربر — برای نمایشِ تاریخ‌ها؛ خالی یعنی مرورگر. */
    timezone: user.timezone ?? '',
    /** برای تشخیصِ عضوِ سابقِ «فقط مالی» در چیدمان (R-PEOPLE-01). */
    memberState: user.memberState as MemberState,
    appearance: storedAppearance(user),
    viewAs,
  };
}

/**
 * بازیگرِ یک کاربر از روی شناسه — مشترکِ نشستِ مرورگر و توکنِ MCP (۲.۷.۰).
 *
 * ⚠️ R-PEOPLE-03 — «قطع‌شده» و حذف‌شده بازیگر نیستند؛ «فقط مالی» هست.
 * مجوزها هر بار از دیتابیس خوانده می‌شوند، پس پس‌گرفتنِ دسترسی بی‌درنگ
 * روی توکن‌ها هم اثر دارد.
 */
export async function loadActor(userId: number) {
  const rows = await db.select().from(users).where(eq(users.id, userId));
  const user = rows[0];
  if (!user || !canSignIn(user.memberState, user.deletedAt !== null)) return null;

  const [roleRows, permRows, tagPermissions] = await Promise.all([
    db.select().from(userRoles).where(eq(userRoles.userId, user.id)),
    db.select().from(userPermissions).where(eq(userPermissions.userId, user.id)),
    // پورتِ `sync_caps_from_tags()`: تگِ «حسابدار»/«مدیر حسابداری» دسترسیِ مالی می‌دهد.
    tagPermissionsFor(user.id),
  ]);
  const actor: Actor = {
    id: user.id,
    roles: roleRows.map((r) => r.role as Role),
    permissions: [...new Set([...permRows.map((p) => p.permission as Permission), ...tagPermissions])],
    privateAccess: user.privateAccess,
  };
  return { actor, user };
}

/** بازیگرِ فعلی، یا null اگر وارد نشده باشد. */
export async function currentActor(): Promise<Actor | null> {
  return (await currentSession())?.actor ?? null;
}

/**
 * بازیگرِ فعلی یا خطا — برای مسیرهایی که ورود اجباری است.
 *
 * ⚠️ پورتِ `guard_offboarded_actions()`: عضوِ سابقِ «فقط مالی» فقط حساب
 * بانکی، زبان و تم را ذخیره می‌کند؛ هر اقدامِ دیگری در **سرور** رد می‌شود،
 * نه فقط در رابط (R-ARCH-01). پیش از این چیدمان پوستهٔ محدود نشان می‌داد
 * ولی فراخوانیِ مستقیمِ اقدام‌ها (تایمر، برنامهٔ هفتگی، پیام) می‌گذشت.
 * اقدام‌های مجاز با `allowOffboarded` صریحاً اعلام می‌کنند.
 */
export async function requireActor(options: { allowOffboarded?: boolean } = {}): Promise<Actor> {
  const session = await currentSession();
  if (!session) throw new Error('unauthenticated');
  // ⚠️ «دیدن به‌جای کاربر» فقط دیدن است: هیچ اقدامی به اسمِ کسی که انجامش نداده ثبت نمی‌شود.
  if (session.actor.viewOnly) throw new ForbiddenError('view_only');
  if (session.memberState !== 'active' && !options.allowOffboarded) {
    throw new ForbiddenError('offboarded');
  }
  return session.actor;
}

export { sessionSecret };
