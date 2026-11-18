'use server';

import { revalidatePath } from 'next/cache';
import { currentSession } from '@/server/auth';
import { adoptDeviceTimezone } from '@/server/people/profile-service';

/**
 * منطقهٔ زمانیِ دستگاه برای کاربری که هرگز انتخاب نکرده (۳.۱۵.۱).
 *
 * ⚠️ «دیدن به‌جای کاربر» چیزی نمی‌نویسد — منطقهٔ دستگاهِ مالک مالِ آن عضو نیست. عضوِ سابقِ «فقط
 * مالی» هم وارد است و منطقه‌اش به همان اندازه به کار می‌آید.
 */
export async function adoptTimezoneAction(timezone: string): Promise<boolean> {
  const session = await currentSession();
  if (!session || session.actor.viewOnly || session.timezoneChosen || session.timezone) return false;
  const saved = await adoptDeviceTimezone(session.actor, String(timezone ?? '').slice(0, 64));
  if (saved) revalidatePath('/', 'layout');
  return saved;
}
