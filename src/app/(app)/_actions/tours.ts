'use server';

import { requireActor } from '@/server/auth';
import { canManageSection, isOwner } from '@/domain/access/permissions';
import { assignTours, patchTourState } from '@/server/tours';
import { tourById, TOURS } from '@/tours';
import type { TourPatch } from '@/tours/types';

/**
 * راهنمای تعاملی (۳.۱۹.۰) — ذخیرهٔ پیشرفتِ خودِ کاربر و فرستادنِ راهنما توسطِ مدیر.
 * ⚠️ requireActor در «دیدن به‌جای کاربر» رد می‌کند؛ موتور هم آنجا اصلاً راهنما شروع نمی‌کند.
 */
const ID = /^[a-z0-9-]{1,64}$/;
/** زمانِ ISO، یا `skipped:` + زمان — ⚠️ مقدارِ دلخواه (شیء یا رشتهٔ بلند) فهرستِ راهنما را برای همان کاربر می‌شکست. */
const STAMP = /^(skipped:)?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const isoOk = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

export async function saveTourStateAction(patch: TourPatch): Promise<{ error?: string }> {
  try {
    const actor = await requireActor();
    const clean: TourPatch = {};
    if (patch.done && typeof patch.done === 'object') {
      clean.done = Object.fromEntries(Object.entries(patch.done)
        .filter(([k, v]) => ID.test(k) && !!tourById(k) && typeof v === 'string' && STAMP.test(v)).slice(0, 20));
    }
    if (patch.active === null) clean.active = null;
    else if (patch.active && typeof patch.active.id === 'string' && typeof patch.active.step === 'string'
      && ID.test(patch.active.id) && tourById(patch.active.id) && ID.test(patch.active.step)) {
      clean.active = { id: patch.active.id, step: patch.active.step };
    }
    if (isoOk(patch.snoozeUntil)) clean.snoozeUntil = patch.snoozeUntil;
    if (typeof patch.unassign === 'string' && ID.test(patch.unassign)) clean.unassign = patch.unassign;
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
