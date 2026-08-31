'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  addAttachment, addLink, deleteAttachment, setProjectThumbnail,
} from '@/server/files/service';
import { ForbiddenError } from '@/domain/access/guard';
import { FileRejected, rejectMessage } from '@/domain/files/upload';

/**
 * اکشن‌های فایل.
 * ⚠️ هیچ گاردی اینجا نیست — همه در سرویس‌اند (R-ARCH-01). اینجا فقط فرم را
 * باز می‌کنیم و خطا را به پیامِ فارسی تبدیل می‌کنیم.
 */

export interface FileFormState {
  error?: string;
  message?: string;
}

function message(error: unknown): string {
  // دلیلِ ردِ فایل به کاربر گفته می‌شود — «انجام نشد» او را سردرگم می‌کند.
  if (error instanceof FileRejected) return rejectMessage(error.reason);
  if (error instanceof ForbiddenError) {
    if (error.message === 'link.invalid') return 'نشانی معتبر نیست؛ فقط http و https پذیرفته می‌شوند.';
    if (error.message === 'attachment.not_yours') return 'فقط بارگذارنده یا مدیرِ پروژه می‌تواند حذف کند.';
    return 'برای این کار دسترسی ندارید.';
  }
  return 'انجام نشد.';
}

/** خواندنِ فایلِ فرم به بایت — سرویس روی همین بایت‌ها امضا را بررسی می‌کند. */
async function toBlob(file: File) {
  return {
    name: file.name,
    mime: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export async function uploadAttachmentAction(
  _prev: FileFormState,
  formData: FormData,
): Promise<FileFormState> {
  const projectId = Number(formData.get('projectId'));
  const label = String(formData.get('label') ?? '');
  const picked = formData.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);

  if (picked.length === 0) return { error: 'فایلی انتخاب نشده است.' };

  try {
    const actor = await requireActor();
    // چند فایل: مثلِ نسخهٔ قبلی، برچسب شماره می‌گیرد تا نام‌ها یکی نشوند.
    for (const [index, file] of picked.entries()) {
      const name = picked.length > 1 && label ? `${label} ${index + 1}` : label;
      await addAttachment(actor, projectId, await toBlob(file), name);
    }
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath(`/projects/${projectId}`);
  return { message: picked.length > 1 ? `${picked.length} فایل بارگذاری شد.` : 'فایل بارگذاری شد.' };
}

export async function addLinkAction(
  _prev: FileFormState,
  formData: FormData,
): Promise<FileFormState> {
  const projectId = Number(formData.get('projectId'));

  try {
    await addLink(
      await requireActor(),
      projectId,
      String(formData.get('url') ?? ''),
      String(formData.get('label') ?? ''),
    );
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath(`/projects/${projectId}`);
  return { message: 'لینک ثبت شد.' };
}

export async function deleteAttachmentAction(attachmentId: number, projectId: number) {
  try {
    await deleteAttachment(await requireActor(), attachmentId);
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath(`/projects/${projectId}`);
  return { message: 'حذف شد.' };
}

export async function setThumbnailAction(
  _prev: FileFormState,
  formData: FormData,
): Promise<FileFormState> {
  const projectId = Number(formData.get('projectId'));
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'تصویری انتخاب نشده است.' };

  try {
    await setProjectThumbnail(await requireActor(), projectId, await toBlob(file));
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { message: 'تصویرِ شاخص ثبت شد.' };
}
