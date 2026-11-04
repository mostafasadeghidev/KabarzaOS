import { describe, it, expect, beforeAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { pushSubscriptions, schedulerStamps, userRoles, users } from '../schema';
import type { Actor } from '@/domain/access/permissions';

/**
 * اعلانِ فوری (۲.۵۶.۰). ⚠️ خودِ ارسال به سرویسِ اعلانِ مرورگر شبیه‌سازی می‌شود:
 * تست نباید به گوگل/موزیلا درخواست بفرستد.
 */
const sent: Array<{ endpoint: string; payload: string }> = [];
vi.mock('web-push', async (orig) => {
  const real = (await orig()) as { default: typeof import('web-push') };
  return {
    default: {
      ...real.default,
      sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
        if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
        sent.push({ endpoint: sub.endpoint, payload });
        return { statusCode: 201 };
      }),
    },
  };
});

const push = await import('@/server/notifications/push');

let A = 0, B = 0;
const as = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } });

beforeAll(async () => {
  await sql`truncate table push_subscriptions, user_roles, users restart identity cascade`;
  await db.delete(schedulerStamps).where(eq(schedulerStamps.key, 'push.vapid'));
  const u = await db.insert(users).values([{ email: 'a@p', name: 'A' }, { email: 'b@p', name: 'B' }]).returning({ id: users.id });
  [A, B] = u.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: A, role: 'member' }, { userId: B, role: 'member' }]);
});

describe('کلیدهای VAPID', () => {
  it('یک بار ساخته و نگه داشته می‌شوند', async () => {
    const first = await push.vapidKeys();
    expect(first.publicKey.length).toBeGreaterThan(40);
    const [row] = await db.select().from(schedulerStamps).where(eq(schedulerStamps.key, 'push.vapid'));
    expect(JSON.parse(row!.value).publicKey).toBe(first.publicKey);
  });
});

describe('اشتراک', () => {
  it('ثبت، و ثبتِ دوبارهٔ همان دستگاه ردیفِ تازه نمی‌سازد', async () => {
    await push.subscribe(as(A), sub('https://push.example/a1'));
    await push.subscribe(as(A), sub('https://push.example/a1'));
    expect(await push.countSubscriptions(as(A))).toBe(1);
  });

  it('دستگاهی که به حسابِ دیگری رفت، به صاحبِ تازه می‌رسد', async () => {
    await push.subscribe(as(B), sub('https://push.example/a1'));
    expect(await push.countSubscriptions(as(A))).toBe(0);
    expect(await push.countSubscriptions(as(B))).toBe(1);
  });

  it('نشانیِ غیر https و کلیدِ خالی رد می‌شوند', async () => {
    await expect(push.subscribe(as(A), sub('http://evil.local/x'))).rejects.toThrow(push.PushError);
    await expect(push.subscribe(as(A), { endpoint: 'https://push.example/z', keys: { p256dh: '', auth: '' } })).rejects.toThrow(push.PushError);
  });

  it('هر کس فقط اشتراکِ خودش را خاموش می‌کند', async () => {
    await push.unsubscribe(as(A), 'https://push.example/a1');
    expect(await push.countSubscriptions(as(B))).toBe(1);
    await push.unsubscribe(as(B), 'https://push.example/a1');
    expect(await push.countSubscriptions(as(B))).toBe(0);
  });
});

describe('ارسال', () => {
  it('به همهٔ دستگاه‌های گیرنده می‌رود و دستگاهِ «رفته» پاک می‌شود', async () => {
    await push.subscribe(as(A), sub('https://push.example/phone'));
    await push.subscribe(as(A), sub('https://push.example/gone-laptop'));
    await push.subscribe(as(B), sub('https://push.example/b-phone'));
    sent.length = 0;
    await push.sendPush([{ userId: A, title: 'سلام', body: 'متن', url: '/tasks' }]);
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.example/phone']);
    expect(JSON.parse(sent[0]!.payload)).toMatchObject({ title: 'سلام', body: 'متن', url: '/tasks' });
    const left = await db.select({ e: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, A));
    expect(left.map((r) => r.e)).toEqual(['https://push.example/phone']);
  });
});
