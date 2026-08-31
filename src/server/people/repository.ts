import { tagName } from '@/db/tag-name';
import { avatarsFor } from '@/server/files/service';
import { currentLocale } from '@/i18n/server';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  users, userRoles, userOffices, offices, tags, tagRelations,
  projectMembers, projectPayments, timelogs, userAvatars,
} from '@/db/schema';
import type { Role } from '@/domain/access/permissions';
import type { MemberState } from '@/domain/people/offboarding';
import {
  deriveState, normalizeConfig, type PresenceState,
} from '@/domain/people/presence';
import { getSystemConfig } from '@/server/settings/system-service';

/**
 * لایهٔ دادهٔ «افراد» — اعضا و کارفرمایان یک صفحهٔ مشترک دارند
 * ( در نسخهٔ قبلی)، پس یک لایهٔ داده هم دارند.
 *
 * ⚠️ R-PERF-01 — تعدادِ کوئری ثابت است، نه وابسته به تعدادِ افراد.
 */

export interface PersonRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  memberState: MemberState;
  /** «همکارِ ادمین» است؟ فقط این افراد دسترسیِ پیکربندی‌شدنی دارند. */
  isStaff: boolean;
  /** تصویرِ پروفایل؛ null ← تک‌نگار. */
  avatarFileId: number | null;
  /** رمز دارد؟ بدونِ آن، فرد ساخته شده ولی نمی‌تواند وارد شود. */
  hasPassword: boolean;
  /** حضورِ زنده. */
  /** ⚠️ null یعنی حضور خاموش است — اصلاً نقطه‌ای نشان داده نمی‌شود. */
  presence: PresenceState | null;
  offices: Array<{ id: number; name: string; manages: boolean }>;
  tags: Array<{ id: number; name: string; color: string | null }>;
}

/** فهرستِ افرادِ یک نقش، با دفاتر و تگ‌هایشان — کوئریِ ثابت، مستقل از تعداد. */
export async function listByRole(role: Role): Promise<PersonRow[]> {
  const rows = await db
    .selectDistinct({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      memberState: users.memberState,
      lastSeenAt: users.lastSeenAt,
      lastActiveAt: users.lastActiveAt,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, role), isNull(users.deletedAt)))
    .orderBy(users.name);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [officeRows, tagRows, staffRows, avatarRows] = await Promise.all([
    db.select({
      userId: userOffices.userId,
      officeId: userOffices.officeId,
      manages: userOffices.manages,
      name: offices.name,
    })
      .from(userOffices)
      .leftJoin(offices, eq(offices.id, userOffices.officeId))
      .where(inArray(userOffices.userId, ids)),

    db.select({
      userId: tagRelations.objectId,
      id: tags.id,
      name: tagName(await currentLocale()),
      color: tags.color,
    })
      .from(tagRelations)
      .innerJoin(tags, eq(tags.id, tagRelations.tagId))
      .where(and(
        eq(tagRelations.objectType, 'user'),
        inArray(tagRelations.objectId, ids),
        eq(tags.type, 'member_role'),
      ))
      .orderBy(tags.sortOrder, tags.id),

    db.select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.role, 'admin'), inArray(userRoles.userId, ids))),

    /**
     * ⚠️ همان کمکیِ مشترک، نه یک کوئریِ دوباره‌نوشته: تا پیش از این همین
     * پرس‌وجو دو جا وجود داشت — یکی اینجا و یکی `avatarsFor()` — و هیچ‌کس
     * دومی را صدا نمی‌زد. دو پیاده‌سازیِ یک چیز دیر یا زود از هم واگرا
     * می‌شوند؛ همین یک بار در استخراج‌گرِ ترجمه اتفاق افتاد و گران تمام شد.
     */
    avatarsFor(ids),
  ]);

  const staff = new Set(staffRows.map((r) => r.userId));
  const avatars = avatarRows;

  // یک «الان» برای همهٔ ردیف‌ها، تا حالتِ دو نفر با اختلافِ میلی‌ثانیه فرق نکند.
  const now = new Date();
  // ⚠️ آستانه‌ها و روشن/خاموش‌بودن از تنظیماتِ سامانه؛ خاموش یعنی همه «آفلاین»
  // نشان داده می‌شوند، نه اینکه نقطه‌ای با دادهٔ کهنه سبز بماند.
  const system = await getSystemConfig();
  const presenceConfig = normalizeConfig({
    ping: system.presencePing,
    idleAfter: system.presenceIdle,
    offlineAfter: system.presenceOffline,
  });

  const officesByUser = new Map<number, PersonRow['offices']>();
  for (const o of officeRows) {
    const list = officesByUser.get(o.userId) ?? [];
    list.push({ id: o.officeId, name: o.name ?? `#${o.officeId}`, manages: o.manages });
    officesByUser.set(o.userId, list);
  }

  const tagsByUser = new Map<number, PersonRow['tags']>();
  for (const t of tagRows) {
    const list = tagsByUser.get(t.userId) ?? [];
    list.push({ id: t.id, name: t.name, color: t.color });
    tagsByUser.set(t.userId, list);
  }

  return rows.map(({ passwordHash, ...r }) => ({
    ...r,
    memberState: r.memberState as MemberState,
    isStaff: staff.has(r.id),
    avatarFileId: avatars.get(r.id) ?? null,
    /**
     * ⚠️ فقط **بود و نبودِ** رمز. هشِ رمز با destructuring از شیء بیرون
     * کشیده می‌شود و هرگز واردِ خروجی نمی‌شود — این ردیف مستقیم به
     * کامپوننتِ کلاینت می‌رود و یک `...r` ِ بی‌احتیاط هش را در HTML ِ
     * صفحه می‌نشاند.
     */
    hasPassword: Boolean(passwordHash),
    presence: system.presenceEnabled
      ? deriveState({
        lastSeen: r.lastSeenAt,
        lastActive: r.lastActiveAt,
        now,
        config: presenceConfig,
      })
      : null,
    offices: officesByUser.get(r.id) ?? [],
    tags: tagsByUser.get(r.id) ?? [],
  }));
}

