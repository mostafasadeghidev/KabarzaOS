import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { effectivePermissions, isOwner, type Actor } from '@/domain/access/permissions';
import { hasTeamScope } from '@/server/team/service';
import { pmProjectIds } from '@/server/projects/authority';
import { canUseTimesheet } from '@/server/timelogs/service';
import type { TourCtx, TourState } from '@/tours/types';

/**
 * راهنمای تعاملی (۳.۱۹.۰) — سمتِ سرور: شناختنِ نقشِ کاربر برای انتخابِ راهنماها و نگه‌داشتنِ پیشرفتش.
 * ⚠️ نقش‌های «مدیرِ تیم» و «مدیرِ پروژه» نقشِ پایه نیستند (تگ روی دفتر/پروژه‌اند)، پس همین‌جا سنجیده می‌شوند.
 */
export async function tourCtx(actor: Actor): Promise<TourCtx> {
  const [managesTeam, pm, timesheet] = await Promise.all([
    hasTeamScope(actor).catch(() => false),
    pmProjectIds(actor.id).catch(() => [] as number[]),
    canUseTimesheet(actor).catch(() => false),
  ]);
  return {
    roles: actor.roles,
    perms: [...effectivePermissions(actor)],
    isOwner: isOwner(actor),
    managesTeam,
    isPm: pm.length > 0,
    isMember: actor.roles.includes('member'),
    isClientOnly: actor.roles.includes('client') && !actor.roles.includes('member'),
    usesTimesheet: timesheet,
  };
}

export async function getTourState(userId: number): Promise<TourState> {
  const [row] = await db.select({ s: users.tourState }).from(users).where(eq(users.id, userId));
  return (row?.s ?? {}) as TourState;
}

/** ادغامِ سطحِ اول (done/active/assigned/snoozeUntil) — بی‌دست زدن به بقیه. */
export async function patchTourState(userId: number, patch: TourState): Promise<void> {
  await db.update(users).set({
    tourState: sql`${users.tourState} || ${JSON.stringify(patch)}::jsonb`,
  }).where(eq(users.id, userId));
}

/**
 * فرستادنِ راهنما برای چند نفر (مدیر): به `assigned` اضافه و از `done` برداشته می‌شود تا بارِ بعدِ ورود
 * خودکار شروع شود، حتی اگر قبلاً دیده باشد. «بعداً» هم پاک می‌شود.
 */
export async function assignTours(userIds: number[], tourIds: string[]): Promise<void> {
  if (userIds.length === 0 || tourIds.length === 0) return;
  const rows = await db.select({ id: users.id, s: users.tourState }).from(users).where(inArray(users.id, userIds));
  for (const r of rows) {
    const s = (r.s ?? {}) as TourState;
    const done = { ...(s.done ?? {}) };
    for (const t of tourIds) delete done[t];
    const assigned = [...new Set([...(s.assigned ?? []), ...tourIds])];
    await db.update(users).set({ tourState: { ...s, done, assigned, snoozeUntil: undefined } as Record<string, unknown> }).where(eq(users.id, r.id));
  }
}
