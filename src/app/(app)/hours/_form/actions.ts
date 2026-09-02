'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  addOrMerge, confirmPending, deleteLog, discardPending, resumePending,
  startTimer, stopTimer, TimerError, updateLog,
} from '@/server/timelogs/service';
import { ForbiddenError } from '@/domain/access/guard';
import { minutesFrom } from '@/domain/timelogs/timer';

/**
 * اکشن‌های تایمر و ثبتِ ساعت.
 * ⚠️ گاردها در سرویس‌اند (R-ARCH-01)؛ اینجا فقط خطا فارسی می‌شود.
 */

export interface HoursState {
  error?: string;
  message?: string;
}

function message(error: unknown): string {
  if (error instanceof TimerError) {
    if (error.code === 'already_running') return 'یک تایمر در جریان است؛ اول تعیینِ تکلیفش کنید.';
    if (error.code === 'not_running') return 'تایمری در جریان نیست.';
    return 'تایمرِ منتظرِ تأییدی وجود ندارد.';
  }
  if (error instanceof ForbiddenError) {
    if (error.message === 'timelog.not_yours') return 'فقط صاحبِ ثبت می‌تواند تغییرش دهد.';
    if (error.message === 'timelog.window_closed') return 'پنجرهٔ ویرایشِ این ثبت (دو هفته) بسته شده است.';
    return 'روی این پروژه اجازهٔ ثبتِ ساعت ندارید.';
  }
  return 'انجام نشد.';
}

/** همهٔ صفحه‌هایی که عددِ ساعت را نشان می‌دهند. */
function revalidateAll() {
  revalidatePath('/hours');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
}

/** `''` در فرم یعنی ساعتِ عمومی (بدونِ پروژه) — نه «انتخاب نشده». */
function readProjectId(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? '');
  return value === '' ? null : Number(value);
}

export async function startTimerAction(_prev: HoursState, formData: FormData): Promise<HoursState> {
  try {
    await startTimer(await requireActor(), readProjectId(formData.get('projectId')));
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return { message: 'تایمر شروع شد.' };
}

export async function stopTimerAction(_prev: HoursState, formData: FormData): Promise<HoursState> {
  let parked = false;
  try {
    const result = await stopTimer(await requireActor(), String(formData.get('description') ?? ''));
    parked = result.parked;
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return {
    message: parked
      ? 'بیش از ۵ ساعت شمرده شد؛ برای ثبت، مدت را تأیید یا اصلاح کنید.'
      : 'ساعت ثبت شد.',
  };
}

export async function confirmPendingAction(_prev: HoursState, formData: FormData): Promise<HoursState> {
  const minutes = minutesFrom(Number(formData.get('hours') ?? 0), Number(formData.get('minutes') ?? 0));
  try {
    await confirmPending(await requireActor(), minutes);
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return { message: 'ساعت ثبت شد.' };
}

export async function resumePendingAction(): Promise<HoursState> {
  try {
    await resumePending(await requireActor());
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return { message: 'تایمر ادامه یافت.' };
}

export async function discardPendingAction(): Promise<HoursState> {
  await discardPending(await requireActor());
  revalidateAll();
  return { message: 'دور انداخته شد.' };
}

export async function logHoursAction(_prev: HoursState, formData: FormData): Promise<HoursState> {
  const minutes = minutesFrom(Number(formData.get('hours') ?? 0), Number(formData.get('minutes') ?? 0));
  if (minutes <= 0) return { error: 'مدت را وارد کنید.' };

  try {
    await addOrMerge(await requireActor(), {
      projectId: readProjectId(formData.get('projectId')),
      logDate: String(formData.get('logDate') ?? ''),
      minutes,
      description: String(formData.get('description') ?? ''),
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return { message: 'ساعت ثبت شد.' };
}

export async function updateLogAction(_prev: HoursState, formData: FormData): Promise<HoursState> {
  const minutes = minutesFrom(Number(formData.get('hours') ?? 0), Number(formData.get('minutes') ?? 0));
  try {
    await updateLog(await requireActor(), Number(formData.get('logId')), {
      minutes,
      description: String(formData.get('description') ?? ''),
      logDate: formData.has('logDate') ? String(formData.get('logDate') ?? '') : undefined,
      projectId: formData.has('projectId') ? readProjectId(formData.get('projectId')) : undefined,
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return { message: 'به‌روزرسانی شد.' };
}

export async function deleteLogAction(logId: number): Promise<HoursState> {
  try {
    await deleteLog(await requireActor(), logId);
  } catch (error) {
    return { error: message(error) };
  }
  revalidateAll();
  return { message: 'حذف شد.' };
}
