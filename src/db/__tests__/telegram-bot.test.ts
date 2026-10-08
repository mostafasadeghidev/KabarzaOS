import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { aiConnections, auditLog, projectMembers, projects, tags, timelogs, userRoles, users, workTimers } from '../schema';
import { handleUpdate, resetBotState, setTelegramApi, type TgUpdate } from '@/server/telegram/bot';
import { resetAgentState } from '@/server/ai/agent';
import { AiError, getAiConnection, loadAiSecret, saveAiConnection } from '@/server/ai/connections';
import type { Actor } from '@/domain/access/permissions';

/**
 * ربات تلگرام و «مغزِ» هوشمندش (۲.۹.۰).
 * ⚠️ تلگرام و ارائه‌دهندهٔ هوشِ مصنوعی هر دو جعلی‌اند؛ سرویس‌ها و دیتابیس واقعی.
 */

let MEMBER = 0, OTHER = 0, PROJECT = 0;
const CHAT = 5550001;
const actorOf = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });

interface Sent { method: string; payload: Record<string, unknown> }
let sent: Sent[] = [];
let nextUpdate = 1;

const texts = () => sent.filter((s) => s.method === 'sendMessage' || s.method === 'editMessageText').map((s) => String(s.payload.text));
const lastKeyboard = () => {
  const withKb = [...sent].reverse().find((s) => (s.payload.reply_markup as { inline_keyboard?: unknown[] } | undefined)?.inline_keyboard?.length);
  return ((withKb?.payload.reply_markup as { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> }).inline_keyboard).flat();
};

const message = (text: string, chatId = CHAT, type = 'private'): TgUpdate =>
  ({ update_id: nextUpdate++, message: { message_id: 1, text, chat: { id: chatId, type }, from: { id: chatId } } });
const press = (data: string, chatId = CHAT): TgUpdate =>
  ({ update_id: nextUpdate++, callback_query: { id: `cb${nextUpdate}`, data, from: { id: chatId }, message: { message_id: 9, chat: { id: chatId, type: 'private' } } } });

