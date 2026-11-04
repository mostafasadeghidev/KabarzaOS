'use server';

import { headers } from 'next/headers';
import { currentActor, requireActor } from '@/server/auth';
import { getSystemConfig } from '@/server/settings/system-service';
import {
  PushError, sendPush, subscribe, unsubscribe, vapidKeys, type PushSubscriptionInput,
} from '@/server/notifications/push';
import { getT } from '@/i18n/server';

/** اعلانِ فوری روی همین دستگاه (۲.۵۶.۰) — اقدام‌های پنلِ «پروفایلِ من». */

export async function pushSetupAction(): Promise<{ enabled: boolean; publicKey: string | null }> {
  if (!(await currentActor())) return { enabled: false, publicKey: null };
  const enabled = (await getSystemConfig()).pushEnabled;
  return { enabled, publicKey: enabled ? (await vapidKeys()).publicKey : null };
}

export async function subscribePushAction(subscription: PushSubscriptionInput): Promise<{ error?: string }> {
  const actor = await requireActor();
  try {
    await subscribe(actor, subscription, (await headers()).get('user-agent') ?? '');
    return {};
  } catch (error) {
    if (error instanceof PushError) {
      return { error: error.reason === 'disabled' ? 'اعلانِ فوری در تنظیمات خاموش است.' : 'این دستگاه را نشد ثبت کرد.' };
    }
    throw error;
  }
}

export async function unsubscribePushAction(endpoint: string): Promise<void> {
  const actor = await requireActor();
  await unsubscribe(actor, endpoint);
}

/** پیامِ آزمایشی به دستگاه‌های خودِ کاربر — تا ببیند واقعاً می‌رسد. */
export async function testPushAction(): Promise<void> {
  const actor = await requireActor();
  const t = await getT();
  await sendPush([{
    userId: actor.id,
    title: t('اعلانِ آزمایشی'),
    body: t('اعلان‌ها روی این دستگاه می‌رسند.'),
    url: '/profile?tab=notify',
  }]);
}
