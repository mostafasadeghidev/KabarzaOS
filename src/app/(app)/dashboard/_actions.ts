'use server';

import { requireActor } from '@/server/auth';
import { canManageSection } from '@/domain/access/permissions';
import { notify } from '@/server/notifications/service';
import {
  DASH_SCOPES, LAYOUT_MAX_BYTES, NOTE_MAX_CHARS, setDashHoursGoal, setDashLayout, setDashNote, type DashScope,
} from '@/server/dashboard-prefs';

/**
 * ذخیرهٔ ترجیحاتِ داشبورد (۳.۱۸.۰) — فقط برای خودِ کاربر. ⚠️ requireActor در «دیدن به‌جای کاربر» رد می‌کند،
 * پس مالک هنگامِ دیدن چیزی به نامِ آن کاربر نمی‌نویسد. ورودی‌ها سقف دارند (اندازه/نوع)، چون از مرورگر می‌آیند.
 */
export async function saveDashLayoutAction(scope: DashScope, layout: unknown): Promise<{ error?: string }> {
  try {
    const actor = await requireActor();
    if (!DASH_SCOPES.includes(scope)) return { error: 'ذخیره نشد.' };
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return { error: 'ذخیره نشد.' };
    if (JSON.stringify(layout).length > LAYOUT_MAX_BYTES) return { error: 'ذخیره نشد.' };
    await setDashLayout(actor.id, scope, layout);
    return {};
  } catch {
    return { error: 'ذخیره نشد.' };
  }
}

export async function saveDashNoteAction(note: string): Promise<{ error?: string }> {
  try {
    const actor = await requireActor();
    if (typeof note !== 'string' || note.length > NOTE_MAX_CHARS) return { error: 'ذخیره نشد.' };
    await setDashNote(actor.id, note);
    return {};
  } catch {
    return { error: 'ذخیره نشد.' };
  }
}

export async function saveHoursGoalAction(goal: number): Promise<{ error?: string }> {
  try {
    const actor = await requireActor();
    if (!Number.isInteger(goal) || goal < 1 || goal > 168) return { error: 'ذخیره نشد.' };
    await setDashHoursGoal(actor.id, goal);
    return {};
  } catch {
    return { error: 'ذخیره نشد.' };
  }
}

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
