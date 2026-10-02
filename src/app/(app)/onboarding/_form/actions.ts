'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import {
  addCustomTask, deleteTask, ONBOARDING_MESSAGES, OnboardingError, startOnboarding, toggleTask,
} from '@/server/onboarding/service';

/** اقدام‌های آنبوردینگ. گاردها در سرویس‌اند (R-ARCH-01). */

export interface OnboardingState {
  error?: string;
  message?: string;
}

function explain(error: unknown, fallback: string): string {
  if (error instanceof OnboardingError) return ONBOARDING_MESSAGES[error.code];
  if (error instanceof ForbiddenError) return 'اجازهٔ این کار را ندارید.';
  return fallback;
}

/** صفحهٔ آنبوردینگ، صفحهٔ آن نفر و داشبورد (کارتِ عضو) همه تازه شوند. */
function refresh(userId?: number) {
  revalidatePath('/onboarding');
  if (userId) revalidatePath(`/onboarding/${userId}`);
  revalidatePath('/dashboard');
}

const num = (v: FormDataEntryValue | null): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function startOnboardingAction(userId: number): Promise<OnboardingState> {
  try {
    const added = await startOnboarding(await requireActor(), userId);
    refresh(userId);
    return added > 0
      ? { message: 'آنبوردینگ ساخته شد.' }
      : { message: 'آیتمِ تازه‌ای در کتابخانه برای این نفر نبود.' };
  } catch (error) {
    return { error: explain(error, 'آنبوردینگ ساخته نشد.') };
  }
}

export async function toggleTaskAction(taskId: number, done: boolean): Promise<OnboardingState> {
  try {
    const userId = await toggleTask(await requireActor(), taskId, done);
    refresh(userId);
    return {};
  } catch (error) {
    return { error: explain(error, 'ذخیره نشد.') };
  }
}

export async function deleteTaskAction(taskId: number): Promise<OnboardingState> {
  try {
    const userId = await deleteTask(await requireActor(), taskId);
    refresh(userId);
    return { message: 'حذف شد.' };
  } catch (error) {
    return { error: explain(error, 'حذف نشد.') };
  }
}

export async function addCustomTaskAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const userId = num(formData.get('userId'));
  if (!userId) return { error: 'پیدا نشد.' };
  try {
    await addCustomTask(await requireActor(), userId, {
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? ''),
      kind: String(formData.get('kind') ?? 'task'),
      assigneeUserId: num(formData.get('assigneeUserId')),
      serviceId: num(formData.get('serviceId')),
      newServiceName: formData.get('serviceId') === '__new__' ? String(formData.get('newServiceName') ?? '') : '',
      dueDate: String(formData.get('dueDate') ?? ''),
      link: String(formData.get('link') ?? ''),
    });
    refresh(userId);
    return { message: 'آیتم اضافه شد.' };
  } catch (error) {
    return { error: explain(error, 'آیتم اضافه نشد.') };
  }
}
