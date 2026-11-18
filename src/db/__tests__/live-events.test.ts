import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, sql } from '../client';
import { messages, notifications, threads, threadUsers, users } from '../schema';
import { eq } from 'drizzle-orm';

/**
 * خبرهای لحظه‌ای (۳.۱۴.۰، مهاجرتِ ۰۰۸۱): تریگرها روی کانالِ `kz_live` خبر می‌دهند — فقط «چه چیزی برای
 * چه کسی/کدام گفتگو»، بی هیچ متنی. همین را `/api/live` به مرورگرها می‌رساند.
 */

const got: Array<Record<string, unknown>> = [];
let unlisten: (() => Promise<void>) | null = null;
let A = 0, T = 0;

const next = async (n: number) => {
  for (let i = 0; i < 50 && got.length < n; i++) await new Promise((r) => setTimeout(r, 40));
  return got.slice(0, n);
};

beforeAll(async () => {
  await sql`truncate table notifications, messages, thread_users, threads, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'live@t', name: 'زنده' }).returning({ id: users.id });
  A = u!.id;
  const [t] = await db.insert(threads).values({ creatorId: A, kind: 'direct' }).returning({ id: threads.id });
  T = t!.id;
  await db.insert(threadUsers).values({ threadId: T, userId: A });
  const meta = await sql.listen('kz_live', (p) => { got.push(JSON.parse(p) as Record<string, unknown>); });
  unlisten = meta.unlisten;
});

afterAll(async () => { await unlisten?.(); });

describe('تریگرهای خبرِ لحظه‌ای', () => {
  it('اعلانِ تازه و خوانده‌شدنش ← خبرِ همان کاربر، بی عنوان و متن', async () => {
    got.length = 0;
    const [n] = await db.insert(notifications).values({ userId: A, type: 'user', title: 'محرمانه' }).returning({ id: notifications.id });
    expect(await next(1)).toEqual([{ k: 'n', u: A }]);
    got.length = 0;
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, n!.id));
    expect(await next(1)).toEqual([{ k: 'n', u: A }]);
  });

  it('پیامِ تازه، ویرایش و حذف ← شمارهٔ گفتگو؛ خواندن ← خبرِ همان کاربر', async () => {
    got.length = 0;
    const [m] = await db.insert(messages).values({ threadId: T, fromUserId: A, body: 'سلام' }).returning({ id: messages.id });
    expect(await next(1)).toEqual([{ k: 'm', t: T }]);
    got.length = 0;
    await db.update(threadUsers).set({ lastReadMessageId: m!.id }).where(eq(threadUsers.threadId, T));
    expect(await next(1)).toEqual([{ k: 'r', u: A }]);
    got.length = 0;
    await db.delete(messages).where(eq(messages.id, m!.id));
    expect(await next(1)).toEqual([{ k: 'm', t: T }]);
  });
});
