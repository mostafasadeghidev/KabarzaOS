import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { notifications, projectClients, projectMembers, projects, tags, tasks, userRoles, users } from '../schema';
import { handleUpdate, resetBotState, setTelegramApi, type TgUpdate } from '@/server/telegram/bot';
import { createProjectGroupLink } from '@/server/telegram/group';
import { groupInviteFor } from '@/server/telegram/group-members';
import { announceComment, announceTask } from '@/server/telegram/group';
import { miniAppLogin } from '@/server/telegram/webapp';
import { decodeStartParam, encodeStartParam, signInitData } from '@/domain/telegram/webapp';
import { saveSystemConfig } from '@/server/settings/system-service';
import { addProjectMember, setProjectAccess } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * گروهِ تلگرامِ پروژه با دعوتِ خودکار (۲.۳۶.۰): لینکِ عضویت، دعوتِ تیم، پذیرشِ فقط
 * اعضای تیم، بیرون‌کردنِ رفته‌ها. ⚠️ تلگرام جعلی است؛ سرویس‌ها و دیتابیس واقعی.
 */

let OWNER = 0, MEMBER = 0, OTHER = 0, CLIENT = 0, NEWBIE = 0, P = 0, ROLE = 0;
const C = { owner: 9900000, member: 9900001, other: 9900002, client: 9900003, newbie: 9900004 };
const GROUP = -100990, SUPER = -100991;
const INVITE = 'https://t.me/+kbzInviteTest';
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

/** همهٔ فراخوان‌های تلگرام — از ربات (setTelegramApi) و از سرویسِ گروه (fetch). */
let calls: Array<{ method: string; body: Record<string, unknown> }> = [];
let nextId = 1;
const method = (name: string) => calls.filter((c) => c.method === name);
const dmTo = (chat: number) => method('sendMessage').filter((c) => String(c.body.chat_id) === String(chat));

const groupMsg = (text: string, from = C.owner, chat = GROUP): TgUpdate =>
  ({ update_id: nextId++, message: { message_id: nextId, text, chat: { id: chat, type: 'group' }, from: { id: from } } });

