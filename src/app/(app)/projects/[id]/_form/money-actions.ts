'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  addUnitEntry, cancelRequest, createRequest, deleteUnitEntry,
  MemberMoneyError, renameUnitEntry, requestForUnit, setUnitEntryAmount, setUnitEntryStatus,
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
    if (error.reason === 'not_unit_based') return 'این پروژه تعدادی نیست؛ ردیفِ کارکرد فقط برای پروژهٔ تعدادی ثبت می‌شود.';
    if (error.reason === 'not_member') return 'این شخص عضوِ این پروژه نیست.';
    if (error.reason === 'not_yours') return 'این ردیف مالِ شما نیست.';
    if (error.reason === 'frozen') return 'پروژه بایگانی شده و تغییر نمی‌پذیرد.';
    if (error.reason === 'amount_invalid') return 'مبلغ معتبر نیست؛ فقط عددِ مثبت با حداکثر چهار رقمِ اعشار.';
    if (error.reason === 'amount_forbidden') return 'تعیینِ مبلغِ ردیف برای این پروژه فعال نیست یا اجازه‌اش را ندارید.';
    if (error.reason === 'name_taken') return 'این نام در همین پروژه برای ردیفِ دیگری استفاده شده؛ نامِ دیگری بگذارید.';
    if (error.reason === 'status_invalid') return 'وضعیتِ انتخاب‌شده معتبر نیست.';
    if (error.reason === 'name_invalid') return 'نامِ ردیف بیش از ۸۰ نویسه است.';
    if (error.reason === 'not_editable') return 'مبلغِ ردیفِ درخواست‌شده یا پرداخت‌شده را نمی‌شود عوض کرد.';
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
      // خالی = از نرخِ توافقی پیروی کن (۲.۲۰.۰)؛ سرویس اجازه‌اش را گارد می‌کند.
      amount: String(formData.get('amount') ?? ''),
      // نامِ یکتای ردیف (۲.۲۱.۰) — اختیاری.
      name: String(formData.get('name') ?? ''),
      // وضعیتِ کار (۲.۲۲.۰) — خالی = «شروع نشده» ِ پیش‌فرض.
      workStatusTagId: Number(formData.get('workStatusTagId') ?? 0) || null,
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'کارکرد ثبت شد.' };
}

/** عوض‌کردنِ وضعیتِ کارِ یک ردیف (۲.۲۲.۰) — روی وضعیتِ خودِ پروژه اثری ندارد. */
export async function setUnitStatusAction(entryId: number, projectId: number, statusTagId: number | null): Promise<MoneyState> {
  try {
    await setUnitEntryStatus(await requireActor(), entryId, statusTagId);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/hours');
  return { message: 'وضعیت ذخیره شد.' };
}

/** عوض‌کردنِ نامِ یک ردیف — مسئولِ پروژه یا صاحبِ ردیف (۲.۲۱.۰). */
export async function renameUnitAction(entryId: number, projectId: number, name: string): Promise<MoneyState> {
  try {
    await renameUnitEntry(await requireActor(), entryId, name);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/hours');
  return { message: 'نام ذخیره شد.' };
}

/** عوض‌کردنِ مبلغِ یک ردیفِ پرداخت‌نشده — فقط مسئولِ پروژه (۲.۲۰.۰). */
export async function setUnitAmountAction(entryId: number, projectId: number, amount: string): Promise<MoneyState> {
  try {
    await setUnitEntryAmount(await requireActor(), entryId, amount);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { message: 'مبلغ ذخیره شد.' };
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
