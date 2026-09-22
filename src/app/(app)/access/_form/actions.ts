'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import * as access from '@/server/access/service';
import { AccessError, accessMessage } from '@/domain/access/service-grants';
import { ForbiddenError } from '@/domain/access/guard';

/** اقدام‌های دفترِ دسترسی‌ها. گاردها در سرویس‌اند (R-ARCH-01). */

export interface AccessState {
  error?: string;
  ok?: boolean;
}

function explain(error: unknown, fallback: string): string {
  if (error instanceof AccessError) return accessMessage(error.code);
  if (error instanceof ForbiddenError) return 'دسترسی کافی ندارید.';
  return fallback;
}

async function run(
  fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<unknown>,
  fallback: string,
): Promise<AccessState> {
  try {
    await fn(await requireActor());
  } catch (error) {
    return { error: explain(error, fallback) };
  }
  revalidatePath('/access');
  // کارتِ «دسترسی‌های من» در پروفایل از همین داده می‌خواند.
  revalidatePath('/profile');
  return { ok: true };
}

const num = (v: FormDataEntryValue | null): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ---- سرویس‌ها ---- */

export async function saveServiceAction(_prev: AccessState, formData: FormData) {
  return run((actor) => access.saveService(actor, {
    id: num(formData.get('id')),
    name: String(formData.get('name') ?? ''),
    kind: String(formData.get('kind') ?? 'other'),
    ownerUserId: num(formData.get('ownerUserId')),
    adminUrl: String(formData.get('adminUrl') ?? ''),
    note: String(formData.get('note') ?? ''),
    /**
     * ⚠️ چک‌باکسِ تیک‌نخورده اصلاً در FormData نیست. در افزودنِ تازه هم
     * همین است، پس پیش‌فرضِ فرم تیک‌خورده می‌آید تا سرویسِ نو فعال باشد.
     */
    isActive: formData.get('isActive') !== null,
    /**
     * ⚠️ نبودنِ فیلد با «پاک‌کن» یکی نیست: فرمِ کسی که هزینه را نمی‌بیند
     * این ورودی را ندارد. سرویس در آن حالت مقدارِ قبلی را نگه می‌دارد.
     */
    recurringExpenseId: num(formData.get('recurringExpenseId')),
  }), 'سرویس ذخیره نشد.');
}

export async function deleteServiceAction(id: number) {
  return run((actor) => access.deleteService(actor, id), 'سرویس غیرفعال نشد.');
}

/* ---- اعطا و قطع ---- */

export async function grantAccessAction(_prev: AccessState, formData: FormData) {
  return run((actor) => access.grantAccess(actor, {
    serviceId: num(formData.get('serviceId')),
    userId: num(formData.get('userId')),
    accountRef: String(formData.get('accountRef') ?? ''),
    level: String(formData.get('level') ?? 'member'),
    vaultRef: String(formData.get('vaultRef') ?? ''),
    note: String(formData.get('note') ?? ''),
  }), 'دسترسی ثبت نشد.');
}

export async function revokeAccessAction(grantId: number) {
  return run((actor) => access.revokeAccess(actor, grantId), 'دسترسی قطع نشد.');
}

/** قطعِ گروهی — چک‌لیستِ خروجِ عضو. */
export async function revokeManyAction(grantIds: number[]) {
  return run((actor) => access.revokeMany(actor, grantIds), 'دسترسی‌ها قطع نشدند.');
}
