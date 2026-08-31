'use server';

import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/client';
import { schedulerStamps, users } from '@/db/schema';
import { requireActor } from '@/server/auth';
import type { Actor } from '@/domain/access/permissions';
import { telegramEnabled } from '@/server/settings/telegram-service';

/**
 * یادآورِ اتصالِ تلگرام — یک مهرِ
 * per-user در همان جدولِ مهرهای زمان‌بند (چیزِ تازه‌ای در اسکیما لازم نبود).
 */

const SNOOZE_DAYS = 7;

const key = (userId: number) => `tg_nudge_snooze:${userId}`;

/** سه شرطِ نسخهٔ قبلی: بات پیکربندی شده، کاربر وصل نیست، و نخوابانده. */
export async function shouldShowTelegramNudge(actor: Actor): Promise<boolean> {
  if (!(await telegramEnabled())) return false;

  const [me] = await db.select({ chatId: users.telegramChatId })
    .from(users).where(eq(users.id, actor.id));
  if (!me || me.chatId !== '') return false;

  const cutoff = new Date(Date.now() - SNOOZE_DAYS * 86400000).toISOString();
  const snoozed = await db.select({ key: schedulerStamps.key })
    .from(schedulerStamps)
    .where(and(eq(schedulerStamps.key, key(actor.id)), gte(schedulerStamps.value, cutoff)));
  return snoozed.length === 0;
}

export async function snoozeTelegramNudgeAction(): Promise<void> {
  const actor = await requireActor();
  await db.insert(schedulerStamps)
    .values({ key: key(actor.id), value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: schedulerStamps.key,
      set: { value: new Date().toISOString(), updatedAt: new Date() },
    });
}
