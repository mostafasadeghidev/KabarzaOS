'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { currentSession } from '@/server/auth';
import { isPalette, isTheme } from '@/domain/people/appearance';

/**
 * ذخیرهٔ ظاهرِ اپ روی کاربر — پورتِ `handle_set_theme` (`_kteam_theme`).
 *
 * ⚠️ روی کاربر، نه مرورگر: انتخابِ «تیره» روی لپ‌تاپ روی گوشی هم می‌آید.
 *
 * ⚠️ بی‌خطا وقتی کسی وارد نشده: منوی ظاهر در صفحه‌های عمومی هم کار می‌کند
 * و آنجا فقط مرورگر به یاد می‌سپارد. عضوِ سابقِ «فقط مالی» هم مجاز است —
 * نسخهٔ قبلی زبان و تم را برای او آزاد گذاشته بود.
 *
 * ⚠️ مقدارِ ناشناخته دور ریخته می‌شود، نه ذخیره: اسکریپتِ پیش از رندر همین
 * مقدار را در صفحه می‌گذارد.
 */
export async function saveAppearanceAction(input: { theme?: string; palette?: string }): Promise<void> {
  const session = await currentSession();
  if (!session) return;

  const set: { theme?: 'light' | 'dark' | 'system'; palette?: string } = {};
  if (isTheme(input.theme)) set.theme = input.theme;
  if (isPalette(input.palette)) set.palette = input.palette;
  if (Object.keys(set).length === 0) return;

  await db.update(users).set(set).where(eq(users.id, session.actor.id));
}