beforeAll(async () => {
  await sql`truncate table ai_connections, timelogs, work_timers, tasks, project_members, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'bot@t', name: 'سارا', telegramLinkToken: 'link-token-abc' },
    { email: 'other@t', name: 'دیگری', telegramChatId: '777' },
  ]).returning({ id: users.id });
  [MEMBER, OTHER] = u.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: MEMBER, role: 'member' }, { userId: OTHER, role: 'member' }]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'آلفا', scope: 'company' }).returning({ id: projects.id });
  PROJECT = p!.id;
  await db.insert(projectMembers).values({ projectId: PROJECT, userId: MEMBER, roleTagId: role!.id });
});

beforeEach(() => {
  sent = [];
  resetBotState();
  resetAgentState();
  setTelegramApi(async (method, payload) => { sent.push({ method, payload }); return { ok: true }; });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setTelegramApi(null);
});

describe('ربات — اتصال و دستورها', () => {
  it('چتِ ناشناس فقط راهنمای اتصال می‌گیرد', async () => {
    await handleUpdate(message('/tasks'));
    expect(texts()[0]).toContain('وصل نیست');
  });

  it('«/start <token>» چت را وصل می‌کند و توکن یک‌بارمصرف است', async () => {
    await handleUpdate(message('/start link-token-abc'));
    const [row] = await db.select().from(users).where(eq(users.id, MEMBER));
    expect(row!.telegramChatId).toBe(String(CHAT));
    expect(row!.telegramLinkToken).toBeNull();
    expect(texts().join('\n')).toContain('وصل شد');

    sent = [];
    await handleUpdate(message('/start link-token-abc', 9999));
    expect(texts()[0]).toContain('معتبر نیست');
  });

  it('چتی که مالِ کاربرِ دیگری است با لینکِ تازه گرفته نمی‌شود', async () => {
    await db.update(users).set({ telegramLinkToken: 'tok-2' }).where(eq(users.id, MEMBER));
    await handleUpdate(message('/start tok-2', 777));
    expect(texts()[0]).toContain('کاربرِ دیگری');
    await db.update(users).set({ telegramLinkToken: null }).where(eq(users.id, MEMBER));
  });

  it('پیامِ گروه نادیده گرفته می‌شود', async () => {
    await handleUpdate(message('/tasks', CHAT, 'group'));
    expect(sent).toHaveLength(0);
  });

  it('عضوِ قطع‌شده هیچ جوابی جز «وصل نیست» نمی‌گیرد', async () => {
    await db.update(users).set({ memberState: 'locked' }).where(eq(users.id, MEMBER));
    await handleUpdate(message('/hours'));
    expect(texts()[0]).toContain('وصل نیست');
    await db.update(users).set({ memberState: 'active' }).where(eq(users.id, MEMBER));
  });

  it('تایمر با دکمه روشن و خاموش می‌شود و ثبت در رویدادها می‌نشیند', async () => {
    await handleUpdate(message('/timer'));
    expect(lastKeyboard().some((b) => b.callback_data === `t:s:${PROJECT}`)).toBe(true);
    await handleUpdate(press(`t:s:${PROJECT}`));
    const [timer] = await db.select().from(workTimers).where(eq(workTimers.userId, MEMBER));
    expect(timer!.projectId).toBe(PROJECT);
    await handleUpdate(press('t:x'));
    expect(await db.select().from(workTimers).where(eq(workTimers.userId, MEMBER))).toHaveLength(0);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'telegram.bot_call'));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('ثبتِ ساعت با دکمه: پروژه ← مدت', async () => {
    await handleUpdate(press('l:p'));
    await handleUpdate(press(`l:j:${PROJECT}`));
    expect(lastKeyboard().some((b) => b.callback_data === `l:m:${PROJECT}:90`)).toBe(true);
    await handleUpdate(press(`l:m:${PROJECT}:90`));
    const logs = await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER));
    expect(logs.reduce((s, l) => s + l.minutes, 0)).toBeGreaterThanOrEqual(90);
    // مدتِ ساختگی پذیرفته نمی‌شود.
    const before = logs.length;
    await handleUpdate(press(`l:m:${PROJECT}:9999`));
    expect((await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).length).toBe(before);
  });

  it('هر زیرمنو دکمهٔ «بازگشت» دارد؛ انتخابِ مدت به فهرستِ پروژه برمی‌گردد', async () => {
    await handleUpdate(press('l:p'));
    expect(lastKeyboard().some((b) => b.callback_data === 'm:menu')).toBe(true);
    await handleUpdate(press(`l:j:${PROJECT}`));
    expect(lastKeyboard().some((b) => b.callback_data === 'l:p')).toBe(true);
    await handleUpdate(press('m:menu'));
    expect(lastKeyboard().some((b) => b.callback_data === 'm:tasks')).toBe(true);
  });

  it('همان به‌روزرسانی دو بار پردازش نمی‌شود', async () => {
    const u = message('/hours');
    await handleUpdate(u);
    await handleUpdate(u);
    expect(texts()).toHaveLength(1);
  });

  it('متنِ آزاد بی هوشِ مصنوعی ← راهنمای اتصال + دکمه‌ها', async () => {
    await handleUpdate(message('امروز چه تسکی دارم؟'));
    expect(texts()[0]).toContain('ارائه‌دهنده وصل کنید');
    expect(lastKeyboard().length).toBeGreaterThan(0);
  });
});

/** ارائه‌دهندهٔ جعلیِ سازگار با OpenAI. */
function fakeProvider(script: Array<(body: { messages: Array<{ role: string; content: string | null }> }) => Response>) {
  const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, auth: new Headers(init?.headers).get('authorization') });
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'free-model:free' }, { id: 'paid-model' }] });
    const step = script[Math.min(i++, script.length - 1)]!;
    return step(body);
  }));
  return calls;
}

const toolCall = (name: string, args: Record<string, unknown>) => Response.json({
  choices: [{ message: { content: null, tool_calls: [{ id: `c-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});
const say = (text: string) => Response.json({ choices: [{ message: { content: text } }] });

describe('اتصالِ هوشِ مصنوعی', () => {
  it('کلید رمزگذاری‌شده ذخیره می‌شود؛ نما کلید ندارد؛ نشانیِ داخلی رد می‌شود', async () => {
    fakeProvider([() => say('x')]);
    await expect(saveAiConnection(actorOf(MEMBER), { provider: 'custom', baseUrl: 'https://127.0.0.1/v1', apiKey: 'sk-test-1234567890' }))
      .rejects.toBeInstanceOf(AiError);
    await expect(saveAiConnection(actorOf(MEMBER), { provider: 'custom', baseUrl: 'http://api.example.com/v1', apiKey: 'sk-test-1234567890' }))
      .rejects.toMatchObject({ code: 'bad_url' });

    const view = await saveAiConnection(actorOf(MEMBER), { provider: 'deepseek', apiKey: 'sk-test-1234567890' });
    expect(view).toMatchObject({ provider: 'deepseek', model: 'deepseek-chat', keyHint: '…7890' });
    expect(JSON.stringify(view)).not.toContain('sk-test');
    const [row] = await db.select().from(aiConnections).where(eq(aiConnections.userId, MEMBER));
    expect(row!.apiKeyEnc).not.toContain('sk-test');
    expect((await loadAiSecret(MEMBER))!.apiKey).toBe('sk-test-1234567890');
    // دیگری اتصالِ این کاربر را نمی‌بیند.
    expect(await getAiConnection(actorOf(OTHER))).toBeNull();
  });

  it('کلیدِ خالی = کلیدِ قبلی، ولی نه برای ارائه‌دهندهٔ دیگر', async () => {
    fakeProvider([() => say('x')]);
    await saveAiConnection(actorOf(MEMBER), { provider: 'deepseek', model: 'deepseek-reasoner' });
    expect((await loadAiSecret(MEMBER))!.model).toBe('deepseek-reasoner');
    await expect(saveAiConnection(actorOf(MEMBER), { provider: 'openai' })).rejects.toMatchObject({ code: 'no_key' });
  });

  it('کلیدِ ردشده ذخیره نمی‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    await expect(saveAiConnection(actorOf(OTHER), { provider: 'groq', apiKey: 'gsk_badbadbadbad' }))
      .rejects.toMatchObject({ code: 'invalid_key' });
    expect(await getAiConnection(actorOf(OTHER))).toBeNull();
  });
});

