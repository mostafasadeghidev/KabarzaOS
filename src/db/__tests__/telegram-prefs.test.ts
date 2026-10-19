import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { notifications, projectMembers, projects, tags, tasks, timelogs, userRoles, users } from '../schema';
import { handleUpdate, resetBotState, sendEveningReport, sendQuietDigest, setTelegramApi, type TgUpdate } from '@/server/telegram/bot';
import { notify } from '@/server/notifications/service';
import { normalizePrefs } from '@/domain/telegram/prefs';

/**
 * تنظیماتِ ربات (۲.۴۱.۰): دسته‌های خاموش، ساعتِ سکوت، گزارشِ عصر، خلاصهٔ سکوت، زبان،
 * و دستورهای «/» در گروه. ⚠️ تلگرام جعلی است؛ سرویس‌ها و دیتابیس واقعی.
 */

let MEMBER = 0, P = 0;
const CHAT = 7700001, GROUP = -100770;

let bot: Array<{ method: string; body: Record<string, unknown> }> = [];
let direct: Array<{ method: string; body: Record<string, unknown> }> = [];
let nextId = 1;
const texts = () => bot.filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText').map((c) => String(c.body.text));
const buttons = () => bot.flatMap((c) => ((c.body.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>> })?.inline_keyboard ?? []).flat());
const press = (data: string): TgUpdate => ({ update_id: nextId++, callback_query: { id: `q${nextId}`, data, from: { id: CHAT }, message: { message_id: 3, chat: { id: CHAT, type: 'private' } } } });
const groupMsg = (text: string, from = CHAT): TgUpdate => ({ update_id: nextId++, message: { message_id: nextId, text, chat: { id: GROUP, type: 'supergroup' }, from: { id: from } } });
const prefsOf = async () => normalizePrefs((await db.select({ p: users.telegramPrefs }).from(users).where(eq(users.id, MEMBER)))[0]!.p);
const sentToMember = () => direct.filter((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(CHAT));

beforeAll(async () => {
  await sql`truncate table notifications, timelogs, tasks, project_members, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'p@tg', name: 'سارا', telegramChatId: String(CHAT), timezone: 'UTC', locale: 'fa' }).returning({ id: users.id });
  MEMBER = u!.id;
  await db.insert(userRoles).values({ userId: MEMBER, role: 'member' });
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const [done] = await db.insert(tags).values({ name: 'انجام شد', type: 'task_status', statusGroup: 'complete' }).returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'گاما', scope: 'company', telegramGroupId: String(GROUP) }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: MEMBER, roleTagId: role!.id });
  await db.insert(tasks).values([
    { projectId: P, title: 'تسکِ بازِ عمومی', createdBy: MEMBER },
    { projectId: P, title: 'SECRET-PRIVATE', createdBy: MEMBER, isPrivate: true },
    { projectId: P, title: 'کارِ تمام‌شدهٔ امروز', createdBy: MEMBER, assignedTo: MEMBER, statusTagId: done!.id },
  ]);
});

beforeEach(() => {
  bot = [];
  direct = [];
  resetBotState();
  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAPrefsTestTokenForUnitTestsOnly00000';
  process.env.TELEGRAM_BOT_USERNAME = 'kabarza_bot';
  setTelegramApi(async (method, body) => { bot.push({ method, body }); return { ok: true, result: { message_id: 1 } }; });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    direct.push({ method: url.split('/').at(-1)!, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {} });
    return Response.json({ ok: true, result: { message_id: 1 } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setTelegramApi(null);
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
});

describe('منوی تنظیماتِ ربات', () => {
  it('هر دکمه همان ترجیح را عوض می‌کند', async () => {
    await handleUpdate(press('m:set'));
    expect(texts().join('\n')).toContain('تنظیماتِ ربات');
    expect(buttons().map((b) => b.callback_data)).toEqual(expect.arrayContaining(['s:c:tasks', 's:q', 's:e', 's:b', 's:l']));

    await handleUpdate(press('s:c:tasks'));
    expect((await prefsOf()).off).toEqual(['tasks']);
    await handleUpdate(press('s:q'));
    expect((await prefsOf()).quiet).toEqual({ from: '22:00', to: '08:00' });
    await handleUpdate(press('s:e'));
    expect((await prefsOf()).evening).toBe('17:00');
    await handleUpdate(press('s:c:tasks'));
    expect((await prefsOf()).off).toEqual([]);
    await handleUpdate(press('s:q'));
    await handleUpdate(press('s:q'));
    await handleUpdate(press('s:q'));
    await handleUpdate(press('s:q'));
    expect((await prefsOf()).quiet).toBeNull();
  });

  it('زبان از داخلِ ربات عوض می‌شود', async () => {
    await handleUpdate(press('s:L:en'));
    expect((await db.select({ l: users.locale }).from(users).where(eq(users.id, MEMBER)))[0]!.l).toBe('en');
    expect(texts().join('\n')).toContain('Bot settings');
    await db.update(users).set({ locale: 'fa' }).where(eq(users.id, MEMBER));
  });
});

describe('دسته‌های خاموش و ساعتِ سکوت', () => {
  const ping = () => notify([MEMBER], { type: 'task.assigned', title: 'تسکِ تازه برای شما', url: '/tasks' });

  it('دستهٔ خاموش: در برنامه می‌نشیند، به تلگرام نمی‌رود', async () => {
    await db.update(users).set({ telegramPrefs: { off: ['tasks'] } }).where(eq(users.id, MEMBER));
    await ping();
    expect(sentToMember()).toHaveLength(0);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, MEMBER));
    expect(rows.some((r) => r.title === 'تسکِ تازه برای شما')).toBe(true);
  });

  it('ساعتِ سکوت: داخلش نمی‌رود، بیرونش می‌رود', async () => {
    const h = new Date().getUTCHours();
    const pad = (n: number) => String((n + 24) % 24).padStart(2, '0');
    await db.update(users).set({ telegramPrefs: { quiet: { from: `${pad(h)}:00`, to: `${pad(h + 1)}:00` } } }).where(eq(users.id, MEMBER));
    await ping();
    expect(sentToMember()).toHaveLength(0);
    await db.update(users).set({ telegramPrefs: { quiet: { from: `${pad(h + 2)}:00`, to: `${pad(h + 3)}:00` } } }).where(eq(users.id, MEMBER));
    await ping();
    expect(sentToMember()).toHaveLength(1);
    await db.update(users).set({ telegramPrefs: {} }).where(eq(users.id, MEMBER));
  });

  it('خلاصهٔ پایانِ سکوت همان اعلان‌ها را می‌آورد و دستهٔ خاموش را نه', async () => {
    const since = new Date(Date.now() - 60_000);
    await db.insert(notifications).values([
      { userId: MEMBER, type: 'message.received', title: 'پیامِ شبانه' },
      { userId: MEMBER, type: 'task.assigned', title: 'تسکِ شبانه' },
    ]);
    expect(await sendQuietDigest(MEMBER, since, ['tasks'])).toBe(true);
    const text = texts().join('\n');
    expect(text).toContain('پیامِ شبانه');
    expect(text).not.toContain('تسکِ شبانه');
    expect(await sendQuietDigest(MEMBER, new Date(), [])).toBe(false);
  });
});

describe('گزارشِ عصر', () => {
  it('کارِ انجام‌شدهٔ امروز و ساعتِ ثبت‌شده', async () => {
    await db.insert(timelogs).values({ userId: MEMBER, projectId: P, logDate: new Date().toISOString().slice(0, 10), minutes: 95 });
    expect(await sendEveningReport(MEMBER)).toBe(true);
    const text = texts().join('\n');
    expect(text).toContain('عصر بخیر');
    expect(text).toContain('کارِ تمام‌شدهٔ امروز');
    expect(text).toContain('1:35');
  });
});

describe('دستورهای «/» در گروه', () => {
  it('دستورِ شخصی به هوشِ مصنوعی نمی‌رود؛ راهنما و تسک‌ها قطعی‌اند', async () => {
    await handleUpdate(groupMsg('/menu@kabarza_bot'));
    expect(texts().at(-1)).toContain('فقط در چتِ خصوصی');
    expect(buttons().some((b) => b.url === 'https://t.me/kabarza_bot')).toBe(true);

    await handleUpdate(groupMsg('/help@kabarza_bot'));
    expect(texts().at(-1)).toContain('/tasks');

    await handleUpdate(groupMsg('/tasks@kabarza_bot'));
    const list = texts().at(-1)!;
    expect(list).toContain('تسکِ بازِ عمومی');
    expect(list).not.toContain('SECRET-PRIVATE');
    expect(list).not.toContain('کارِ تمام‌شدهٔ امروز');

    bot = [];
    await handleUpdate(groupMsg('/tasks@kabarza_bot', 4242));
    expect(texts().at(-1)).toContain('فقط برای اعضای تیم');

    bot = [];
    await handleUpdate(groupMsg('/menu@another_bot'));
    expect(bot).toHaveLength(0);
  });
});
