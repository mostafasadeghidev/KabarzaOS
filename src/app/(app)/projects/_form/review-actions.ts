'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  addReviewItem, addReviewMedia, createReview, deleteReview, getReview, reviewFormOptions, updateReview,
  type ReviewInput,
} from '@/server/projects/reviews';
import { taskStatusOptionsFor } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { FrozenProjectError } from '@/server/projects/authority';
import { REVIEW_SOURCES, type ReviewSource } from '@/db/schema/projects';
import { parseTimestamp } from '@/domain/files/video';
import { mediaError, mediaFrom } from './media-form';

/**
 * اقدام‌های بازبینی — فقط بازکردنِ فرم و ترجمهٔ خطا؛ گاردها در سرویس‌اند (R-ARCH-01).
 */

export interface ReviewFormState {
  error?: string;
  ok?: boolean;
  /** شناسهٔ بازبینیِ تازه — تب مستقیم بازش می‌کند. */
  reviewId?: number;
}

const FROZEN = 'این پروژه بایگانی/بسته است و تغییر نمی‌پذیرد.';

function message(error: unknown, fallback: string): string {
  const rejected = mediaError(error);
  if (rejected) return rejected;
  if (error instanceof FrozenProjectError) return FROZEN;
  if (error instanceof ForbiddenError) {
    if (error.required === 'review.title') return 'عنوانِ بازبینی الزامی است.';
    if (error.required === 'link.invalid') return 'نشانی معتبر نیست؛ فقط http و https پذیرفته می‌شوند.';
    return 'برای این کار دسترسی ندارید.';
  }
  return fallback;
}

function ids(formData: FormData, name: string): number[] {
  return formData.getAll(name).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

function reviewInput(formData: FormData): ReviewInput {
  const source = String(formData.get('source') ?? '');
  return {
    title: String(formData.get('title') ?? ''),
    videoUrl: String(formData.get('videoUrl') ?? ''),
    source: (REVIEW_SOURCES as readonly string[]).includes(source) ? (source as ReviewSource) : null,
    notes: String(formData.get('notes') ?? ''),
    roleTagIds: ids(formData, 'roleTagIds'),
    clientVisible: formData.get('clientVisible') !== null,
  };
}

export async function saveReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const projectId = Number(formData.get('projectId'));
  const reviewId = Number(formData.get('reviewId') ?? 0);
  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };
  const input = reviewInput(formData);
  if (input.title.trim() === '') return { error: 'عنوانِ بازبینی الزامی است.' };

  try {
    const actor = await requireActor();
    const media = await mediaFrom(formData);
    const id = reviewId > 0
      ? (await updateReview(actor, reviewId, input, media), reviewId)
      : await createReview(actor, projectId, input, media);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, reviewId: id };
  } catch (error) {
    return { error: message(error, 'بازبینی ذخیره نشد.') };
  }
}

/** تصویر و سندِ تازه برای خودِ بازبینی — کادرِ «تصاویر»، بی‌دکمهٔ ذخیره. */
export async function addReviewMediaAction(reviewId: number, formData: FormData): Promise<ReviewFormState> {
  try {
    const projectId = await addReviewMedia(await requireActor(), reviewId, await mediaFrom(formData));
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    return { error: message(error, 'فایل بارگذاری نشد.') };
  }
  return { ok: true };
}

export async function deleteReviewAction(reviewId: number): Promise<ReviewFormState> {
  try {
    const projectId = await deleteReview(await requireActor(), reviewId);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    return { error: message(error, 'بازبینی حذف نشد.') };
  }
  return { ok: true };
}

/** «۱:۲۳» یا تهی ← ثانیه؛ نامعتبر `undefined` تا فرم خطا بدهد. */
function timeField(formData: FormData, name: string): number | null | undefined {
  const raw = String(formData.get(name) ?? '').trim();
  if (raw === '') return null;
  return parseTimestamp(raw) ?? undefined;
}

export async function addReviewItemAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const reviewId = Number(formData.get('reviewId'));
  if (!Number.isInteger(reviewId) || reviewId <= 0) return { error: 'بازبینی معتبر نیست.' };
  const title = String(formData.get('title') ?? '').trim();
  if (title === '') return { error: 'عنوانِ مورد الزامی است.' };
  const start = timeField(formData, 'start');
  const end = timeField(formData, 'end');
  if (start === undefined || end === undefined) return { error: 'زمان را به شکلِ ۱:۲۳ بنویسید.' };
  const id = (name: string) => {
    const n = Number(formData.get(name) ?? 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  try {
    const actor = await requireActor();
    const { projectId } = await addReviewItem(actor, reviewId, {
      title: title.slice(0, 200),
      description: String(formData.get('description') ?? '').trim().slice(0, 5000),
      statusTagId: id('statusTagId'),
      priorityTagId: id('priorityTagId'),
      assignedTo: id('assignedTo'),
      dueDate: null,
      isPrivate: false,
      roleTagIds: ids(formData, 'roleTagIds'),
      start,
      end,
      area: String(formData.get('area') ?? ''),
      clientHidden: formData.get('clientHidden') !== null,
    }, await mediaFrom(formData));
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    return { error: message(error, 'مورد ثبت نشد.') };
  }
  return { ok: true };
}

/**
 * جزئیاتِ بازبینی برای پنلِ تب — با گزینه‌های فرمِ «افزودنِ مورد» فقط برای
 * کسی که می‌تواند اضافه کند، و وضعیت‌ها برای هر شرکت‌کننده.
 */
export async function loadReviewAction(reviewId: number) {
  const actor = await requireActor();
  const detail = await getReview(actor, reviewId);
  const [options, statuses] = await Promise.all([
    detail.canManage ? reviewFormOptions(actor, detail.review.projectId) : Promise.resolve(null),
    detail.canInteract ? taskStatusOptionsFor(actor, detail.review.projectId) : Promise.resolve([]),
  ]);
  return {
    detail,
    options,
    statuses: statuses.map((s) => ({ id: s.id, name: s.name, group: s.group, color: s.color })),
  };
}