describe('ربات — هوشِ مصنوعی', () => {
  it('خواندن بی‌تأیید؛ پاسخ با کلیدِ خودِ کاربر', async () => {
    const calls = fakeProvider([
      () => toolCall('list_my_tasks', {}),
      () => say('امروز تسکِ بازی ندارید.'),
    ]);
    await handleUpdate(message('امروز چه تسکی دارم؟'));
    expect(texts()).toContain('امروز تسکِ بازی ندارید.');
    const chat = calls.filter((c) => c.url.endsWith('/chat/completions'));
    expect(chat).toHaveLength(2);
    expect(chat[0]!.auth).toBe('Bearer sk-test-1234567890');
    // نتیجهٔ ابزار به مدل برگشته است.
    const second = chat[1]!.body as { messages: Array<{ role: string }> };
    expect(second.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('نوشتن فقط با «بله»: «خیر» هیچ ثبتی نمی‌کند', async () => {
    const before = (await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).length;
    fakeProvider([() => toolCall('log_hours', { project_id: PROJECT, hours: 2 })]);
    await handleUpdate(message('۲ ساعت روی آلفا ثبت کن'));
    const yes = lastKeyboard().find((b) => b.callback_data?.startsWith('a:y:'))!;
    const no = lastKeyboard().find((b) => b.callback_data?.startsWith('a:n:'))!;
    expect(texts().join('\n')).toContain('آلفا');
    // دکمهٔ تأییدِ این کاربر برای چتِ دیگر کار نمی‌کند.
    await handleUpdate(press(yes.callback_data!, 777));
    expect((await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).length).toBe(before);

    await handleUpdate(press(no.callback_data!));
    expect((await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).length).toBe(before);
    // پس از «خیر» همان شناسه دیگر کار نمی‌کند.
    await handleUpdate(press(yes.callback_data!));
    expect((await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).length).toBe(before);
  });

  it('«بله» کار را با دسترسیِ خودِ کاربر انجام می‌دهد و در رویدادها ثبت می‌شود', async () => {
    const minutesBefore = (await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).reduce((s, l) => s + l.minutes, 0);
    fakeProvider([
      () => toolCall('log_hours', { project_id: PROJECT, hours: 1, minutes: 30, description: 'طراحی' }),
      () => say('ثبت شد.'),
    ]);
    await handleUpdate(message('یک و نیم ساعت طراحی روی آلفا'));
    const yes = lastKeyboard().find((b) => b.callback_data?.startsWith('a:y:'))!;
    await handleUpdate(press(yes.callback_data!));
    const minutesAfter = (await db.select().from(timelogs).where(eq(timelogs.userId, MEMBER))).reduce((s, l) => s + l.minutes, 0);
    expect(minutesAfter - minutesBefore).toBe(90);
    expect(texts()).toContain('ثبت شد.');
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'telegram.bot_call'));
    expect(audits.some((a) => (a.after as { tool?: string; ai?: boolean })?.tool === 'log_hours' && (a.after as { ai?: boolean }).ai)).toBe(true);
  });

  it('سهمیهٔ تمام‌شده ← پیامِ روشن + دکمه‌های ثابت', async () => {
    fakeProvider([() => new Response('{"error":{"message":"Rate limit exceeded"}}', { status: 429 })]);
    await handleUpdate(message('سلام'));
    expect(texts()[0]).toContain('سهمیه');
    expect(lastKeyboard().some((b) => b.callback_data === 'm:tasks')).toBe(true);
  });

  it('مدلی که ابزار نمی‌پذیرد ← گفت‌وگوی ساده', async () => {
    const calls = fakeProvider([
      () => new Response('{"error":{"message":"No endpoints found that support tool use"}}', { status: 404 }),
      () => say('سلام! چطور کمک کنم؟'),
    ]);
    await handleUpdate(message('سلام'));
    expect(texts()).toContain('سلام! چطور کمک کنم؟');
    const last = calls.filter((c) => c.url.endsWith('/chat/completions')).at(-1)!.body as { tools?: unknown };
    expect(last.tools).toBeUndefined();
  });
});
