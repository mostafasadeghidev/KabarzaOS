'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { applyQa, approveBid, toggleQaItem, withdrawBid } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { QaAudience } from '@/domain/projects/qa';

/**
 * اقدام‌های QA و مناقصه.
 * ·.
 */

export interface QaActionState {
  error?: string;
  ok?: boolean;
  added?: number;
}

export async function applyQaAction(_prev: QaActionState, formData: FormData): Promise<QaActionState> {
  const projectId = Number(formData.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };

  // مخاطب‌ها: شناسهٔ نقش، یا توکنِ «client» برای کارفرما (R-QA-02).
  const audiences: QaAudience[] = formData.getAll('audience').map((raw) => {
    const value = String(raw);
    if (value === 'client') return 'client';
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : 0;
  });

  if (audiences.length === 0) return { error: 'دستِ‌کم یک نقش یا «کارفرما» را انتخاب کنید.' };

  try {
    const actor = await requireActor();
    const result = await applyQa(actor, projectId, audiences);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
    return { ok: true, added: result.added };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ اعمالِ چک‌لیست ندارید.' };
    return { error: 'چک‌لیست اعمال نشد.' };
  }
}

export async function toggleQaAction(qaId: number): Promise<QaActionState> {
  try {
    const actor = await requireActor();
    const projectId = await toggleQaItem(actor, qaId);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ چک‌لیست ندارید.' };
    return { error: 'تیک ثبت نشد.' };
  }
  return { ok: true };
}

export async function approveBidAction(bidId: number, projectId: number): Promise<QaActionState> {
  try {
    const actor = await requireActor();
    await approveBid(actor, bidId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
  } catch (error) {
    if (error instanceof ForbiddenError) {
      // تنها دلیلِ ممنوعیت در این مسیر، بسته‌بودنِ مناقصه است.
      return { error: 'مناقصه دیگر باز نیست؛ پس از شروعِ کار برنده عوض نمی‌شود.' };
    }
    return { error: 'پیشنهاد تأیید نشد.' };
  }
  return { ok: true };
}

export async function withdrawBidAction(bidId: number, projectId: number): Promise<QaActionState> {
  try {
    const actor = await requireActor();
    await withdrawBid(actor, bidId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ پس‌گرفتنِ پیشنهاد ندارید.' };
    return { error: 'پیشنهاد پس گرفته نشد.' };
  }
  return { ok: true };
}
