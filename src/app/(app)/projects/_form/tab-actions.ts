'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { redirect } from 'next/navigation';
import {
  addComment, BidError, claimTask, deleteComment, deleteProject, deleteQaItem,
  lightenProject, removeQaRole, setArchived, setTaskStatus, submitBid,
  toggleCommentStatus,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { LightenError, ProjectDeleteError } from '@/domain/projects/lifecycle';
import { BID_MESSAGES } from '@/domain/projects/tender';

/**
 * اقدام‌های تب‌های صفحهٔ پروژه — معادلِ AJAXهای مودالِ نسخهٔ قبلی:
 *
 * ·.
 */

export interface TabActionState {
  error?: string;
  ok?: boolean;
}

export async function setTaskStatusAction(taskId: number, statusTagId: number | null): Promise<TabActionState> {
  try {
    const actor = await requireActor();
    const projectId = await setTaskStatus(actor, taskId, statusTagId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ وضعیتِ تسک ندارید.' };
    return { error: 'وضعیتِ تسک ثبت نشد.' };
  }
  return { ok: true };
}

export async function toggleCommentAction(commentId: number): Promise<TabActionState> {
  try {
    const actor = await requireActor();
    const projectId = await toggleCommentStatus(actor, commentId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ وضعیتِ کامنت ندارید.' };
    return { error: 'وضعیتِ کامنت ثبت نشد.' };
  }
  return { ok: true };
}

export async function addCommentAction(_prev: TabActionState, formData: FormData): Promise<TabActionState> {
  const projectId = Number(formData.get('projectId'));
  const body = String(formData.get('body') ?? '');

  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };
  if (body.trim() === '') return { error: 'متنِ کامنت خالی است.' };

  try {
    const actor = await requireActor();
    await addComment(actor, projectId, body);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ ثبتِ کامنت ندارید.' };
    return { error: 'کامنت ثبت نشد.' };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

export async function setArchivedAction(projectId: number, archived: boolean): Promise<TabActionState> {
  try {
    const actor = await requireActor();
    await setArchived(actor, projectId, archived);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ بایگانی ندارید.' };
    return { error: 'بایگانی ثبت نشد.' };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

/** سبک‌سازی — برگشت‌ناپذیر، فقط روی پروژهٔ بایگانی‌شده (R-PROJ-06). */
export async function lightenAction(projectId: number): Promise<TabActionState> {
  try {
    const actor = await requireActor();
    await lightenProject(actor, projectId);
  } catch (error) {
    if (error instanceof LightenError) {
      return {
        error: error.code === 'not_archived'
          ? 'برای سبک‌سازی، ابتدا پروژه را بایگانی کنید.'
          : 'این پروژه از قبل سبک شده است.',
      };
    }
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ سبک‌سازی ندارید.' };
    return { error: 'سبک‌سازی انجام نشد.' };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

export interface DeleteActionState extends TabActionState {
  /** برای نمایشِ پیامِ دقیقِ هر حالت. */
  code?: 'locked' | 'needs_confirmation' | 'title_mismatch';
}

/** حذفِ پروژه — سه‌حالته (R-PROJ-01/03/04). */
export async function deleteProjectAction(
  _prev: DeleteActionState,
  formData: FormData,
): Promise<DeleteActionState> {
  const projectId = Number(formData.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };

  const rawMode = String(formData.get('mode') ?? '');
  const mode = rawMode === 'full' || rawMode === 'detach' ? rawMode : undefined;
  const confirmTitle = String(formData.get('confirmTitle') ?? '');

  try {
    const actor = await requireActor();
    await deleteProject(actor, projectId, {
      mode,
      confirmTitle,
      // ماندهٔ باز از خودِ داده خوانده می‌شود؛ فعلاً تا فازِ مالی صفر است.
      balances: { clientPartiallyPaid: false, memberPartiallyPaid: false },
    });
  } catch (error) {
    if (error instanceof ProjectDeleteError) {
      const messages = {
        locked: 'به‌دلیل ماندهٔ بازِ کارفرما/عضو، حذف ممکن نیست. ابتدا تسویه یا برگردانید.',
        needs_confirmation: 'این پروژه داده‌ی مالی/کاری دارد؛ روشِ حذف را انتخاب کنید.',
        title_mismatch: 'نامِ پروژه را عیناً تایپ کنید.',
      };
      return { error: messages[error.code], code: error.code };
    }
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ حذفِ پروژه ندارید.' };
    return { error: 'پروژه حذف نشد.' };
  }

  revalidatePath('/projects');
  redirect('/projects');
}

/**
 * برداشتنِ تسک.
 * ⚠️ قاعده‌اش در دامنه است (`canClaimTask`) — اینجا فقط پیام فارسی می‌شود.
 */
export async function claimTaskAction(taskId: number, projectId: number) {
  try {
    await claimTask(await requireActor(), taskId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return {
        error: error.message === 'task.not_claimable'
          ? 'این تسک قابلِ برداشتن نیست.'
          : 'دسترسی ندارید.',
      };
    }
    return { error: 'انجام نشد.' };
  }

  revalidatePath(`/projects/${projectId}`);
  return { message: 'تسک را برداشتید.' };
}

export interface BidState {
  error?: string;
  message?: string;
}

/**
 * ثبت/به‌روزرسانیِ پیشنهادِ مناقصه.
 * ⚠️ سقف و بازبودنِ مناقصه در سرویس دوباره بررسی می‌شوند؛ `max` ِ فرم فقط
 * راهنماست.
 */
export async function submitBidAction(_prev: BidState, formData: FormData): Promise<BidState> {
  const projectId = Number(formData.get('projectId'));
  try {
    await submitBid(await requireActor(), {
      projectId,
      roleTagId: Number(formData.get('roleTagId')),
      amount: String(formData.get('amount') ?? ''),
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    if (error instanceof BidError) return { error: BID_MESSAGES[error.reason] };
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'پیشنهاد ثبت نشد.' };
  }

  revalidatePath(`/projects/${projectId}`);
  return { message: 'پیشنهادِ شما ثبت شد.' };
}

/** حذفِ کامنت یا ریویو — فقط مدیرِ پروژه‌ها. */
export async function deleteCommentAction(commentId: number) {
  try {
    const projectId = await deleteComment(await requireActor(), commentId);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'حذف نشد.' };
  }
  return { message: 'حذف شد.' };
}

/** حذفِ یک آیتمِ چک‌لیستِ QA. */
export async function deleteQaItemAction(itemId: number) {
  try {
    const projectId = await deleteQaItem(await requireActor(), itemId);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'حذف نشد.' };
  }
  return { message: 'حذف شد.' };
}

/** برداشتنِ همهٔ آیتم‌های QA ِ یک نقش (`null` = کارفرما). */
export async function removeQaRoleAction(projectId: number, roleTagId: number | null) {
  try {
    await removeQaRole(await requireActor(), projectId, roleTagId);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'حذف نشد.' };
  }
  return { message: 'آیتم‌های این نقش برداشته شد.' };
}