beforeAll(async () => {
  await sql`truncate table notifications, project_clients, project_members, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'own@g', name: 'مالک', telegramChatId: String(C.owner) },
    { email: 'mem@g', name: 'عضو', telegramChatId: String(C.member) },
    { email: 'oth@g', name: 'غریبه', telegramChatId: String(C.other) },
    { email: 'cli@g', name: 'کارفرما', telegramChatId: String(C.client) },
    { email: 'new@g', name: 'تازه', telegramChatId: String(C.newbie) },
  ]).returning({ id: users.id });
  [OWNER, MEMBER, OTHER, CLIENT, NEWBIE] = u.map((r) => r.id) as [number, number, number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: MEMBER, role: 'member' }, { userId: OTHER, role: 'member' },
    { userId: CLIENT, role: 'client' }, { userId: NEWBIE, role: 'member' },
  ]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  ROLE = role!.id;
  const [p] = await db.insert(projects).values({ title: 'بتا', scope: 'company' }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: MEMBER, roleTagId: ROLE });
  await db.insert(projectClients).values({ projectId: P, userId: CLIENT });
  // پیکربندیِ سامانه بینِ فایل‌های تست می‌ماند — زبانِ پیش‌فرض صریح.
  await saveSystemConfig(as(OWNER, ['owner']), { defaultLocale: 'fa' });
});

beforeEach(() => {
  calls = [];
  resetBotState();
  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAGroupJoinTestTokenForUnitTests0000';
  process.env.TELEGRAM_BOT_USERNAME = 'kabarza_bot';
  setTelegramApi(async (m, body) => { calls.push({ method: m, body }); return { ok: true, result: { message_id: 1 } }; });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const m = url.split('/').at(-1)!;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method: m, body });
    if (m === 'createChatInviteLink') return Response.json({ ok: true, result: { invite_link: INVITE } });
    return Response.json({ ok: true, result: {} });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setTelegramApi(null);
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
});

describe('گروهِ تلگرامِ پروژه با دعوتِ خودکار', () => {
  it('لینکِ «افزودنِ ربات» ربات را از همان اول مدیر می‌خواهد', async () => {
    const link = await createProjectGroupLink(as(OWNER, ['owner']), P);
    expect(link).toMatch(/[?&]admin=invite_users\+restrict_members/);
  });

  it('وصل‌شدن ← لینکِ عضویت و دعوتِ فقط اعضای تیم (تلگرام و برنامه)', async () => {
    const link = await createProjectGroupLink(as(OWNER, ['owner']), P);
    const token = new URL(link!).searchParams.get('startgroup')!;
    await handleUpdate(groupMsg(`/start@kabarza_bot ${token}`));

    const [row] = await db.select().from(projects).where(eq(projects.id, P));
    expect(row!.telegramGroupId).toBe(String(GROUP));
    expect(row!.telegramGroupInvite).toBe(INVITE);
    expect(method('createChatInviteLink')[0]!.body.creates_join_request).toBe(true);

    const dm = dmTo(C.member);
    expect(dm).toHaveLength(1);
    expect(JSON.stringify(dm[0]!.body.reply_markup)).toContain(INVITE);
    // کارفرما و غریبه دعوت نمی‌شوند.
    expect(dmTo(C.client)).toHaveLength(0);
    expect(dmTo(C.other)).toHaveLength(0);
    const inApp = await db.select().from(notifications).where(and(eq(notifications.userId, MEMBER), eq(notifications.type, 'project.telegram_group')));
    expect(inApp).toHaveLength(1);
    // گروه می‌فهمد چند نفر دعوت شدند.
    expect(method('sendMessage').some((c) => c.body.chat_id === GROUP && String(c.body.text).includes('1'))).toBe(true);
  });

  it('رویدادِ تکراریِ «مدیر شد» دعوتِ دوباره نمی‌فرستد', async () => {
    await handleUpdate({ update_id: nextId++, my_chat_member: { chat: { id: GROUP, type: 'group' }, new_chat_member: { status: 'administrator' } } });
    expect(dmTo(C.member)).toHaveLength(0);
    expect(method('createChatInviteLink')).toHaveLength(0);
  });

  it('درخواستِ عضویت: عضوِ تیم پذیرفته، غریبه و کارفرما و ناشناس رد', async () => {
    const ask = (from: number) => handleUpdate({ update_id: nextId++, chat_join_request: { chat: { id: GROUP, type: 'group' }, from: { id: from }, user_chat_id: from } });
    await ask(C.member);
    await ask(C.other);
    await ask(C.client);
    await ask(4242);
    expect(method('approveChatJoinRequest').map((c) => c.body.user_id)).toEqual([C.member]);
    expect(method('declineChatJoinRequest').map((c) => c.body.user_id)).toEqual([C.other, C.client, 4242]);
    // ردشده می‌فهمد چرا.
    expect(String(dmTo(C.other)[0]?.body.text)).toContain('تأیید نشد');
  });

  it('لینکِ «پیوستن» در صفحهٔ پروژه فقط برای کسی که حقِ عضویت دارد', async () => {
    expect(await groupInviteFor(as(MEMBER, ['member']), P)).toBe(INVITE);
    expect(await groupInviteFor(as(CLIENT, ['client']), P)).toBeNull();
    expect(await groupInviteFor(as(OTHER, ['member']), P)).toBeNull();
  });

  it('عضوِ تازهٔ پروژه خودکار دعوت می‌شود', async () => {
    await addProjectMember(as(OWNER, ['owner']), P, { userId: NEWBIE, roleTagId: ROLE, agreedAmount: '0' });
    await vi.waitFor(() => expect(dmTo(C.newbie)).toHaveLength(1), { timeout: 5000 });
  });

  it('قطعِ دسترسی ← بیرون از گروه (ban و بلافاصله unban)', async () => {
    await setProjectAccess(as(OWNER, ['owner']), P, NEWBIE, true);
    await vi.waitFor(() => expect(method('banChatMember').map((c) => c.body.user_id)).toEqual([C.newbie]), { timeout: 5000 });
    await vi.waitFor(() => expect(method('unbanChatMember')).toHaveLength(1), { timeout: 5000 });
  });

  it('گروهی که سوپرگروه شد: شناسهٔ تازه و لینکِ تازه', async () => {
    await handleUpdate({ update_id: nextId++, message: { message_id: nextId, chat: { id: GROUP, type: 'group' }, migrate_to_chat_id: SUPER } });
    const [row] = await db.select().from(projects).where(eq(projects.id, P));
    expect(row!.telegramGroupId).toBe(String(SUPER));
    expect(method('createChatInviteLink')[0]!.body.chat_id).toBe(String(SUPER));
  });

  it('ربات از گروه بیرون شد ← گروه از پروژه جدا', async () => {
    await handleUpdate({ update_id: nextId++, my_chat_member: { chat: { id: SUPER, type: 'supergroup' }, new_chat_member: { status: 'kicked' } } });
    const [row] = await db.select().from(projects).where(eq(projects.id, P));
    expect(row!.telegramGroupId).toBe('');
    expect(row!.telegramGroupInvite).toBe('');
  });

  it('با نامِ کوتاهِ مینی‌اپ، دکمهٔ پیامِ گروه لینکِ مستقیم است و مقصد را می‌برد (۲.۴۰.۰)', async () => {
    await db.update(projects).set({ telegramGroupId: String(GROUP) }).where(eq(projects.id, P));
    await saveSystemConfig(as(OWNER, ['owner']), { telegramAppName: 'https://t.me/kabarza_bot/crm' });
    try {
      await announceComment(P, MEMBER, 'سلام');
      const post = method('sendMessage').find((c) => c.body.chat_id === String(GROUP));
      const url = JSON.stringify(post?.body.reply_markup).match(/https:\/\/t\.me\/kabarza_bot\/crm\?startapp=([A-Za-z0-9_-]+)/);
      expect(url).not.toBeNull();
      expect(decodeStartParam(url![1]!)).toBe(`/projects/${P}?tab=comments`);
    } finally {
      await saveSystemConfig(as(OWNER, ['owner']), { telegramAppName: '' });
    }
  });

  it('ورودِ مینی‌اپ با start_param ِ امضاشده به همان صفحه می‌رود', async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = signInitData({
      auth_date: String(now), user: JSON.stringify({ id: C.member }), start_param: encodeStartParam(`/projects/${P}?tab=tasks`)!,
    }, process.env.TELEGRAM_BOT_TOKEN!);
    const out = await miniAppLogin(initData);
    expect(out).toMatchObject({ ok: true, userId: MEMBER, next: `/projects/${P}?tab=tasks` });
    const evil = signInitData({ auth_date: String(now), user: JSON.stringify({ id: C.member }), start_param: encodeStartParam('//evil.com')! }, process.env.TELEGRAM_BOT_TOKEN!);
    expect(await miniAppLogin(evil)).toMatchObject({ ok: true, next: null });
  });

  it('زبانِ گروه = زبانِ مدیرِ کل، نه پیش‌فرضِ سامانه؛ پیامِ انجام‌شده با پیشرفت (۲.۴۰.۰)', async () => {
    await db.update(projects).set({ telegramGroupId: String(GROUP) }).where(eq(projects.id, P));
    const [task] = await db.insert(tasks).values({ projectId: P, title: 'Style your message box', createdBy: OWNER }).returning({ id: tasks.id });
    try {
      await saveSystemConfig(as(OWNER, ['owner']), { defaultLocale: 'en' });
      await db.update(users).set({ locale: 'fa' }).where(eq(users.id, OWNER));
      await announceTask(task!.id, 'done', MEMBER);
      const post = method('sendMessage').find((c) => c.body.chat_id === String(GROUP));
      const text = String(post?.body.text);
      expect(text).toContain('تسک انجام شد');
      expect(text).toContain('Style your message box');
      expect(text).toContain('دولوپر');
      expect(text).toMatch(/▰|▱/);
      expect(text).not.toContain('Done');

      calls = [];
      await db.update(users).set({ locale: 'en' }).where(eq(users.id, OWNER));
      await announceComment(P, MEMBER, 'hello');
      expect(String(method('sendMessage').find((c) => c.body.chat_id === String(GROUP))?.body.text)).toContain('New comment');
    } finally {
      await saveSystemConfig(as(OWNER, ['owner']), { defaultLocale: 'fa' });
      await db.update(users).set({ locale: null }).where(eq(users.id, OWNER));
    }
  });
});