/** یک نفر با شناسه. */
export async function getPerson(id: number) {
  const rows = await db.select().from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)));
  return rows[0] ?? null;
}

/** نقش‌های یک کاربر — لازمِ تصمیمِ «حذف» (R-PEOPLE-02). */
export async function rolesOf(userId: number): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role })
    .from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

/**
 * کاربرانی که نقشِ داده‌شده را ندارند — گزینه‌های انتخابگرِ «کاربرِ موجود».
 *
 * ⚠️ کاربرِ حذف‌شده (`deleted_at`) بیرون است، ولی عضوِ **سابق** عمداً می‌ماند:
 * درست همان کسی که پیش‌تر همکار بوده و حالا به‌عنوانِ کارفرما برمی‌گردد.
 */
export async function usersWithoutRole(role: Role) {
  const holders = db.select({ userId: userRoles.userId })
    .from(userRoles).where(eq(userRoles.role, role));

  return db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(and(isNull(users.deletedAt), notInArray(users.id, holders)))
    .orderBy(users.name);
}

/**
 * ⚠️ ردِ پای مالی/کاری — اگر باشد، کاربر حذف نمی‌شود بلکه قطع می‌شود.
 * یک کوئری با `exists`، نه چند شمارشِ کامل.
 */
export async function hasFootprint(userId: number): Promise<boolean> {
  const rows = await db.execute(sql`
    select
      exists(select 1 from project_payments where user_id = ${userId})
      or exists(select 1 from timelogs where user_id = ${userId})
      or exists(select 1 from project_members where user_id = ${userId})
      as found
  `);
  return Boolean((rows as unknown as Array<{ found: boolean }>)[0]?.found);
}

/** دفاترِ فعال — گزینه‌های فرم و فیلتر. */
export async function officeOptions() {
  return db.select({ id: offices.id, name: offices.name })
    .from(offices).where(eq(offices.isActive, true)).orderBy(offices.name);
}

/** تگ‌های نقشِ عضو — گزینه‌های فرم. */
export async function roleTagOptions() {
  return db.select({ id: tags.id, name: tagName(await currentLocale()), color: tags.color })
    .from(tags).where(eq(tags.type, 'member_role')).orderBy(tags.sortOrder, tags.id);
}

export { users, userRoles, userOffices, tagRelations, projectMembers, projectPayments, timelogs };
