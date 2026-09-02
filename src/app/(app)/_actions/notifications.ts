'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { markAllRead, markRead } from '@/server/notifications/service';

/** خواندنِ اعلان — شرطِ «مالِ خودم» در خودِ کوئری است، نه یک بررسیِ جدا. */
export async function markReadAction(notificationId: number): Promise<void> {
  const actor = await requireActor({ allowOffboarded: true });
  await markRead(actor, notificationId);
  revalidatePath('/', 'layout');
}

export async function markAllReadAction(): Promise<void> {
  const actor = await requireActor({ allowOffboarded: true });
  await markAllRead(actor);
  revalidatePath('/', 'layout');
}
