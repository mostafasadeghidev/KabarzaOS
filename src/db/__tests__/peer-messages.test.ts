import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users, userRoles, threads, threadUsers, notifications } from '../schema';
import * as service from '@/server/messaging/service';
import { saveSystemConfig } from '@/server/settings/system-service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * پیامِ مستقیم بینِ اعضا (۲.۶۵.۰): فقط عضو با عضو، خصوصی، کارفرما در هیچ جهت.
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

let ownerId: number, saraId: number, aliId: number, clientId: number, formerId: number, staffId: number;
const owner = () => actor({ id: ownerId, roles: ['owner'], permissions: ['settings.manage', 'messages.send', 'messages.read'] as Permission[] });
const sara = () => actor({ id: saraId, roles: ['member'] });
const ali = () => actor({ id: aliId, roles: ['member'] });
/** عضوی که مجوزِ «ارسال» هم دارد — در پیامِ عادی «مدیریت» شمرده می‌شود. */
const staff = () => actor({ id: staffId, roles: ['member'], permissions: ['messages.send'] as Permission[] });
const client = () => actor({ id: clientId, roles: ['client'] });

async function clearCooldown() {
  await db.update(users).set({ lastMessageSentAt: null });
}

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, messages, thread_users, threads,
    user_roles, user_permissions, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'o@p', name: 'مالک' },
    { email: 's@p', name: 'سارا' },
    { email: 'a@p', name: 'علی' },
    { email: 'c@p', name: 'کارفرما' },
    { email: 'f@p', name: 'سابق', memberState: 'locked' },
    { email: 'st@p', name: 'کارمند' },
  ]).returning({ id: users.id });
  [ownerId, saraId, aliId, clientId, formerId, staffId] = u.map((r) => r.id) as [number, number, number, number, number, number];
  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: saraId, role: 'member' },
    { userId: aliId, role: 'member' },
    { userId: clientId, role: 'client' },
    { userId: formerId, role: 'member' },
    { userId: staffId, role: 'member' },
  ]);
  await saveSystemConfig(owner(), { memberDmEnabled: true });
});

afterAll(async () => {
  await saveSystemConfig(owner(), { memberDmEnabled: true });
  await sql.end();
});

