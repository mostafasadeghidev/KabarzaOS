import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { effectivePermissions, isOwner, type Actor } from '@/domain/access/permissions';
import { hasTeamScope } from '@/server/team/service';
import { pmProjectIds } from '@/server/projects/authority';
import { canUseTimesheet } from '@/server/timelogs/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { isCorpMailConfigured } from '@/server/corp-mail/jmap';
import { activeCloudConnections } from '@/server/cloud/connections';
import type { TourCtx, TourPatch, TourState } from '@/tours/types';

/**
 * راهنمای تعاملی (۳.۱۹.۰) — سمتِ سرور: شناختنِ نقشِ کاربر برای انتخابِ راهنماها و نگه‌داشتنِ پیشرفتش.
 * ⚠️ نقش‌های «مدیرِ تیم» و «مدیرِ پروژه» نقشِ پایه نیستند (تگ روی دفتر/پروژه‌اند)، پس همین‌جا سنجیده می‌شوند.
 */
export async function tourCtx(actor: Actor, pre?: {
  /** همان مقدارهایی که چیدمان خودش حساب کرده — تا هر درخواست دوباره کوئری نزند (بازبینیِ ۳.۱۹.۰). */
  managesTeam?: boolean; usesTimesheet?: boolean; onboarding?: boolean;
}): Promise<TourCtx> {
  const perms = effectivePermissions(actor);
  // اتصالِ فضای ابری فقط برای کسی که راهنمای «دسترسی‌ها» را می‌بیند لازم است.
  const needsCloud = isOwner(actor) || perms.has('members.manage');
  const [managesTeam, pm, timesheet, sys, clouds] = await Promise.all([
    pre?.managesTeam ?? hasTeamScope(actor).catch(() => false),
    pmProjectIds(actor.id).catch(() => [] as number[]),
    pre?.usesTimesheet ?? canUseTimesheet(actor).catch(() => false),
    pre?.onboarding !== undefined ? null : getSystemConfig().catch(() => null),
    needsCloud ? activeCloudConnections().catch(() => []) : [],
  ]);
  return {
    roles: actor.roles,
    perms: [...perms],
    isOwner: isOwner(actor),
    managesTeam,
    isPm: pm.length > 0,
    isMember: actor.roles.includes('member'),
    isClientOnly: actor.roles.includes('client') && !actor.roles.includes('member'),
    usesTimesheet: timesheet,
    onboarding: pre?.onboarding ?? !!sys?.onboardingEnabled,
    corpMail: (() => { try { return isCorpMailConfigured(); } catch { return false; } })(),
    cloud: clouds.length > 0,
  };
}

export async function getTourState(userId: number): Promise<TourState> {
  const [row] = await db.select({ s: users.tourState }).from(users).where(eq(users.id, userId));
  return (row?.s ?? {}) as TourState;
}

/**
 * ادغامِ اتمیِ یک تغییر روی مقدارِ **فعلیِ** پایگاه‌داده (نه روی state ِ مرورگر):
 *  · `done` کلید‌به‌کلید ادغام می‌شود؛ · `unassign` فقط همان یک راهنما را از `assigned` برمی‌دارد؛
 *  · `active` و `snoozeUntil` جایگزین می‌شوند.
 */
export async function patchTourState(userId: number, patch: TourPatch): Promise<void> {
  const top: Record<string, unknown> = {};
  if ('active' in patch) top.active = patch.active ?? null;
  if (patch.snoozeUntil !== undefined) top.snoozeUntil = patch.snoozeUntil;
  const cur = sql`coalesce(${users.tourState}, '{}'::jsonb)`;
  await db.update(users).set({
    tourState: sql`${cur} || ${JSON.stringify(top)}::jsonb
      || jsonb_build_object('done', coalesce(${cur}->'done', '{}'::jsonb) || ${JSON.stringify(patch.done ?? {})}::jsonb)
      || jsonb_build_object('assigned', coalesce((
           select jsonb_agg(x) from jsonb_array_elements_text(coalesce(${cur}->'assigned', '[]'::jsonb)) as x
           where x is distinct from ${patch.unassign ?? null}::text
         ), '[]'::jsonb))`,
  }).where(eq(users.id, userId));
}

/**
 * فرستادنِ راهنما برای چند نفر (مدیر): به `assigned` اضافه و از `done` برداشته می‌شود تا بارِ بعدِ ورود
 * خودکار شروع شود، حتی اگر قبلاً دیده باشد. «بعداً» هم پاک می‌شود.
 */
export async function assignTours(userIds: number[], tourIds: string[]): Promise<void> {
  if (userIds.length === 0 || tourIds.length === 0) return;
  // ⚠️ یک UPDATE ِ اتمی برای همه (بازبینیِ ۳.۱۹.۰): پیش از این برای هر نفر جدا خوانده و کامل نوشته می‌شد؛
  // ذخیرهٔ هم‌زمانِ خودِ کاربر یکی از دو نوشتن را پاک می‌کرد، و ۵۰۰ نفر ۵۰۰ UPDATE بود.
  const tours = sql`${`{${tourIds.join(',')}}`}::text[]`;
  const cur = sql`coalesce(${users.tourState}, '{}'::jsonb)`;
  await db.update(users).set({
    tourState: sql`(${cur} - 'snoozeUntil')
      || jsonb_build_object('done', coalesce(${cur}->'done', '{}'::jsonb) - ${tours})
      || jsonb_build_object('assigned', (
           select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
             select jsonb_array_elements_text(coalesce(${cur}->'assigned', '[]'::jsonb)) as x
             union select unnest(${tours})
           ) as s
         ))`,
  }).where(inArray(users.id, userIds));
}
