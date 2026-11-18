'use server';

import { requireActor } from '@/server/auth';
import { canManageSection } from '@/domain/access/permissions';
import { notify } from '@/server/notifications/service';

/**
 * یادآوریِ ثبتِ ساعت از داشبورد (نمونهٔ محلی) — مدیرِ اعضا برای عضوی که دیروز ساعتی ثبت نکرده
 * اعلان می‌فرستد؛ همان اعلانِ زنگوله (و تلگرام/Push اگر عضو روشن کرده باشد).
 */
export async function remindTimelogAction(userId: number): Promise<{ error?: string }> {
  try {
    const actor = await requireActor();
    if (!canManageSection(actor, 'members')) return { error: 'اجازهٔ این کار را ندارید.' };
    if (!Number.isInteger(userId) || userId <= 0) return { error: 'عضو پیدا نشد.' };
    await notify([userId], {
      type: 'timelog.reminder',
      title: 'یادآوری: ساعتِ دیروز ثبت نشده',
      body: 'لطفاً ساعتِ کارِ دیروز را در «ساعت کاری» ثبت کنید.',
      url: '/hours',
    });
    return {};
  } catch {
    return { error: 'یادآوری فرستاده نشد.' };
  }
}
