'use server';

import { requireActor } from '@/server/auth';
import { canManageSection, isOwner } from '@/domain/access/permissions';
import { assignTours, patchTourState } from '@/server/tours';
import { tourById, TOURS } from '@/tours';
import type { TourState } from '@/tours/types';

/**
 * راهنمای تعاملی (۳.۱۹.۰) — ذخیرهٔ پیشرفتِ خودِ کاربر و فرستادنِ راهنما توسطِ مدیر.
 * ⚠️ requireActor در «دیدن به‌جای کاربر» رد می‌کند؛ موتور هم آنجا اصلاً راهنما شروع نمی‌کند.
 */
const ID = /^[a-z0-9-]{1,64}$/;

export async function saveTourStateAction(patch: TourState): Promise<{ error?: string }> {
  try {
    const actor = await requireActor({ allowOffboarded: true });
    const clean: TourState = {};
    if (patch.done) {
      clean.done = Object.fromEntries(Object.entries(patch.done).filter(([k]) => ID.test(k) && tourById(k)).slice(0, 200));
    }
    if (patch.active === null) clean.active = null;
    else if (patch.active && ID.test(patch.active.id) && tourById(patch.active.id) && /^[a-z0-9-]{1,64}$/.test(patch.active.step)) {
      clean.active = { id: patch.active.id, step: patch.active.step };
    }
    if (patch.assigned) clean.assigned = patch.assigned.filter((k) => ID.test(k) && tourById(k)).slice(0, 100);
    if (typeof patch.snoozeUntil === 'string' && !Number.isNaN(Date.parse(patch.snoozeUntil))) clean.snoozeUntil = patch.snoozeUntil;
    await patchTourState(actor.id, clean);
    return {};
  } catch {
    return { error: 'ذخیره نشد.' };
  }
}

/**
 * «فرستادنِ راهنما» برای اعضا — فقط کسی که اعضا را مدیریت می‌کند (یا مالک). `tourIds` خالی = همهٔ
 * راهنماهای «خوش‌آمد»؛ هر کاربر فقط راهنماهایی را می‌بیند که به نقشش می‌خورد، پس فرستادنِ همه بی‌خطر است.
 */
export async function assignToursAction(userIds: number[], tourIds: string[] = []): Promise<{ error?: string; message?: string }> {
  try {
    const actor = await requireActor();
    if (!isOwner(actor) && !canManageSection(actor, 'members')) return { error: 'اجازهٔ این کار را ندارید.' };
    const ids = [...new Set(userIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
    const tours = tourIds.length ? tourIds.filter((k) => tourById(k)) : TOURS.filter((t) => t.autoStart).map((t) => t.id);
    if (ids.length === 0 || tours.length === 0) return { error: 'چیزی برای فرستادن نیست.' };
    await assignTours(ids, tours);
    return { message: 'راهنما فرستاده شد؛ بارِ بعدِ ورود خودکار باز می‌شود.' };
  } catch {
    return { error: 'راهنما فرستاده نشد.' };
  }
}
