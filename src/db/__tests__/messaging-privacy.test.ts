import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  messages, notifications, threads, userPermissions, userRoles, users,
} from '../schema';
import * as service from '@/server/messaging/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * حریمِ خصوصی و رفتارِ صندوق — R-MSG-03/07/09/11 و R-NOTIF-08/13.
 *
 * ⚠️ پیش از این صندوق و گفتگو نامِ واقعیِ مدیران را چاپ می‌کردند، خواندنِ
 * گفتگو زنگوله را خاموش نمی‌کرد، پاسخ ۳۰ ثانیه محدود بود، و «فقط مالی» در
 * فهرستِ گیرندگان و پخشِ همگانی می‌آمد.
 */

const actor = (id: number, over: Partial<Actor> = {}): Actor => ({
  id, roles: [], permissions: [], privateAccess: false, ...over,
});

let ownerId: number, adminId: number, staffId: number, devId: number, clientId: number, formerId: number;
const owner = () => actor(ownerId, { roles: ['owner'] });
const dev = () => actor(devId, { roles: ['member'] });
const staff = () => actor(staffId, { roles: ['member'], permissions: ['messages.send'] as Permission[] });

/** بینِ ارسال‌های نو مهرِ محدودیت پاک می‌شود تا تست به ۳۰ ثانیه گیر نکند. */
async function clearCooldown() {
  await db.update(users).set({ lastMessageSentAt: null });
}

const notificationsFor = (userId: number, threadId: number) =>
  db.select().from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.url, `/messages/${threadId}`)));

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, messages, thread_users, threads,
    user_permissions, user_roles, users restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'ad@t', name: 'ادمین' },
    { email: 'st@t', name: 'کارمند' },
    { email: 'd@t', name: 'سارا' },
    { email: 'c@t', name: 'شرکتِ الف' },
    { email: 'f@t', name: 'سابق', memberState: 'finance' },
  ]).returning({ id: users.id });
  [ownerId, adminId, staffId, devId, clientId, formerId] =
    u.map((r) => r.id) as [number, number, number, number, number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: adminId, role: 'admin' },
    { userId: staffId, role: 'member' },
    { userId: devId, role: 'member' },
    { userId: clientId, role: 'client' },
    { userId: formerId, role: 'member' },
  ]);
  await db.insert(userPermissions).values({ userId: staffId, permission: 'messages.send' });
});

afterAll(async () => { await sql.end(); });

describe('R-MSG-03 — «مدیریت» به‌جای نامِ مدیر', () => {
  let threadId: number;

  beforeAll(async () => {
    await clearCooldown();
    threadId = (await service.compose(owner(), { recipientIds: [devId], body: 'سلام', allowReply: true }))[0]!;
  });

  it('عضو در صندوق و گفتگو «مدیریت» می‌بیند؛ مالک نامِ واقعی', async () => {
    const inbox = await service.listInbox(dev());
    expect(inbox.threads.find((t) => t.id === threadId)!.label).toBe('مدیریت');

    const opened = await service.openThread(dev(), threadId);
    expect(opened.thread.label).toBe('مدیریت');
    expect(opened.messages[0]!.fromName).toBe('مدیریت');

    const mine = await service.openThread(owner(), threadId);
    expect(mine.thread.label).toBe('سارا');
    expect(mine.messages[0]!.fromName).toBe('مالک');
  });

  it('⚠️ گفتگو با چند مدیر باز هم فقط «مدیریت» است — نه «مدیریت و ۱ نفر دیگر»', async () => {
    await clearCooldown();
    const id = await service.contactManagement(dev(), 'سؤال');
    expect((await service.openThread(dev(), id)).thread.label).toBe('مدیریت');
    expect((await service.listInbox(dev())).threads.find((t) => t.id === id)!.label).toBe('مدیریت');
  });

  it('کارمندِ دارای مجوزِ ارسال هم «مدیریت» است — در گفتگو و در عنوانِ اعلان (R-NOTIF-13)', async () => {
    await clearCooldown();
    const id = (await service.compose(staff(), { recipientIds: [devId], body: 'از طرفِ سازمان', allowReply: true }))[0]!;
    const n = await notificationsFor(devId, id);
    expect(n).toHaveLength(1);
    expect(n[0]!.title).toBe('پیام جدید از مدیریت');
    expect((await service.openThread(dev(), id)).messages[0]!.fromName).toBe('مدیریت');
  });
});

