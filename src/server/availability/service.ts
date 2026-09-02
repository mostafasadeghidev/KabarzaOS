import { isNull, and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { presenceFor, presenceSeenFor } from '@/server/people/presence-service';
import { avatarsFor } from '@/server/files/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { managedOfficeIds } from '@/server/team/service';
import { db } from '@/db/client';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import {
  absences, availabilitySlots, offices, projects, tagRelations, tags, userOffices,
  userRoles, users, workTimers,
} from '@/db/schema';
import { can, canManageSection, type Actor } from '@/domain/access/permissions';
import type { PresenceState } from '@/domain/people/presence';
import { ForbiddenError } from '@/domain/access/guard';
import {
  planWeek, slotsByWeekday, slotsSpan, weekdayIndex, type Slot,
} from '@/domain/availability/weekly';
import {
  cellState, elapsedMinutes, isAvailableNow, sortOnline, type CellState,
} from '@/domain/availability/team';

/**
 * در دسترس بودنِ هفتگی.
 * ⚠️ ویرایش فقط برای **خودِ شخص** یا مدیرِ اعضا؛ نمای تیمی پشتِ
 * `members.view` **یا** مدیریتِ دفتر.
 */

/** برنامهٔ یک نفر: روز ← بازه‌ها (فهرستِ خالی = تمام روز). */
export async function getWeek(userId: number): Promise<Map<number, Slot[]>> {
  const rows = await db
    .select({
      weekday: availabilitySlots.weekday,
      from: availabilitySlots.fromTime,
      to: availabilitySlots.toTime,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.userId, userId))
    .orderBy(asc(availabilitySlots.weekday), asc(availabilitySlots.fromTime));

  return slotsByWeekday(rows);
}

export async function setWeek(
  actor: Actor,
  userId: number,
  onDays: number[],
  slotsByDay: Record<number, Array<{ from: string; to: string }>>,
) {
  if (userId !== actor.id && !canManageSection(actor, 'members')) {
    throw new ForbiddenError('members.manage');
  }

  const rows = planWeek(onDays, slotsByDay);

  // جایگزینیِ کامل — برنامهٔ هفتگی یک تصویرِ واحد است، نه چند ویرایشِ جزئی.
  await db.transaction(async (tx) => {
    await tx.delete(availabilitySlots).where(eq(availabilitySlots.userId, userId));
    if (rows.length > 0) {
      await tx.insert(availabilitySlots).values(
        rows.map((r) => ({ userId, weekday: r.weekday, fromTime: r.from, toTime: r.to })),
      );
    }
  });
}

/**
 * دامنهٔ افرادی که این بازیگر می‌بیند.
 *
 * ⚠️ دو در ورودی دارد و عمداً یکسان نیستند: `members.view` کلِ تیم را
 * می‌بیند، ولی **مدیرِ دفتر** — که هیچ مجوزِ بخشی ندارد — فقط اعضای
 * دفترهای خودش را. نسخهٔ قبلی هم برای همین نقش مسیرِ جدا داشت
 * (`class-dashboard.php:1120`)؛ بدونِ آن، نقشی که کارش دانستنِ «امروز چه
 * کسی سرِ کار است» است هیچ راهی نداشت.
 */
async function visiblePeople(actor: Actor): Promise<{
  people: Array<{ id: number; name: string }>;
  scopedToOffices: number[] | null;
}> {
  const global = can(actor, 'members.view');
  const myOffices = global ? [] : await managedOfficeIds(actor.id);
  if (!global && myOffices.length === 0) throw new ForbiddenError('members.view');

  const people = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    /**
     * ⚠️ فقط اعضای **فعال** — پورتِ `active_by_role()`. بدونِ این، عضوِ قطع‌شده،
     * فقط‌مالی و حذف‌شده در ماتریس، شمارنده‌ها، «بدون برنامه» و تایمرها می‌آمدند.
     */
    .where(global
      ? and(eq(userRoles.role, 'member'), eq(users.memberState, 'active'), isNull(users.deletedAt))
      : and(
        eq(userRoles.role, 'member'),
        eq(users.memberState, 'active'),
        isNull(users.deletedAt),
        inArray(
          users.id,
          db.select({ id: userOffices.userId }).from(userOffices)
            .where(inArray(userOffices.officeId, myOffices)),
        ),
      ))
    .orderBy(users.name);

  return { people, scopedToOffices: global ? null : myOffices };
}

/** آیا این بازیگر اصلاً نمای تیمی دارد؟ برای منو و گاردِ صفحه. */
export async function hasTeamAvailability(actor: Actor): Promise<boolean> {
  if (can(actor, 'members.view')) return true;
  return (await managedOfficeIds(actor.id)).length > 0;
}

export interface MatrixCell {
  state: CellState;
  isToday: boolean;
  /** متنِ کوتاهِ خانه — بازهٔ فشرده، یا تاریخِ پایانِ مرخصی. */
  span: string;
  /** همهٔ بازه‌ها، هر کدام یک خط — برای tooltip. */
  tip: string;
}

export interface MatrixRow {
  id: number;
  name: string;
  presence: PresenceState | null;
  avatarFileId: number | null;
  hasSchedule: boolean;
  availableNow: boolean;
  onLeave: boolean;
  /** تاریخِ پایانِ مرخصیِ جاری — برای «مرخصی تا …». */
  leaveUntil: string | null;
  officeIds: number[];
  roleTagIds: number[];
  roleNames: string[];
  days: Record<number, Slot[]>;
}

/**
 * ماتریسِ هفتگیِ تیم — «چه کسی جمعه هست و چه ساعتی».
 * ⚠️ کوئری‌ها ثابت‌اند، نه یکی به‌ازای هر نفر (R-PERF-01).
 */
export async function teamMatrix(actor: Actor, at: Date = new Date()): Promise<MatrixRow[]> {
  const { people } = await visiblePeople(actor);
  if (people.length === 0) return [];

  const ids = people.map((p) => p.id);
  const today = at.toISOString().slice(0, 10);
  const locale = await currentLocale();

  /**
   * ⚠️ نقطهٔ حضور و آواتار روی ماتریس هم لازم‌اند — نسخهٔ قبلی در همین جدول
   * هر دو را دارد. بدونشان ماتریس فقط فهرستی از نام است.
   *
   * ⚠️ `presenceFor()` خودش تنظیمِ خاموش‌بودنِ حضور را **نمی‌بیند**، پس
   * بررسی اینجا انجام می‌شود: حضورِ خاموش یعنی هیچ نقطه‌ای، نه نقطهٔ
   * خاکستری با دادهٔ کهنه.
   */
  const [slots, presence, avatars, system, leaveRows, officeRows, roleRows] = await Promise.all([
    db.select({
      userId: availabilitySlots.userId,
      weekday: availabilitySlots.weekday,
      from: availabilitySlots.fromTime,
      to: availabilitySlots.toTime,
    })
      .from(availabilitySlots)
      .where(inArray(availabilitySlots.userId, ids))
      .orderBy(asc(availabilitySlots.weekday), asc(availabilitySlots.fromTime)),
    presenceFor(ids),
    avatarsFor(ids),
    getSystemConfig(),
    /**
     * مرخصیِ **امروز**.
     *
     * ⚠️ `toDate` شاملِ خودِ روز است — پورتِ `%s BETWEEN from_date AND to_date`.
     * اگر انحصاری می‌گرفتیم، روزِ آخرِ مرخصیِ هر کس «سرِ کار» نشان داده می‌شد.
     *
     * ⚠️ مرتب بر اساسِ **دیرترین پایان**: کسی که دو مرخصیِ همپوشان دارد،
     * «تا …» باید دورترین تاریخ را بگوید، نه اولی که دستمان آمد.
     */
    db.select({ userId: absences.userId, toDate: absences.toDate })
      .from(absences)
      .where(and(
        inArray(absences.userId, ids),
        lte(absences.fromDate, today),
        gte(absences.toDate, today),
      ))
      // ⚠️ تساویِ تاریخِ پایان با شناسهٔ بزرگ‌تر شکسته می‌شود تا انتخاب قطعی
      // بماند؛ وگرنه دو مرخصیِ هم‌پایان هر بار می‌توانند جوابِ متفاوت بدهند.
      .orderBy(desc(absences.toDate), desc(absences.id)),
    db.select({ userId: userOffices.userId, officeId: userOffices.officeId })
      .from(userOffices).where(inArray(userOffices.userId, ids)),
    db.select({ userId: tagRelations.objectId, tagId: tags.id, name: tagName(locale) })
      .from(tagRelations)
      .innerJoin(tags, eq(tags.id, tagRelations.tagId))
      .where(and(
        eq(tagRelations.objectType, 'user'),
        inArray(tagRelations.objectId, ids),
        eq(tags.type, 'member_role'),
      ))
      .orderBy(tags.sortOrder, tags.id),
  ]);

  const byUser = new Map<number, typeof slots>();
  for (const r of slots) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  const leaveUntil = new Map<number, string>();
  for (const r of leaveRows) if (!leaveUntil.has(r.userId)) leaveUntil.set(r.userId, r.toDate);

  const officesOf = new Map<number, number[]>();
  for (const r of officeRows) {
    officesOf.set(r.userId, [...(officesOf.get(r.userId) ?? []), r.officeId]);
  }

  const rolesOf = new Map<number, Array<{ id: number; name: string }>>();
  for (const r of roleRows) {
    rolesOf.set(r.userId, [...(rolesOf.get(r.userId) ?? []), { id: r.tagId, name: r.name }]);
  }

  const todayIdx = weekdayIndex(at);

  return people.map((p) => {
    const days = slotsByWeekday(byUser.get(p.id) ?? []);
    const onLeave = leaveUntil.has(p.id);
    const roles = rolesOf.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      presence: system.presenceEnabled ? presence.get(p.id) ?? null : null,
      avatarFileId: avatars.get(p.id) ?? null,
      // ⚠️ نقشهٔ خالی یعنی «برنامه‌ای نداده»، نه «تمام هفته آزاد».
      hasSchedule: byUser.has(p.id),
      availableNow: isAvailableNow({ days, today: todayIdx, onLeave, now: at }),
      onLeave,
      leaveUntil: leaveUntil.get(p.id) ?? null,
      officeIds: officesOf.get(p.id) ?? [],
      roleTagIds: roles.map((r) => r.id),
      roleNames: roles.map((r) => r.name),
      days: Object.fromEntries(days) as Record<number, Slot[]>,
    };
  });
}

