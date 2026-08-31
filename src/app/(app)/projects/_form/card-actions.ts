'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { addProjectClient, addProjectMember, setProjectStatus } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';

/**
 * اقدام‌های سریعِ روی کارتِ پروژه — معادلِ سه AJAX ِ نسخهٔ قبلی:
 *.
 *
 * هیچ گاردی اینجا نیست (R-ARCH-01) — همه در سرویس.
 */

export interface CardActionState {
  error?: string;
  ok?: boolean;
}

export async function setStatusAction(projectId: number, statusTagId: number | null): Promise<CardActionState> {
  try {
    const actor = await requireActor();
    await setProjectStatus(actor, projectId, statusTagId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ وضعیت ندارید.' };
    return { error: 'وضعیت ثبت نشد.' };
  }
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function addMemberAction(_prev: CardActionState, formData: FormData): Promise<CardActionState> {
  const projectId = Number(formData.get('projectId'));
  const userId = Number(formData.get('userId'));
  const roleRaw = Number(formData.get('roleTagId'));
  const amount = String(formData.get('amount') ?? '').trim();

  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };
  if (!Number.isInteger(userId) || userId <= 0) return { error: 'عضوی انتخاب نشده.' };
  if (amount !== '' && !/^\d+(\.\d{1,4})?$/.test(amount)) return { error: 'مبلغ معتبر نیست.' };

  try {
    const actor = await requireActor();
    await addProjectMember(actor, projectId, {
      userId,
      roleTagId: Number.isInteger(roleRaw) && roleRaw > 0 ? roleRaw : null,
      agreedAmount: amount === '' ? '0' : amount,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ افزودنِ عضو ندارید.' };
    return { error: 'عضو اضافه نشد.' };
  }
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function addClientAction(_prev: CardActionState, formData: FormData): Promise<CardActionState> {
  const projectId = Number(formData.get('projectId'));
  const userId = Number(formData.get('userId'));

  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };
  if (!Number.isInteger(userId) || userId <= 0) return { error: 'کارفرمایی انتخاب نشده.' };

  try {
    const actor = await requireActor();
    await addProjectClient(actor, projectId, userId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ افزودنِ کارفرما ندارید.' };
    return { error: 'کارفرما اضافه نشد.' };
  }
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
