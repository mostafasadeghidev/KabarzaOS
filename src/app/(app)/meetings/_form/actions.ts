'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  createMeeting, createReminder, deleteMeeting, deleteReminder,
  getCandidates, MeetingNotFoundError, updateMeeting,
} from '@/server/meetings/service';
import { ForbiddenError } from '@/domain/access/guard';

/** اقدام‌های جلسات و یادآورها. گاردها همه در سرویس‌اند (R-ARCH-01). */

const optionalId = z.string().trim().transform((v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
});

const meetingSchema = z.object({
  title: z.string().trim().min(1, 'موضوعِ جلسه الزامی است').max(200),
  description: z.string().trim().max(5000).default(''),
  meetAt: z
    .string()
    .trim()
    .min(1, 'تاریخ و ساعتِ جلسه الزامی است')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'تاریخ و ساعت معتبر نیست'),
  location: z.string().trim().max(300).default(''),
  projectId: optionalId,
  officeId: optionalId,
});

export interface MeetingFormState {
  error?: string;
  fieldErrors?: Partial<Record<'title' | 'meetAt', string>>;
  values?: Record<string, string>;
  ok?: boolean;
}

function parse(formData: FormData) {
  const values: Record<string, string> = {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    meetAt: String(formData.get('meetAt') ?? ''),
    location: String(formData.get('location') ?? ''),
    projectId: String(formData.get('projectId') ?? ''),
    officeId: String(formData.get('officeId') ?? ''),
  };

  const parsed = meetingSchema.safeParse(values);
  const attendeeIds = formData.getAll('attendees')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  return { parsed, values, attendeeIds };
}

export async function saveMeetingAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const rawId = Number(formData.get('meetingId'));
  const meetingId = Number.isInteger(rawId) && rawId > 0 ? rawId : null;

  const { parsed, values, attendeeIds } = parse(formData);
  if (!parsed.success) {
    const fieldErrors: MeetingFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as 'title' | 'meetAt';
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors, values };
  }

  const input = {
    title: parsed.data.title,
    description: parsed.data.description,
    meetAt: new Date(parsed.data.meetAt),
    location: parsed.data.location,
    projectId: parsed.data.projectId,
    officeId: parsed.data.officeId,
    attendeeIds,
  };

  try {
    const actor = await requireActor();
    if (meetingId) await updateMeeting(actor, meetingId, input);
    else await createMeeting(actor, input);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ مدیریتِ جلسات ندارید.', values };
    if (error instanceof MeetingNotFoundError) return { error: 'جلسه پیدا نشد.', values };
    return { error: 'جلسه ذخیره نشد.', values };
  }

  revalidatePath('/meetings');
  return { ok: true };
}

export interface SimpleState { error?: string; ok?: boolean }

export async function deleteMeetingAction(meetingId: number): Promise<SimpleState> {
  try {
    const actor = await requireActor();
    await deleteMeeting(actor, meetingId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ حذفِ جلسه ندارید.' };
    return { error: 'جلسه حذف نشد.' };
  }
  revalidatePath('/meetings');
  return { ok: true };
}

/**
 * فهرستِ دعوت‌شدگان با تغییرِ پروژه/دفتر تازه می‌شود — معادلِ بارگذاریِ AJAX ِ
 * نسخهٔ قبلی که می‌گفت «برای انتخابِ دعوت‌شدگان، ابتدا پروژه را مشخص کنید».
 */
export async function loadCandidatesAction(projectId: number | null, officeIds: number[]) {
  const actor = await requireActor();
  return getCandidates(actor, { projectId, officeIds });
}

/* ------------------------------------------------------------------ *
 * یادآورها.
 * ------------------------------------------------------------------ */

export async function saveReminderAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const remindAt = String(formData.get('remindAt') ?? '');
  const body = String(formData.get('body') ?? '');
  const leads = formData.getAll('leads').map((v) => Number(v)).filter(Number.isFinite);

  if (body.trim() === '') return { error: 'متنِ یادآور الزامی است.' };
  if (Number.isNaN(Date.parse(remindAt))) return { error: 'زمانِ یادآور معتبر نیست.' };

  try {
    const actor = await requireActor();
    await createReminder(actor, { remindAt: new Date(remindAt), body, leads });
  } catch {
    return { error: 'یادآور ثبت نشد.' };
  }
  revalidatePath('/meetings');
  return { ok: true };
}

export async function deleteReminderAction(reminderId: number): Promise<SimpleState> {
  try {
    const actor = await requireActor();
    await deleteReminder(actor, reminderId);
  } catch {
    return { error: 'یادآور حذف نشد.' };
  }
  revalidatePath('/meetings');
  return { ok: true };
}