describe('پیامِ بینِ اعضا', () => {
  let threadId: number;

  it('فهرستِ گیرنده فقط اعضای فعال است — نه کارفرما، نه سابق، نه مدیر، نه خودش', async () => {
    const list = await service.getPeerRecipients(sara());
    const ids = list.map((p) => p.id).sort();
    expect(ids).toEqual([aliId, staffId].sort());
  });

  it('⚠️ کارفرما و مدیر فهرستی ندارند', async () => {
    expect(await service.getPeerRecipients(client())).toEqual([]);
    expect(await service.getPeerRecipients(owner())).toEqual([]);
  });

  it('رشته فقط همان دو نفر را دارد — مدیر اضافه نمی‌شود', async () => {
    await clearCooldown();
    threadId = await service.messagePeer(sara(), aliId, 'سلام علی');
    const parts = await db.select({ u: threadUsers.userId }).from(threadUsers).where(eq(threadUsers.threadId, threadId));
    expect(parts.map((p) => p.u).sort()).toEqual([saraId, aliId].sort());
    const [t] = await db.select({ peer: threads.peer }).from(threads).where(eq(threads.id, threadId));
    expect(t!.peer).toBe(true);
  });

  it('پیامِ دوم به همان گفتگو اضافه می‌شود، نه رشتهٔ تازه', async () => {
    await clearCooldown();
    const again = await service.messagePeer(ali(), saraId, 'سلام سارا');
    expect(again).toBe(threadId);
  });

  it('⚠️ مدیر گفتگو را نمی‌بیند و پاکش هم نمی‌کند', async () => {
    const inbox = await service.listInbox(owner());
    expect(inbox.threads.some((t) => t.id === threadId)).toBe(false);
    await expect(service.openThread(owner(), threadId)).rejects.toThrow();
    await expect(service.deleteThread(owner(), threadId)).rejects.toThrow();
  });

  it('⚠️ «دیدن به‌جای کاربر» گفتگوی خصوصی را نشان نمی‌دهد', async () => {
    const viewing = { ...sara(), viewOnly: true } as Actor;
    const inbox = await service.listInbox(viewing);
    expect(inbox.threads.some((t) => t.id === threadId)).toBe(false);
    await expect(service.openThread(viewing, threadId)).rejects.toThrow();
  });

  it('در صندوقِ دو طرف با نامِ واقعی و نشانِ peer است؛ پاسخ کار می‌کند', async () => {
    const inbox = await service.listInbox(ali());
    const row = inbox.threads.find((t) => t.id === threadId)!;
    expect(row.peer).toBe(true);
    expect(row.label).toBe('سارا');
    await clearCooldown();
    await service.reply(ali(), threadId, 'باشه');
    const view = await service.openThread(sara(), threadId);
    expect(view.canReply).toBe(true);
    expect(view.thread.canDelete).toBe(false);
    expect(view.messages.at(-1)!.body).toBe('باشه');
  });

  it('⚠️ نامِ عضوی که مجوزِ «ارسال» دارد در گفتگوی اعضا «مدیریت» نمی‌شود', async () => {
    await clearCooldown();
    const id = await service.messagePeer(staff(), saraId, 'سلام از کارمند');
    const view = await service.openThread(sara(), id);
    expect(view.thread.label).toBe('کارمند');
    const titles = (await db.select({ title: notifications.title }).from(notifications)
      .where(eq(notifications.userId, saraId))).map((r) => r.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.some((x) => x.includes('مدیریت'))).toBe(false);
  });

  it('⚠️ به کارفرما، عضوِ سابق، مدیر یا خودش نمی‌شود پیام داد', async () => {
    for (const to of [clientId, formerId, ownerId, saraId]) {
      await clearCooldown();
      await expect(service.messagePeer(sara(), to, 'x')).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('⚠️ کارفرما به هیچ عضوی پیام نمی‌دهد', async () => {
    await clearCooldown();
    await expect(service.messagePeer(client(), saraId, 'x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ اگر طرفِ مقابل عضوِ سابق شود، گفتگو فقط‌خواندنی می‌شود', async () => {
    await db.update(users).set({ memberState: 'locked' }).where(eq(users.id, aliId));
    const view = await service.openThread(sara(), threadId);
    expect(view.canReply).toBe(false);
    await clearCooldown();
    await expect(service.reply(sara(), threadId, 'هستی؟')).rejects.toBeInstanceOf(ForbiddenError);
    await db.update(users).set({ memberState: 'active' }).where(eq(users.id, aliId));
  });

  it('⚠️ با خاموش‌کردنِ قابلیت، نه پیامِ تازه، نه پاسخ', async () => {
    await saveSystemConfig(owner(), { memberDmEnabled: false });
    expect(await service.getPeerRecipients(sara())).toEqual([]);
    await clearCooldown();
    await expect(service.messagePeer(sara(), aliId, 'x')).rejects.toBeInstanceOf(ForbiddenError);
    const view = await service.openThread(sara(), threadId);
    expect(view.canReply).toBe(false);
    await saveSystemConfig(owner(), { memberDmEnabled: true });
  });

  it('هر کس فقط از صندوقِ خودش برمی‌دارد؛ طرفِ دیگر گفتگو را نگه می‌دارد', async () => {
    await service.leaveThread(sara(), threadId);
    const mine = await service.listInbox(sara());
    expect(mine.threads.some((t) => t.id === threadId)).toBe(false);
    const his = await service.listInbox(ali());
    expect(his.threads.some((t) => t.id === threadId)).toBe(true);
    // پیامِ بعدی گفتگوی تازه می‌سازد (سارا دیگر در قبلی نیست).
    await clearCooldown();
    const fresh = await service.messagePeer(sara(), aliId, 'دوباره سلام');
    expect(fresh).not.toBe(threadId);
  });
});
