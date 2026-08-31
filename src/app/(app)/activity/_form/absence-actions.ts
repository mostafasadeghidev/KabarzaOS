'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { AbsenceDateError, deleteAbsence, saveAbsence } from '@/server/availability/absence-service';
import { ForbiddenError } from '@/domain/access/guard';

export interface AbsenceState {
  error?: string;
  message?: string;
}

/**
 * ثبتِ مرخصی — پورتِ `handle_add_absence` و `handle_manager_add_absence`.
 *
 * ⚠️ `userId` از فرم می‌آید، پس دامنه **دوباره** در سرویس بررسی می‌شود
 * (R-ARCH-01). نسخهٔ قبلی هم دقیقاً همین کار را می‌کند و در کامنتش نوشته که
 * هرگز به شناسهٔ پست‌شده اعتماد نمی‌کند.
 */
export async function saveAbsenceAction(
  _prev: AbsenceState,
  formData: FormData,
): Promise<AbsenceState> {
  try {
    const actor = await requireActor();
    const posted = Number(formData.get('userId') ?? 0);
    await saveAbsence(actor, {
      userId: Number.isInteger(posted) && posted > 0 ? posted : actor.id,
      from: String(formData.get('from') ?? ''),
      to: String(formData.get('to') ?? ''),
      note: String(formData.get('note') ?? ''),
    });
  } catch (error) {
    if (error instanceof AbsenceDateError) return { error: 'تاریخ‌ها را کامل و درست وارد کنید.' };
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'ذخیره نشد.' };
  }

  // ⚠️ داشبورد هم «در مرخصیِ امروز» را نشان می‌دهد، پس کلِ چیدمان تازه شود.
  revalidatePath('/', 'layout');
  return { message: 'مرخصی ثبت شد.' };
}

export async function deleteAbsenceAction(id: number): Promise<AbsenceState> {
  try {
    const actor = await requireActor();
    await deleteAbsence(actor, id);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'حذف نشد.' };
  }

  revalidatePath('/', 'layout');
  return { message: 'مرخصی حذف شد.' };
}
