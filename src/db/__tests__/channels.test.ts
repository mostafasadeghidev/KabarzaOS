import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, messages, notifications, offices, projectClients, projectMembers, projects, tagRelations, tags,
  threads, threadUsers, userOffices, userRoles, users,
} from '../schema';
import * as service from '@/server/messaging/service';
import { deleteProjectGroupsTx } from '@/server/messaging/groups';
import { ForbiddenError } from '@/domain/access/guard';
import { ChannelError } from '@/domain/messaging/channels';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * کانالِ تیم و گروهِ پروژه — قواعدی که فقط با دیتابیسِ واقعی ثابت می‌شوند:
 * عضویتِ زنده، کارفرما بیرون، منشنِ امن، اعلانِ جمع‌شده، بی‌صدا، بایگانی و پاک‌سازی.
 */

let OWNER = 0, DESIGNER = 0, DEV = 0, OTHER = 0, BLOCKED = 0, CLIENT = 0, FORMER = 0, OFFICE_MGR = 0;
let PROJECT = 0, ARCHIVED = 0, DESIGN_TAG = 0, OFFICE = 0;

const actor = (id: number, roles: string[], permissions: string[] = []): Actor =>
  ({ id, roles: roles as Actor['roles'], permissions: permissions as Permission[], privateAccess: false });
const owner = () => actor(OWNER, ['owner'], ['messages.send', 'projects.manage']);
const member = (id: number) => actor(id, ['member']);

async function notes(userId: number, type?: string) {
  return db.select().from(notifications).where(and(
    eq(notifications.userId, userId),
    type ? eq(notifications.type, type) : undefined,
  ));
}

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, messages, thread_users, threads, project_clients,
    project_members, projects, tag_relations, tags, user_offices, offices, user_roles, users, currencies
    restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });

  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'des@t', name: 'سمیرا' },
    { email: 'dev@t', name: 'سارا' },
    { email: 'oth@t', name: 'امید' },
    { email: 'blk@t', name: 'بهرام' },
    { email: 'cl@t', name: 'کارفرما' },
    { email: 'fo@t', name: 'رفته', memberState: 'locked' },
    { email: 'om@t', name: 'مدیرِ دفتر' },
  ]).returning({ id: users.id });
  [OWNER, DESIGNER, DEV, OTHER, BLOCKED, CLIENT, FORMER, OFFICE_MGR] = u.map((r) => r.id) as [number, number, number, number, number, number, number, number];

  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' },
    ...[DESIGNER, DEV, OTHER, BLOCKED, FORMER, OFFICE_MGR].map((userId) => ({ userId, role: 'member' as const })),
    { userId: CLIENT, role: 'client' },
  ]);

  const t = await db.insert(tags).values([
    { name: 'طراح', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status' },
  ]).returning({ id: tags.id });
  DESIGN_TAG = t[0]!.id;
  await db.insert(tagRelations).values({ tagId: DESIGN_TAG, objectId: DESIGNER, objectType: 'user' });

  const o = await db.insert(offices).values({ name: 'تهران' }).returning({ id: offices.id });
  OFFICE = o[0]!.id;
  await db.insert(userOffices).values([
    { userId: DEV, officeId: OFFICE },
    { userId: OFFICE_MGR, officeId: OFFICE, manages: true },
  ]);

  const p = await db.insert(projects).values([
    { title: 'سایتِ آلفا', price: '0', statusTagId: t[1]!.id, officeId: OFFICE },
    { title: 'بایگانی', price: '0', statusTagId: t[1]!.id, isArchived: true },
  ]).returning({ id: projects.id });
  PROJECT = p[0]!.id; ARCHIVED = p[1]!.id;
  await db.insert(projectMembers).values([
    { projectId: PROJECT, userId: DEV, agreedAmount: '0' },
    { projectId: PROJECT, userId: BLOCKED, agreedAmount: '0', accessBlocked: true },
    { projectId: PROJECT, userId: FORMER, agreedAmount: '0' },
    // ⚠️ کارفرمایی که اشتباهی عضوِ پروژه هم ثبت شده — باز هم نباید در گروه باشد.
    { projectId: PROJECT, userId: CLIENT, agreedAmount: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: PROJECT, userId: CLIENT });
});

afterAll(async () => { await sql.end(); });

