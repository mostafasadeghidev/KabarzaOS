'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  addUnitEntry, cancelRequest, createRequest, deleteUnitEntry,
  MemberMoneyError, requestForUnit,
} from '@/server/finance/member-service';
import { ForbiddenError } from '@/domain/access/guard';
import { REQUEST_MESSAGES } from '@/domain/finance/member-money';

/**
 * اکشن‌های «پولِ من» — کارکردِ تعدادی و درخواستِ پرداخت.
 * ⚠️ گاردها در سرویس‌اند (R-ARCH-01)؛ اینجا فقط پیام فارسی می‌شود.
 */

export interface MoneyState {
  error?: string;
  message?: string;
}

function message(error: unknown): string {
  if (error instanceof MemberMoneyError) {
    if (error.reason === 'quantity_invalid') return 'تعداد باید عددِ صحیحِ دستِ‌کم ۱ باشد.';
    if (error.reason === 'not_member') return 'این شخص عضوِ این پروژه نیست.';
    if (error.reason === 'not_yours') return 'این ردیف مالِ شما نیست.';
    if (error.reason === 'frozen') return 'پروژه بایگانی شده و تغییر نمی‌پذیرد.';
    return REQUEST_MESSAGES[error.reason] ?? 'انجام نشد.';
  }
  if (error instanceof ForbiddenError) return 'دسترسی ندارید.';
  return 'انجام نشد.';
}

export async function addUnitAction(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const projectId = Number(formData.get('projectId'));
  try {
    await addUnitEntry(await requireActor(), {
      projectId,
      // مدیر می‌تواند برای عضوِ دیگری ثبت کند؛ سرویس این را گارد می‌کند.
      userId: Number(formData.get('userId') ?? 0),
      entryDate: String(formData.get('entryDate') ?? ''),
      quantity: Number(formData.get('quantity') ?? 0),
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'کارکرد ثبت شد.' };
}

export async function deleteUnitAction(entryId: number, projectId: number): Promise<MoneyState> {
  try {
    await deleteUnitEntry(await requireActor(), entryId);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'حذف شد.' };
}

/** درخواستِ پرداخت برای یک ردیفِ کارکرد — مبلغش خودِ ردیف است. */
export async function requestUnitAction(entryId: number, projectId: number): Promise<MoneyState> {
  try {
    await requestForUnit(await requireActor(), entryId);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'درخواست ثبت شد.' };
}

export async function requestPaymentAction(
  _prev: MoneyState,
  formData: FormData,
): Promise<MoneyState> {
  const projectId = Number(formData.get('projectId'));
  try {
    await createRequest(await requireActor(), {
      projectId,
      amount: String(formData.get('amount') ?? ''),
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'درخواست ثبت شد.' };
}

export async function cancelRequestAction(requestId: number, projectId: number): Promise<MoneyState> {
  try {
    await cancelRequest(await requireActor(), requestId);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'درخواست لغو شد.' };
}
