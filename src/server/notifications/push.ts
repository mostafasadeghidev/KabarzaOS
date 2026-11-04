import webpush from 'web-push';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { pushSubscriptions, schedulerStamps } from '@/db/schema';
import { getSystemConfig } from '@/server/settings/system-service';
import type { Actor } from '@/domain/access/permissions';

/**
 * اعلانِ فوری (Web Push، ۲.۵۶.۰) — هر اعلانِ برنامه روی گوشی و کامپیوترِ کاربر هم
 * می‌آید، حتی وقتی برنامه بسته است.
 *
 * مرورگر پیام را از سرویسِ اعلانِ خودش (گوگل، اپل، موزیلا) می‌گیرد؛ ما فقط پیامِ
 * رمزگذاری‌شده را به نشانیِ دستگاه می‌فرستیم. حسابِ بیرونی و هزینه ندارد.
 */

const VAPID_KEY = 'push.vapid';

let cached: Promise<{ publicKey: string; privateKey: string }> | null = null;

/**
 * کلیدهای VAPID — امضای سرور تا سرویسِ اعلان بداند پیام از همین برنامه است.
 * از محیط (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) اگر هست؛ وگرنه یک بار ساخته و
 * در دیتابیس نگه داشته می‌شود — بی‌تنظیمِ دستی کار می‌کند.
 * ⚠️ عوض‌شدنِ کلید همهٔ اشتراک‌ها را بی‌اعتبار می‌کند؛ پس فقط یک بار ساخته می‌شود.
 */
export function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  cached ??= (async () => {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate };

    const read = async () => {
      const [row] = await db.select({ value: schedulerStamps.value }).from(schedulerStamps).where(eq(schedulerStamps.key, VAPID_KEY));
      return row ? (JSON.parse(row.value) as { publicKey: string; privateKey: string }) : null;
    };
    const existing = await read();
    if (existing) return existing;
    // دو درخواستِ هم‌زمان: هر دو می‌سازند، فقط اولی می‌نشیند و هر دو همان را می‌خوانند.
    await db.insert(schedulerStamps).values({ key: VAPID_KEY, value: JSON.stringify(webpush.generateVAPIDKeys()) })
      .onConflictDoNothing();
    return (await read())!;
  })().catch((error) => { cached = null; throw error; });
  return cached;
}

function subject(): string {
  const base = (process.env.APP_URL ?? '').trim().replace(/\/$/, '');
  return base.startsWith('https://') ? base : 'mailto:push@localhost';
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export class PushError extends Error {
  constructor(readonly reason: 'invalid' | 'disabled') {
    super(`push: ${reason}`);
    this.name = 'PushError';
  }
}

/** ثبت یا به‌روزرسانیِ اشتراکِ همین دستگاه برای همین کاربر. */
export async function subscribe(actor: Actor, input: PushSubscriptionInput, userAgent = ''): Promise<void> {
  if (!(await getSystemConfig()).pushEnabled) throw new PushError('disabled');
  const endpoint = String(input?.endpoint ?? '');
  const p256dh = String(input?.keys?.p256dh ?? '');
  const auth = String(input?.keys?.auth ?? '');
  // فقط نشانیِ https ِ سرویسِ اعلان؛ نه هر رشته‌ای که سرور به آن درخواست بفرستد.
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    throw new PushError('invalid');
  }
  await db.insert(pushSubscriptions)
    .values({ userId: actor.id, endpoint, p256dh, auth, userAgent: userAgent.slice(0, 300) })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      // دستگاهی که به حسابِ دیگری رفته، اعلانِ صاحبِ تازه را می‌گیرد، نه هر دو.
      set: { userId: actor.id, p256dh, auth, userAgent: userAgent.slice(0, 300) },
    });
}

/** خاموش کردنِ اعلان روی همین دستگاه — فقط اشتراکِ خودِ کاربر. */
export async function unsubscribe(actor: Actor, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, actor.id), eq(pushSubscriptions.endpoint, String(endpoint))));
}

export async function countSubscriptions(actor: Actor): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, actor.id));
  return row?.n ?? 0;
}

export interface PushMessage {
  userId: number;
  title: string;
  body: string;
  url: string;
  /** اعلان‌های هم‌برچسب (همان صفحه) روی هم می‌نشینند، نه زیرِ هم. */
  tag?: string;
}

/**
 * فرستادنِ پیام‌ها. ⚠️ شکست بی‌صداست (مثلِ تلگرام و ایمیل، R-NOTIF-03)؛ دستگاهی
 * که سرویسش «دیگر نیست» (404/410) گفت، اشتراکش پاک می‌شود.
 */
export async function sendPush(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const userIds = [...new Set(messages.map((m) => m.userId))];
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return;
  if (!(await getSystemConfig()).pushEnabled) return;

  const keys = await vapidKeys();
  const options = {
    vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 60 * 60 * 24,
  };
  const gone: number[] = [];
  const used: number[] = [];
  await Promise.allSettled(messages.flatMap((message) => subs
    .filter((s) => s.userId === message.userId)
    .map(async (s) => {
      const payload = JSON.stringify({
        title: message.title,
        body: message.body.length > 240 ? `${message.body.slice(0, 240)}…` : message.body,
        url: message.url || '/notifications',
        tag: message.tag,
      });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
        used.push(s.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
      }
    })));
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (used.length) await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(inArray(pushSubscriptions.id, [...new Set(used)]));
}