describe('کانالِ تیم', () => {
  let all = 0, designers = 0;

  beforeAll(async () => {
    all = await service.createChannel(owner(), { title: 'عمومیِ تیم', audience: { type: 'all' }, allowReply: true, body: 'خوش آمدید' });
    designers = await service.createChannel(owner(), {
      title: 'طراحان', audience: { type: 'role', tagId: DESIGN_TAG }, allowReply: true,
    });
  });

  it('فقط مدیر کانال می‌سازد، و مخاطبِ نامعتبر پذیرفته نمی‌شود', async () => {
    await expect(service.createChannel(member(DEV), { title: 'x', audience: { type: 'all' }, allowReply: true }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.createChannel(owner(), { title: 'x', audience: { type: 'role', tagId: 9999 }, allowReply: true }))
      .rejects.toBeInstanceOf(ChannelError);
  });

  it('صندوقِ هر نفر فقط کانال‌های خودش؛ کارفرما و عضوِ سابق هیچ', async () => {
    const ids = async (a: Actor) => (await service.listInbox(a)).threads.filter((r) => r.kind === 'channel').map((r) => r.id);
    expect((await ids(member(DESIGNER))).sort()).toEqual([all, designers].sort());
    expect(await ids(member(DEV))).toEqual([all]);
    expect(await ids(actor(CLIENT, ['client']))).toEqual([]);
    expect(await ids(member(FORMER))).toEqual([]);
    await expect(service.openThread(actor(CLIENT, ['client']), all)).rejects.toThrow();
  });

  it('⚠️ پیامِ عادیِ کانال هیچ اعلانی نمی‌سازد؛ منشن می‌سازد', async () => {
    const before = (await notes(DESIGNER, 'message.mention')).length;
    await service.reply(member(DEV), all, 'سلام همه');
    expect((await notes(DESIGNER)).filter((n) => n.type !== 'message.channel').length).toBe(0);
    await service.reply(member(DEV), all, `<@${DESIGNER}> یک نگاه بینداز`);
    expect((await notes(DESIGNER, 'message.mention')).length).toBe(before + 1);
  });

  it('⚠️ منشنِ غیرعضو و «همه» ِ بی‌اجازه متنِ ساده می‌شوند', async () => {
    await service.reply(member(DEV), all, `<@${CLIENT}> و <@all>`);
    const [last] = await db.select({ body: messages.body }).from(messages)
      .where(eq(messages.threadId, all)).orderBy(desc(messages.id)).limit(1);
    expect(last!.body).toBe('@ و @');
    expect((await notes(CLIENT)).length).toBe(0);
  });

  it('از کانال نمی‌شود «بیرون رفت»؛ بی‌صدا می‌شود و از شمارنده بیرون می‌رود', async () => {
    await expect(service.leaveThread(member(DESIGNER), all)).rejects.toBeInstanceOf(ForbiddenError);
    await service.reply(member(DEV), all, 'پیامِ تازه');
    const loud = await service.unreadMessageCount(member(DESIGNER));
    expect(loud).toBeGreaterThan(0);
    await service.setThreadMuted(member(DESIGNER), all, true);
    expect(await service.unreadMessageCount(member(DESIGNER))).toBe(0);
    await service.setThreadMuted(member(DESIGNER), all, false);
  });

  it('کانالِ «فقط اعلان»: عضو نمی‌نویسد، مدیر می‌نویسد', async () => {
    const ann = await service.createChannel(owner(), { title: 'اطلاعیه', audience: { type: 'all' }, allowReply: false });
    await expect(service.reply(member(DEV), ann, 'سلام')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.reply(owner(), ann, 'جلسه فردا')).resolves.toBeGreaterThan(0);
  });
});

describe('گروهِ پروژه', () => {
  let group = 0;

  it('فقط مدیر یا مدیرِ همان پروژه می‌سازد؛ یکی به‌ازای هر پروژه', async () => {
    await expect(service.createProjectGroup(member(OTHER), PROJECT)).rejects.toBeInstanceOf(ForbiddenError);
    group = await service.createProjectGroup(owner(), PROJECT);
    expect(await service.createProjectGroup(owner(), PROJECT)).toBe(group);
    await expect(service.createProjectGroup(owner(), ARCHIVED)).rejects.toBeInstanceOf(ChannelError);
  });

  it('⚠️ اعضا: عضوِ پروژه، مدیرِ دفتر و مالک — نه دسترسیِ بسته، نه سابق، نه کارفرما، نه غیرعضو', async () => {
    const sees = async (id: number, roles = ['member']) =>
      (await service.listInbox(actor(id, roles))).threads.some((r) => r.id === group);
    expect(await sees(DEV)).toBe(true);
    expect(await sees(OFFICE_MGR)).toBe(true);
    expect(await sees(OWNER, ['owner'])).toBe(true);
    expect(await sees(BLOCKED)).toBe(false);
    expect(await sees(FORMER)).toBe(false);
    expect(await sees(CLIENT, ['client'])).toBe(false);
    expect(await sees(OTHER)).toBe(false);
    await expect(service.reply(member(OTHER), group, 'سلام')).rejects.toThrow();
  });

  it('پیامِ عادی: اعلانِ گروه (بی‌ایمیل) و جمع‌شده — دومی اعلانِ دوم نمی‌سازد', async () => {
    await db.delete(notifications);
    await service.reply(owner(), group, 'شروع کنیم');
    await service.reply(owner(), group, 'پیامِ دوم');
    expect((await notes(DEV, 'message.group')).length).toBe(1);
    // خواندنِ گروه اعلان را خوانده می‌کند؛ پیامِ بعدی دوباره خبر می‌دهد.
    await service.openThread(member(DEV), group);
    await service.reply(owner(), group, 'پیامِ سوم');
    expect((await notes(DEV, 'message.group')).length).toBe(2);
  });

  it('منشن در گروه: اعلانِ منشن به‌جای اعلانِ گروه، حتی اگر بی‌صدا کرده باشد', async () => {
    await db.delete(notifications);
    await service.setThreadMuted(member(DEV), group, true);
    await service.reply(owner(), group, `<@${DEV}> فایل را ببین`);
    expect((await notes(DEV, 'message.mention')).length).toBe(1);
    expect((await notes(DEV, 'message.group')).length).toBe(0);
    await service.setThreadMuted(member(DEV), group, false);
  });

  it('⚠️ برداشتنِ عضو از پروژه همان لحظه دسترسی را می‌بندد', async () => {
    await db.update(projectMembers).set({ accessBlocked: true })
      .where(and(eq(projectMembers.projectId, PROJECT), eq(projectMembers.userId, DEV)));
    try {
      await expect(service.openThread(member(DEV), group)).rejects.toThrow();
      const inbox = await service.listInbox(member(DEV));
      expect(inbox.threads.some((r) => r.id === group)).toBe(false);
    } finally {
      await db.update(projectMembers).set({ accessBlocked: false })
        .where(and(eq(projectMembers.projectId, PROJECT), eq(projectMembers.userId, DEV)));
    }
  });

  it('پروژهٔ بایگانی‌شده: گروه فقط‌خواندنی', async () => {
    await db.update(projects).set({ isArchived: true }).where(eq(projects.id, PROJECT));
    try {
      await expect(service.reply(owner(), group, 'سلام')).rejects.toBeInstanceOf(ChannelError);
      const view = await service.openThread(member(DEV), group);
      expect(view.group?.readOnly).toBe('archived');
    } finally {
      await db.update(projects).set({ isArchived: false }).where(eq(projects.id, PROJECT));
    }
  });

  it('حذفِ تک‌پیام: نویسنده و مدیر بله، بقیه نه', async () => {
    const mine = await service.reply(member(DEV), group, 'اشتباه نوشتم');
    const ownerMsg = await service.reply(owner(), group, 'پیامِ مدیر');
    await expect(service.deleteGroupMessage(member(DEV), ownerMsg)).rejects.toBeInstanceOf(ForbiddenError);
    await service.deleteGroupMessage(member(DEV), mine);
    await service.deleteGroupMessage(owner(), ownerMsg);
    expect((await db.select().from(messages).where(eq(messages.id, mine))).length).toBe(0);
  });

  it('⚠️ پاک‌سازی: پیامِ گروهِ پروژه ۹۰ روز، و خودِ گروه هرگز با کهنه شدن نمی‌رود', async () => {
    const old = new Date(Date.now() - 100 * 86400000);
    const recent = new Date(Date.now() - 50 * 86400000);
    await db.delete(messages).where(eq(messages.threadId, group));
    await db.insert(messages).values([
      { threadId: group, fromUserId: OWNER, body: 'خیلی قدیمی', createdAt: old },
      { threadId: group, fromUserId: OWNER, body: 'پنجاه روزه', createdAt: recent },
    ]);
    // حتی با «هرگز» برای بقیه، گروهِ پروژه ۹۰ روزه هرس می‌شود.
    await service.purgeMessages(0);
    const left = await db.select({ body: messages.body }).from(messages).where(eq(messages.threadId, group));
    expect(left.map((m) => m.body)).toEqual(['پنجاه روزه']);
    // پاک‌سازیِ ۳۰ روزه پیامِ پنجاه‌روزه را هم می‌برد ولی گروه را نه.
    await service.purgeMessages(30);
    expect((await db.select().from(threads).where(eq(threads.id, group))).length).toBe(1);
  });

  it('⚠️ حذف/سبک‌سازیِ پروژه گروه را با پیام و اعلانش پاک می‌کند', async () => {
    await service.reply(owner(), group, 'آخرین');
    await db.transaction(async (tx) => { await deleteProjectGroupsTx(tx, PROJECT); });
    expect((await db.select().from(threads).where(eq(threads.id, group))).length).toBe(0);
    expect((await db.select().from(messages).where(eq(messages.threadId, group))).length).toBe(0);
    expect((await db.select().from(threadUsers).where(eq(threadUsers.threadId, group))).length).toBe(0);
    expect((await db.select().from(notifications).where(eq(notifications.url, `/messages/${group}`))).length).toBe(0);
  });
});

describe('گفتگوی دونفره دست‌نخورده', () => {
  it('توکنِ منشن در پیامِ دونفره متنِ ساده می‌شود', async () => {
    await db.update(users).set({ lastMessageSentAt: null });
    const [id] = await service.compose(owner(), { recipientIds: [DEV], body: `سلام <@${OTHER}>`, allowReply: true });
    const [row] = await db.select({ body: messages.body }).from(messages).where(eq(messages.threadId, id!));
    expect(row!.body).toBe('سلام @');
  });
});
