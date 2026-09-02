import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users, userRoles, notifications } from '../schema';
import * as service from '@/server/notifications/service';
import type { Actor } from '@/domain/access/permissions';

/** دروازهٔ اعلان روی دیتابیس. */

const actor = (id: number): Actor => ({
  id, roles: [], permissions: [], privateAccess: false,
});

let active: number, locked: number, financeOnly: number;

beforeAll(async () => {
  await sql`truncate table notifications, user_roles, users restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 'a@t', name: 'فعال' },
    { email: 'l@t', name: 'قطع‌شده', memberState: 'locked' },
    { email: 'f@t', name: 'فقط مالی', memberState: 'finance' },
  ]).returning({ id: users.id });
  [active, locked, financeOnly] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values(u.map((r) => ({ userId: r.id, role: 'member' as const })));
});

afterAll(async () => { await sql.end(); });

describe('R-NOTIF-02 — عضوِ قطع‌شده هیچ اعلانی نمی‌گیرد', () => {
  it('⚠️ ردیفی هم برایش نوشته نمی‌شود', async () => {
    const sent = await service.notify([active, locked], {
      type: 'task.assigned', title: 'تسک', url: '/projects/1',
    });
    expect(sent).toBe(1);
    expect(await db.select().from(notifications).where(eq(notifications.userId, locked)))
      .toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.userId, active)))
      .toHaveLength(1);
  });

  it('⚠️ «فقط مالی» فقط رویدادِ مالی می‌گیرد — نه تسک و پیامِ تیم', async () => {
    // هنوز به صورت‌حسابِ خودش دسترسی دارد، پس خبرِ پرداخت باید برسد؛ ولی کارِ
    // تیم دیگر مالِ او نیست (نسخهٔ قبلی هیچ‌کدام را نمی‌داد).
    await service.notify([financeOnly], { type: 'task.assigned', title: 'تسک' });
    await service.notify([financeOnly], { type: 'message.received', title: 'پیام' });
    expect(await db.select().from(notifications).where(eq(notifications.userId, financeOnly)))
      .toHaveLength(0);
    await service.notify([financeOnly], { type: 'payment.decided', title: 'پرداخت' });
    expect(await db.select().from(notifications).where(eq(notifications.userId, financeOnly)))
      .toHaveLength(1);
  });

  it('شناسهٔ تکراری یک اعلان می‌شود', async () => {
    const sent = await service.notify([active, active], { type: 'x', title: 'y' });
    expect(sent).toBe(1);
  });

  it('فهرستِ خالی کاری نمی‌کند', async () => {
    expect(await service.notify([], { type: 'x', title: 'y' })).toBe(0);
  });
});

describe('زنگ و خواندن', () => {
  it('شمارِ خوانده‌نشده درست است', async () => {
    const bell = await service.listNotifications(actor(active));
    expect(bell.unread).toBe(bell.items.length);
  });

  it('خواندنِ یک اعلان شمار را کم می‌کند', async () => {
    const before = await service.listNotifications(actor(active));
    await service.markRead(actor(active), before.items[0]!.id);
    const after = await service.listNotifications(actor(active));
    expect(after.unread).toBe(before.unread - 1);
  });

  it('⚠️ کاربرِ دیگر نمی‌تواند اعلانِ من را بخواند', async () => {
    const mine = await service.listNotifications(actor(active));
    const unreadOne = mine.items.find((n) => !n.isRead)!;
    await service.markRead(actor(financeOnly), unreadOne.id);

    const after = await service.listNotifications(actor(active));
    expect(after.items.find((n) => n.id === unreadOne.id)!.isRead).toBe(false);
  });

  it('«خواندنِ همه» صفر می‌کند', async () => {
    await service.markAllRead(actor(active));
    expect((await service.listNotifications(actor(active))).unread).toBe(0);
  });
});

describe('R-NOTIF-08 — تطبیقِ عددیِ هدف', () => {
  it('⚠️ بازکردنِ گفتگوی ۱، اعلانِ گفتگوی ۱۱ را خاموش نمی‌کند', async () => {
    await db.delete(notifications);
    await db.insert(notifications).values([
      { userId: active, type: 'message.received', title: 'الف', url: '/messages/1' },
      { userId: active, type: 'message.received', title: 'ب', url: '/messages/11' },
    ]);

    const hit = await service.markReadForTarget(actor(active), '/messages', 1);
    expect(hit).toBe(1);

    const rows = await db.select().from(notifications).where(eq(notifications.userId, active));
    expect(rows.find((n) => n.url === '/messages/1')!.isRead).toBe(true);
    expect(rows.find((n) => n.url === '/messages/11')!.isRead).toBe(false);
  });
});

describe('R-NOTIF-06 — پاک‌سازی فقط خوانده‌شده‌ها را می‌برد', () => {
  it('⚠️ خوانده‌نشدهٔ قدیمی می‌ماند', async () => {
    await db.delete(notifications);
    const old = new Date(Date.now() - 90 * 86400000);
    await db.insert(notifications).values([
      { userId: active, type: 'x', title: 'خوانده‌شدهٔ قدیمی', isRead: true, createdAt: old },
      { userId: active, type: 'x', title: 'خوانده‌نشدهٔ قدیمی', isRead: false, createdAt: old },
      { userId: active, type: 'x', title: 'خوانده‌شدهٔ تازه', isRead: true },
    ]);

    const removed = await service.purgeOld(30);
    expect(removed).toBe(1);

    const left = await db.select().from(notifications).where(eq(notifications.userId, active));
    expect(left.map((n) => n.title).sort())
      .toEqual(['خوانده‌شدهٔ تازه', 'خوانده‌نشدهٔ قدیمی'].sort());
  });
});
