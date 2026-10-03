'use server';

import { requireActor } from '@/server/auth';
import { getActivityEvent, type ActivityEventDetail } from '@/server/activity/service';

/**
 * جزئیاتِ یک رویداد برای دیالوگِ صفحهٔ فعالیت.
 * گارد (`activity.view`) در سرویس است؛ شناسهٔ ناموجود `null` برمی‌گرداند.
 */
export async function activityEventAction(id: number): Promise<ActivityEventDetail | null> {
  const actor = await requireActor();
  if (!Number.isInteger(id) || id <= 0) return null;
  return getActivityEvent(actor, id);
}
