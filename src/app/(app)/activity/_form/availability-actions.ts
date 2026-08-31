'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { setWeek } from '@/server/availability/service';
import { ForbiddenError } from '@/domain/access/guard';

export interface AvailabilityState {
  error?: string;
  message?: string;
}

/**
 * ذخیرهٔ برنامهٔ هفتگی.
 *
 * ⚠️ بازه‌ها به‌صورتِ دو آرایهٔ **موازی** (`slot-<day>-from` و `-to`) می‌آیند و
 * بر اساسِ ترتیب جفت می‌شوند — همان کاری که `slots_from_post()` می‌کند. هر
 * جفتِ ناقص در لایهٔ دامنه کنار گذاشته می‌شود، نه اینکه ذخیره را بشکند.
 */
export async function saveAvailabilityAction(
  _prev: AvailabilityState,
  formData: FormData,
): Promise<AvailabilityState> {
  const onDays = formData.getAll('onDays').map((v) => Number(v));

  const slotsByDay: Record<number, Array<{ from: string; to: string }>> = {};
  for (const day of onDays) {
    const froms = formData.getAll(`slot-${day}-from`).map(String);
    const tos = formData.getAll(`slot-${day}-to`).map(String);
    const pairs: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < Math.max(froms.length, tos.length); i += 1) {
      pairs.push({ from: froms[i] ?? '', to: tos[i] ?? '' });
    }
    slotsByDay[day] = pairs;
  }

  try {
    const actor = await requireActor();
    await setWeek(actor, actor.id, onDays, slotsByDay);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'ذخیره نشد.' };
  }

  revalidatePath('/activity');
  return { message: 'برنامهٔ هفتگی ذخیره شد.' };
}
