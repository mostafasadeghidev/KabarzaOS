'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireActor } from '@/server/auth';
import { isLocale, type Locale } from '@/i18n/config';

/**
 * تغییرِ زبانِ کاربر.
 * R-I18N-03 — زبان per-user ذخیره می‌شود، نه در کوکیِ مرورگر، تا روی هر
 * دستگاهی یکسان باشد.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const actor = await requireActor({ allowOffboarded: true });
  await db.update(users).set({ locale }).where(eq(users.id, actor.id));
  revalidatePath('/', 'layout');
}