/**
 * خانه‌های یک سطر، به ترتیبِ نمایشِ هفته.
 *
 * ⚠️ مرخصی **فقط خانهٔ امروز** را می‌گیرد. سطرِ کسی که این هفته مرخصی است
 * باید برنامهٔ بقیهٔ روزهایش را نشان دهد، وگرنه انگار اصلاً برنامه ندارد.
 */
export function rowCells(row: MatrixRow, order: number[], todayIdx: number): MatrixCell[] {
  return order.map((d) => {
    const isToday = d === todayIdx;
    const slots = row.days[d];
    const state = cellState({ isToday, onLeave: row.onLeave, hasDay: slots !== undefined });
    if (state === 'leave') return { state, isToday, span: row.leaveUntil ?? '', tip: '' };
    if (state === 'empty') return { state, isToday, span: '', tip: '' };
    const list = slots ?? [];
    return {
      state,
      isToday,
      span: slotsSpan(list),
      // ⚠️ هر بازه یک خط — tooltipِ نسخهٔ قبلی هم با newline جدا می‌کند.
      tip: list.map((x) => `${x.from}–${x.to}`).join('\n'),
    };
  });
}

/**
 * «چه کسی همین حالا کار می‌کند».
 *
 * ⚠️ این تنها کوئریِ تایمر است که به `actor.id` محدود **نیست** — بقیه دادهٔ
 * شخصی‌اند. پورتِ `Timelogs::all_active()`؛ نبودنش یعنی مدیر نمی‌دید چه کسی
 * روی چه پروژه‌ای مشغول است، و تایمرِ فراموش‌شده فقط به خودِ عضو گزارش می‌شد.
 *
 * ⚠️ تایمرِ بدونِ پروژه حذف نمی‌شود — ساعتِ **عمومی** هم کار است.
 */
