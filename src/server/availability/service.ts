import { asc, eq, inArray } from 'drizzle-orm';
import { presenceFor } from '@/server/people/presence-service';
import { avatarsFor } from '@/server/files/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { db } from '@/db/client';
import { availabilitySlots, userRoles, users } from '@/db/schema';
import { can, canManageSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { planWeek, slotsByWeekday, type Slot } from '@/domain/availability/weekly';

/**
 * در دسترس بودنِ هفتگی.
 * ⚠️ ویرایش فقط برای **خودِ شخص** یا مدیرِ اعضا؛ ماتریسِ تیمی پشتِ
 * `members.view`.
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
 * ماتریسِ هفتگیِ تیم — «چه کسی جمعه هست و چه ساعتی».
 * ⚠️ دو کوئریِ ثابت، نه یکی به‌ازای هر نفر (R-PERF-01).
 */
export async function teamMatrix(actor: Actor) {
  if (!can(actor, 'members.view')) throw new ForbiddenError('members.view');

  const people = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(userRoles.role, 'member'))
    .orderBy(users.name);

  if (people.length === 0) return [];

  /**
   * ⚠️ نقطهٔ حضور و آواتار روی ماتریس هم لازم‌اند — نسخهٔ قبلی در همین جدول
   * هر دو را دارد. بدونشان ماتریس
   * فقط فهرستی از نام است و نمی‌شود دید چه کسی همین حالا هست.
   *
   * ⚠️ `presenceFor()` خودش تنظیمِ خاموش‌بودنِ حضور را **نمی‌بیند**، پس
   * بررسی اینجا انجام می‌شود: حضورِ خاموش یعنی هیچ نقطه‌ای، نه نقطهٔ
   * خاکستری با دادهٔ کهنه.
   */
  const ids = people.map((p) => p.id);
  const [presence, avatars, system] = await Promise.all([
    presenceFor(ids),
    avatarsFor(ids),
    getSystemConfig(),
  ]);

  const rows = await db
    .select({
      userId: availabilitySlots.userId,
      weekday: availabilitySlots.weekday,
      from: availabilitySlots.fromTime,
      to: availabilitySlots.toTime,
    })
    .from(availabilitySlots)
    .where(inArray(availabilitySlots.userId, people.map((p) => p.id)))
    .orderBy(asc(availabilitySlots.weekday), asc(availabilitySlots.fromTime));

  const byUser = new Map<number, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  return people.map((p) => ({
    id: p.id,
    name: p.name,
    presence: system.presenceEnabled ? presence.get(p.id) ?? null : null,
    avatarFileId: avatars.get(p.id) ?? null,
    // ⚠️ نقشهٔ خالی یعنی «برنامه‌ای نداده»، نه «تمام هفته آزاد».
    hasSchedule: byUser.has(p.id),
    days: slotsByWeekday(byUser.get(p.id) ?? []),
  }));
}