describe('R-NOTIF-08 — خواندنِ گفتگو زنگوله را خاموش می‌کند', () => {
  it('پس از بازکردنِ گفتگو، اعلانِ همان گفتگو خوانده شده است', async () => {
    await clearCooldown();
    const id = (await service.compose(owner(), { recipientIds: [devId], body: 'خبر', allowReply: true }))[0]!;
    const before = await notificationsFor(devId, id);
    expect(before[0]!.isRead).toBe(false);

    await service.openThread(dev(), id);
    const after = await db.select().from(notifications).where(eq(notifications.id, before[0]!.id));
    expect(after[0]!.isRead).toBe(true);
  });
});

describe('R-MSG-09 — پاسخ محدودیتِ زمانی ندارد', () => {
  it('بلافاصله پس از ارسالِ نو می‌شود پاسخ داد؛ اعلانِ پاسخ نامِ ماسک‌شده/واقعی دارد', async () => {
    await clearCooldown();
    const id = (await service.compose(owner(), { recipientIds: [devId], body: 'یک', allowReply: true }))[0]!;
    await expect(service.reply(owner(), id, 'دو')).resolves.toBeGreaterThan(0);
    await expect(service.reply(owner(), id, 'سه')).resolves.toBeGreaterThan(0);
    expect((await notificationsFor(devId, id)).map((r) => r.title)).toContain('پاسخِ تازه از مدیریت');

    await service.reply(dev(), id, 'چشم');
    expect((await notificationsFor(ownerId, id)).map((r) => r.title)).toContain('پاسخِ تازه از سارا');
  });

  it('گفتگویی که پاسخِ تازه گرفته بالای صندوق می‌آید', async () => {
    await clearCooldown();
    const older = (await service.compose(owner(), { recipientIds: [devId], body: 'قدیمی', allowReply: true }))[0]!;
    await clearCooldown();
    const newer = (await service.compose(owner(), { recipientIds: [devId], body: 'تازه', allowReply: true }))[0]!;
    await service.reply(dev(), older, 'جواب به قدیمی');

    const ids = (await service.listInbox(owner())).threads.map((t) => t.id);
    expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
  });
});

describe('گیرندگان و مخاطبِ آماده — فقط اعضا و کارفرمایانِ فعال', () => {
  it('عضوِ سابق، مالک و ادمین در فهرستِ گیرندگان نیستند؛ نقش هست', async () => {
    const list = await service.getRecipients(owner());
    const ids = list.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([devId, clientId, staffId]));
    expect(ids).not.toContain(formerId);
    expect(ids).not.toContain(adminId);
    expect(ids).not.toContain(ownerId);
    expect(list.find((r) => r.id === clientId)!.role).toBe('client');
  });

  it('پخشِ همگانی عضوِ «فقط مالی» را نمی‌گیرد', async () => {
    const ids = await service.resolveAudience(owner(), 'members');
    expect(ids).toContain(devId);
    expect(ids).not.toContain(formerId);
  });
});

describe('R-MSG-11 / R-MSG-07 — حذفِ کلِ گفتگو و رسیدِ خواندن', () => {
  it('⚠️ گیرنده نمی‌تواند برای همه حذف کند؛ سازنده می‌تواند و اعلان‌ها هم می‌روند', async () => {
    await clearCooldown();
    const id = (await service.compose(owner(), { recipientIds: [devId], body: 'حذف‌شدنی', allowReply: true }))[0]!;
    await expect(service.deleteThread(dev(), id)).rejects.toThrow(ForbiddenError);
    expect((await service.openThread(dev(), id)).thread.canDelete).toBe(false);

    await service.deleteThread(owner(), id);
    expect(await db.select().from(threads).where(eq(threads.id, id))).toHaveLength(0);
    expect(await db.select().from(messages).where(eq(messages.threadId, id))).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.url, `/messages/${id}`))).toHaveLength(0);
  });

  it('✓✓ تا جایی که همهٔ طرف‌های دیگر خوانده‌اند — و فقط مدیران تیک می‌بینند', async () => {
    await clearCooldown();
    const id = (await service.compose(owner(), { recipientIds: [devId], body: 'اول', allowReply: true }))[0]!;
    const unseen = await service.openThread(owner(), id);
    expect(unseen.readUpTo).toBe(0);
    expect(unseen.thread.showReceipts).toBe(true);

    const asMember = await service.openThread(dev(), id);
    expect(asMember.thread.showReceipts).toBe(false);

    const seen = await service.openThread(owner(), id);
    expect(seen.readUpTo).toBe(seen.messages.at(-1)!.id);
  });
});