export async function runningTimers(actor: Actor, at: Date = new Date()): Promise<Array<{
  userId: number;
  name: string;
  project: string;
  minutes: number;
}>> {
  const { people } = await visiblePeople(actor);
  if (people.length === 0) return [];

  const rows = await db
    .select({
      userId: workTimers.userId,
      userName: users.name,
      projectTitle: projects.title,
      startedAt: workTimers.startedAt,
    })
    .from(workTimers)
    .innerJoin(users, eq(users.id, workTimers.userId))
    .leftJoin(projects, eq(projects.id, workTimers.projectId))
    .where(and(
      isNotNull(workTimers.startedAt),
      inArray(workTimers.userId, people.map((p) => p.id)),
    ))
    .orderBy(asc(workTimers.startedAt));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.userName,
    project: r.projectTitle ?? '',
    minutes: elapsedMinutes(r.startedAt!, at),
  }));
}

/**
 * پنلِ «آنلاین اکنون» — فقط فعال و بی‌کار؛ آفلاین اصلاً ردیف نمی‌گیرد.
 * ⚠️ حضورِ خاموش یعنی فهرستِ خالی، نه فهرستِ کهنه.
 */
export async function onlineNow(actor: Actor): Promise<Array<{
  id: number;
  name: string;
  state: 'active' | 'idle';
  seen: Date;
}>> {
  const [{ people }, system] = await Promise.all([visiblePeople(actor), getSystemConfig()]);
  if (!system.presenceEnabled || people.length === 0) return [];

  const seen = await presenceSeenFor(people.map((p) => p.id));
  const byId = new Map(people.map((p) => [p.id, p.name]));

  const rows: Array<{ id: number; name: string; state: 'active' | 'idle'; seen: Date }> = [];
  for (const [id, info] of seen) {
    if (info.state !== 'active' && info.state !== 'idle') continue;
    if (!info.seen) continue;
    rows.push({ id, name: byId.get(id) ?? `#${id}`, state: info.state, seen: info.seen });
  }
  return sortOnline(rows);
}

/** دفترها و نقش‌ها برای فیلترهای صفحه. */
export async function filterOptions(actor: Actor): Promise<{
  offices: Array<{ id: number; name: string }>;
  roles: Array<{ id: number; name: string }>;
}> {
  const { scopedToOffices } = await visiblePeople(actor);
  const locale = await currentLocale();
  const [officeRows, roleRows] = await Promise.all([
    db.select({ id: offices.id, name: offices.name }).from(offices).orderBy(offices.name),
    db.select({ id: tags.id, name: tagName(locale) })
      .from(tags).where(eq(tags.type, 'member_role')).orderBy(tags.sortOrder, tags.id),
  ]);
  return {
    // مدیرِ دفتر فقط دفترهای خودش را فیلتر می‌کند — بقیه برایش بی‌معنایند.
    offices: scopedToOffices
      ? officeRows.filter((o) => scopedToOffices.includes(o.id))
      : officeRows,
    roles: roleRows,
  };
}
