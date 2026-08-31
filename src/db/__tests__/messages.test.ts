import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users, userRoles, threads, threadUsers, messages } from '../schema';
import * as service from '@/server/messaging/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/** پیام‌ها از انتها تا انتها. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

let ownerId: number, adminId: number, devId: number, clientId: number;
const owner = () => actor({ id: ownerId, roles: ['owner'], permissions: ['messages.send', 'messages.read'] as Permission[] });
const dev = () => actor({ id: devId, roles: ['member'], permissions: ['messages.send', 'messages.read'] as Permission[] });
const mute = () => actor({ id: devId, roles: ['member'] });

/** بینِ ارسال‌ها مهرِ محدودیت پاک می‌شود تا تست به ۳۰ ثانیه گیر نکند. */
async function clearCooldown() {
  await db.update(users).set({ lastMessageSentAt: null });
}

beforeAll(async () => {
  await sql`truncate table audit_log, messages, thread_users, threads,
    user_roles, users restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'ad@t', name: 'ادمین' },
    { email: 'd@t', name: 'سارا' },
    { email: 'c@t', name: 'کارفرما' },
  ]).returning({ id: users.id });
  [ownerId, adminId, devId, clientId] = u.map((r) => r.id) as [number, number, number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: adminId, role: 'admin' },
    { userId: devId, role: 'member' },
    { userId: clientId, role: 'client' },
  ]);
});

afterAll(async () => { await sql.end(); });

/**
 * پولِ گفت‌وگوی زنده (R-MSG-12).
 *
 * ⚠️ پیش از این، تنظیماتِ `chatPollEnabled`/`chatPollInterval` ذخیره می‌شد
 * ولی **هیچ مصرف‌کننده‌ای** نداشت: گفت‌وگوی باز فقط بعد از پاسخِ خودِ کاربر
 * تازه می‌شد.
 */
describe('پولِ گفت‌وگو', () => {
  let threadId: number;

  beforeAll(async () => {
    await clearCooldown();
    const ids = await service.compose(owner(), {
      recipientIds: [devId], body: 'سلام', allowReply: true,
    });
    threadId = ids[0]!;
  });

  it('اثرانگشتِ یکسان یعنی «تغییری نیست» و داده‌ای برنمی‌گرداند', async () => {
    const first = await service.pollThread(dev(), threadId, '');
    expect(first.changed).toBe(true);

    const second = await service.pollThread(dev(), threadId, first.fingerprint!);
    expect(second.changed).toBe(false);
    expect(second).not.toHaveProperty('messages');
  });

  it('پیامِ تازه اثرانگشت را عوض می‌کند', async () => {
    const before = await service.pollThread(dev(), threadId, '');
    await clearCooldown();
    await service.reply(owner(), threadId, 'پیامِ دوم');

    const after = await service.pollThread(dev(), threadId, before.fingerprint!);
    expect(after.changed).toBe(true);
    expect(after.messages?.length).toBeGreaterThan(1);
  });

  it('⚠️ پولِ تغییردار رسیدِ خواندن را جلو می‌برد', async () => {
    await clearCooldown();
    await service.reply(owner(), threadId, 'پیامِ سوم');

    await service.pollThread(dev(), threadId, 'کهنه');
    const [row] = await db.select({ lastRead: threadUsers.lastReadMessageId })
      .from(threadUsers)
      .where(eq(threadUsers.userId, devId));
    const [last] = await db.select({ id: messages.id })
      .from(messages).where(eq(messages.threadId, threadId)).orderBy(messages.id);
    expect(row!.lastRead).toBeGreaterThanOrEqual(last!.id);
  });

  it('⚠️ غیرعضو «یافت نشد» می‌گیرد، نه محتوا', async () => {
    await expect(service.pollThread(actor({ id: clientId }), threadId, ''))
      .rejects.toThrow();
  });
});


describe('گاردِ ارسال', () => {
  it('بدونِ مجوزِ ارسال پیام فرستاده نمی‌شود', async () => {
    await expect(service.compose(mute(), {
      recipientIds: [ownerId], body: 'سلام', allowReply: true,
    })).rejects.toThrow(ForbiddenError);
  });

  it('متنِ خالی رد می‌شود', async () => {
    await expect(service.compose(owner(), {
      recipientIds: [devId], body: '   ', allowReply: true,
    })).rejects.toThrow(ForbiddenError);
  });
});

describe('⚠️ R-MSG-N1 — هر گیرنده رشتهٔ خودش را دارد', () => {
  it('ارسال به دو نفر، دو گفتگوی دونفره می‌سازد', async () => {
    await clearCooldown();
    const ids = await service.compose(owner(), {
      recipientIds: [devId, clientId], body: 'اعلامیه', allowReply: true,
    });
    expect(ids).toHaveLength(2);

    for (const id of ids) {
      const parts = await db.select().from(threadUsers).where(eq(threadUsers.threadId, id));
      expect(parts).toHaveLength(2);
      expect(parts.map((p) => p.userId)).toContain(ownerId);
    }

    // هر دو رشته با شناسهٔ اولی گروه شده‌اند.
    const rows = await db.select().from(threads).where(eq(threads.broadcastId, ids[0]!));
    expect(rows).toHaveLength(2);
  });

  it('⚠️ گیرنده گفتگوی گیرندهٔ دیگر را نمی‌بیند', async () => {
    const devInbox = await service.listInbox(dev());
    const clientInbox = await service.listInbox(actor({ id: clientId }));
    const devIds = devInbox.threads.map((t) => t.id);
    const clientIds = clientInbox.threads.map((t) => t.id);
    expect(devIds.some((id) => clientIds.includes(id))).toBe(false);
  });
});

describe('⚠️ R-MSG-N3 — پیامِ همکار هم‌مالکِ مدیریت است', () => {
  it('رشتهٔ فرستندهٔ غیرِ مدیر، مدیران را هم دارد', async () => {
    await clearCooldown();
    const ids = await service.compose(dev(), {
      recipientIds: [clientId], body: 'سؤال', allowReply: true,
    });
    const parts = await db.select().from(threadUsers).where(eq(threadUsers.threadId, ids[0]!));
    const userIds = parts.map((p) => p.userId).sort();
    // فرستنده + مالک + ادمین + گیرنده.
    expect(userIds).toEqual([ownerId, adminId, devId, clientId].sort());
  });

  it('رشتهٔ مالک فقط دو نفر دارد', async () => {
    await clearCooldown();
    const ids = await service.compose(owner(), {
      recipientIds: [devId], body: 'خصوصی', allowReply: true,
    });
    const parts = await db.select().from(threadUsers).where(eq(threadUsers.threadId, ids[0]!));
    expect(parts).toHaveLength(2);
  });
});

describe('⚠️ R-MSG-N2 — اعلانِ یک‌طرفه', () => {
  let announcement: number;

  it('گیرنده می‌خواند ولی پاسخ نمی‌دهد', async () => {
    await clearCooldown();
    announcement = (await service.compose(owner(), {
      recipientIds: [devId], body: 'اعلان', allowReply: false,
    }))[0]!;

    const seen = await service.openThread(dev(), announcement);
    expect(seen.messages).toHaveLength(1);
    expect(seen.canReply).toBe(false);

    await clearCooldown();
    await expect(service.reply(dev(), announcement, 'پاسخ')).rejects.toThrow(ForbiddenError);
  });

  it('سازنده در اعلانِ خودش می‌نویسد', async () => {
    await clearCooldown();
    await expect(service.reply(owner(), announcement, 'پیوست')).resolves.toBeGreaterThan(0);
  });

  it('⚠️ غیرِ شرکت‌کننده گفتگو را باز نمی‌کند', async () => {
    await expect(service.openThread(actor({ id: clientId }), announcement))
      .rejects.toThrow(service.ThreadNotFoundError);
  });
});

describe('محدودیتِ ۳۰ ثانیه‌ای', () => {
  it('⚠️ ارسالِ پشتِ‌سرِ هم رد می‌شود', async () => {
    await clearCooldown();
    await service.compose(owner(), { recipientIds: [devId], body: 'یک', allowReply: true });
    await expect(service.compose(owner(), {
      recipientIds: [devId], body: 'دو', allowReply: true,
    })).rejects.toThrow(service.RateLimitedError);
  });

  it('⚠️ تلاشِ ناموفق کاربر را قفل نمی‌کند', async () => {
    // مهر فقط پس از ارسالِ موفق زده می‌شود.
    await clearCooldown();
    await expect(service.compose(owner(), {
      recipientIds: [devId], body: '  ', allowReply: true,
    })).rejects.toThrow(ForbiddenError);
    await expect(service.compose(owner(), {
      recipientIds: [devId], body: 'حالا درست', allowReply: true,
    })).resolves.toHaveLength(1);
  });
});

describe('صندوق و حذف', () => {
  it('رسیدِ خواندن جلو می‌رود و خوانده‌نشده صفر می‌شود', async () => {
    const before = await service.listInbox(dev());
    const withUnread = before.threads.find((t) => t.unread > 0);
    expect(withUnread).toBeDefined();

    await service.openThread(dev(), withUnread!.id);
    const after = await service.listInbox(dev());
    expect(after.threads.find((t) => t.id === withUnread!.id)!.unread).toBe(0);
  });

  it('⚠️ حذفِ گفتگو فقط از صندوقِ خودم است؛ طرفِ مقابل نگهش می‌دارد', async () => {
    await clearCooldown();
    const id = (await service.compose(owner(), {
      recipientIds: [devId], body: 'ماندگار', allowReply: true,
    }))[0]!;

    await service.leaveThread(dev(), id);
    expect((await service.listInbox(dev())).threads.map((t) => t.id)).not.toContain(id);
    expect((await service.listInbox(owner())).threads.map((t) => t.id)).toContain(id);
    // پیام‌ها دست‌نخورده مانده‌اند.
    expect(await db.select().from(messages).where(eq(messages.threadId, id))).toHaveLength(1);
  });
});

/**
 * «پیام به مدیریت».
 * ⚠️ نکتهٔ اصلی: **یک** رشتهٔ مشترک، نه یکی به‌ازای هر مدیر.
 */
describe('پیام به مدیریت', () => {
  it('یک رشتهٔ مشترک با همهٔ مدیران می‌سازد', async () => {
    await clearCooldown();
    const threadId = await service.contactManagement(dev(), 'یک مشکل دارم');

    const parts = await db.select({ userId: threadUsers.userId })
      .from(threadUsers).where(eq(threadUsers.threadId, threadId));
    const ids = parts.map((p) => p.userId).sort((a, b) => a - b);
    expect(ids).toEqual([ownerId, adminId, devId].sort((a, b) => a - b));

    // کارفرما در آن نیست.
    expect(ids).not.toContain(clientId);
  });

  it('⚠️ بدونِ مجوزِ messages.send هم کار می‌کند', async () => {
    await clearCooldown();
    // `mute()` هیچ مجوزی ندارد؛ ارسالِ عادی برایش ممنوع است.
    await expect(service.compose(mute(), {
      recipientIds: [ownerId], body: 'سلام', allowReply: true,
    })).rejects.toThrow(ForbiddenError);

    await clearCooldown();
    const threadId = await service.contactManagement(mute(), 'ولی این باید برسد');
    expect(threadId).toBeGreaterThan(0);
  });

  it('رشته پاسخ‌پذیر است', async () => {
    await clearCooldown();
    const threadId = await service.contactManagement(dev(), 'سؤال');
    const rows = await db.select().from(threads).where(eq(threads.id, threadId));
    expect(rows[0]!.allowReply).toBe(true);

    await clearCooldown();
    await expect(service.reply(owner(), threadId, 'جوابِ مدیر')).resolves.toBeGreaterThan(0);
  });

  it('⚠️ مدیرِ فرستنده با خودش هم‌رشته نمی‌شود', async () => {
    await clearCooldown();
    const threadId = await service.contactManagement(owner(), 'یادداشتِ داخلی');
    const parts = await db.select({ userId: threadUsers.userId })
      .from(threadUsers).where(eq(threadUsers.threadId, threadId));
    // مالک + ادمین — نه مالکِ تکراری.
    expect(parts.map((p) => p.userId).sort((a, b) => a - b))
      .toEqual([ownerId, adminId].sort((a, b) => a - b));
  });

  it('متنِ خالی رد می‌شود', async () => {
    await clearCooldown();
    await expect(service.contactManagement(dev(), '   ')).rejects.toThrow(ForbiddenError);
  });

  it('محدودیتِ زمانی اینجا هم اعمال می‌شود', async () => {
    await clearCooldown();
    await service.contactManagement(dev(), 'اولی');
    await expect(service.contactManagement(dev(), 'دومی')).rejects.toThrow();
  });
});
