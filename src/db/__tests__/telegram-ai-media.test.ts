import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db, sql } from '../client';
import { attachments, projectClients, projectMembers, projects, tags, tasks, userRoles, users } from '../schema';
import { handleUpdate, resetBotState, setTelegramApi, type TgMessage, type TgUpdate } from '@/server/telegram/bot';
import { resetAgentState } from '@/server/ai/agent';
import { saveAiConnection } from '@/server/ai/connections';
import type { Actor } from '@/domain/access/permissions';

/**
 * دستیارِ تلگرام با عکس، ویدیو و در گروهِ پروژه (۲.۳۴.۰).
 * ⚠️ تلگرام، فایل‌ها و ارائه‌دهندهٔ هوشِ مصنوعی جعلی‌اند؛ سرویس‌ها و دیتابیس واقعی.
 */

let MEMBER = 0, OTHER = 0, CLIENT = 0, PROJECT = 0;
const CHAT = 8800001, CHAT_OTHER = 8800002, CHAT_CLIENT = 8800003, GROUP = -1008800;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
/** کوچک‌ترین JPEG ِ معتبر — نوعِ فایل از روی بایت‌ها سنجیده می‌شود. */
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));

let sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
let nextId = 1;
const texts = () => sent.filter((s) => s.method === 'sendMessage' || s.method === 'editMessageText').map((s) => String(s.payload.text));
const buttons = () => sent.flatMap((s) => {
  const m = s.payload.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } | undefined;
  return (m?.inline_keyboard ?? []).flat();
});
const update = (message: Omit<TgMessage, 'message_id'> & { message_id?: number }): TgUpdate =>
  ({ update_id: nextId++, message: { message_id: nextId, ...message } });
const press = (from: number, data: string, chat = from, type = 'private'): TgUpdate =>
  ({ update_id: nextId++, callback_query: { id: `q${nextId}`, data, from: { id: from }, message: { message_id: 5, chat: { id: chat, type } } } });

interface AiBody { messages?: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string; parameters?: { properties?: Record<string, unknown> } } }> }

/** fetch ِ جعلی: فایلِ تلگرام، متنِ صدا و گام‌های مدل. */
function fakeWorld(steps: Array<(body: AiBody) => Response>) {
  const ai: AiBody[] = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('api.telegram.org/file/')) return new Response(JPEG);
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'gpt-4o-mini' }] });
    if (url.endsWith('/audio/transcriptions')) {
      return Response.json({ text: 'the button is broken', segments: [{ start: 5, end: 8, text: 'the button is broken' }] });
    }
    // اعلانِ گروهِ پروژه (تسکِ تازه) مستقیم به تلگرام می‌رود — جزوِ گام‌های مدل نیست.
    if (!url.endsWith('/chat/completions') && !url.endsWith('/responses')) return Response.json({ ok: true, result: {} });
    const body = init?.body ? JSON.parse(String(init.body)) as AiBody : {};
    ai.push(body);
    return steps[Math.min(i++, steps.length - 1)]!(body);
  }));
  return ai;
}

const calls = (list: Array<{ name: string; args: Record<string, unknown> }>) => Response.json({
  choices: [{ message: { content: null, tool_calls: list.map((c, n) => ({ id: `c${n}-${c.name}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } }],
});
const say = (text: string) => Response.json({ choices: [{ message: { content: text } }] });
const userText = (body: AiBody) => JSON.stringify(body.messages?.filter((m) => m.role === 'user').at(-1)?.content ?? '');
const systemText = (body: AiBody) => String(body.messages?.find((m) => m.role === 'system')?.content ?? '');
const toolNames = (body: AiBody) => (body.tools ?? []).map((t) => t.function.name);

beforeAll(async () => {
  await sql`truncate table ai_connections, attachments, tasks, project_clients, project_members, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'm@media', name: 'سارا', telegramChatId: String(CHAT) },
    { email: 'o@media', name: 'دیگری', telegramChatId: String(CHAT_OTHER) },
    { email: 'c@media', name: 'کارفرما', telegramChatId: String(CHAT_CLIENT) },
  ]).returning({ id: users.id });
  [MEMBER, OTHER, CLIENT] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([{ userId: MEMBER, role: 'member' }, { userId: OTHER, role: 'member' }, { userId: CLIENT, role: 'client' }]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'آلفا', scope: 'company', telegramGroupId: String(GROUP) }).returning({ id: projects.id });
  PROJECT = p!.id;
  await db.insert(projectMembers).values([
    { projectId: PROJECT, userId: MEMBER, roleTagId: role!.id },
    { projectId: PROJECT, userId: OTHER, roleTagId: role!.id },
  ]);
  await db.insert(projectClients).values({ projectId: PROJECT, userId: CLIENT });
  fakeWorld([() => say('x')]);
  // OpenAI: هم متن و تصویر، هم صدا ← متن.
  await saveAiConnection(as(MEMBER, ['member']), { provider: 'openai', apiKey: 'sk-test-media-1234567890' });
  await saveAiConnection(as(CLIENT, ['client']), { provider: 'openai', apiKey: 'sk-test-client-1234567890' });
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sent = [];
  resetBotState();
  resetAgentState();
  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAMediaTestTokenForUnitTestsOnly0000';
  process.env.TELEGRAM_BOT_USERNAME = 'kabarza_bot';
  setTelegramApi(async (method, payload) => {
    sent.push({ method, payload });
    if (method === 'getFile') return { ok: true, result: { file_path: 'p/file.jpg', file_size: JPEG.length } };
    return { ok: true, result: { message_id: 77 } };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setTelegramApi(null);
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
});

const taskByTitle = async (title: string) => (await db.select().from(tasks).where(eq(tasks.title, title)))[0];
const mediaOf = async (taskId: number) => db.select().from(attachments).where(and(eq(attachments.taskId, taskId), isNotNull(attachments.fileId)));

describe('عکس برای دستیار', () => {
  it('عکس با توضیح مستقیم به مدل می‌رود و با «attach» به تسکِ تأییدشده پیوست می‌شود', async () => {
    const ai = fakeWorld([
      (body) => {
        expect(userText(body)).toContain('image_url');
        // فیلدِ پیوست فقط وقتی رسانه هست.
        const create = body.tools!.find((t) => t.function.name === 'create_task');
        expect(create!.function.parameters!.properties).toHaveProperty('attach');
        return calls([{ name: 'create_task', args: { project_id: PROJECT, title: 'دکمهٔ خراب', attach: ['photo-500'] } }]);
      },
      () => say('تسک ساخته شد و عکس پیوست شد.'),
      () => say('باشه.'),
    ]);
    await handleUpdate(update({ message_id: 500, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'ph1', file_size: JPEG.length }], caption: 'برای آلفا تسک بساز و عکس را بگذار' }));
    expect(ai).toHaveLength(1);
    const yes = buttons().find((b) => b.callback_data?.startsWith('a:y:'))!;
    await handleUpdate(press(CHAT, yes.callback_data!));
    const task = await taskByTitle('دکمهٔ خراب');
    expect(task).toBeDefined();
    expect(await mediaOf(task!.id)).toHaveLength(1);
    // حافظه تصویر را نگه نمی‌دارد — پیامِ بعدیِ کاربر دیگر عکس را نمی‌فرستد.
    await handleUpdate(update({ chat: { id: CHAT, type: 'private' }, text: 'ممنون' }));
    expect(JSON.stringify(ai.at(-1)!.messages)).not.toContain('data:image');
    expect(JSON.stringify(ai.at(-1)!.messages)).toContain('[image]');
  });

  it('شناسهٔ ساختگیِ رسانه چیزی پیوست نمی‌کند', async () => {
    fakeWorld([
      () => calls([{ name: 'create_task', args: { project_id: PROJECT, title: 'بی‌عکس', attach: ['photo-999999'] } }]),
      () => say('ok'),
    ]);
    await handleUpdate(update({ message_id: 501, chat: { id: CHAT, type: 'private' }, photo: [{ file_id: 'ph2', file_size: JPEG.length }], caption: 'تسک بساز' }));
    await handleUpdate(press(CHAT, buttons().find((b) => b.callback_data?.startsWith('a:y:'))!.callback_data!));
    const task = await taskByTitle('بی‌عکس');
    expect(await mediaOf(task!.id)).toHaveLength(0);
  });
});

describe('چند کار با یک «بله»', () => {
  it('همهٔ کارهای یک گام در یک پیامِ تأیید می‌آیند و با یک دکمه انجام می‌شوند', async () => {
    fakeWorld([
      () => calls([
        { name: 'create_task', args: { project_id: PROJECT, title: 'مورد یک' } },
        { name: 'create_task', args: { project_id: PROJECT, title: 'مورد دو' } },
      ]),
      () => say('هر دو ساخته شدند.'),
    ]);
    await handleUpdate(update({ chat: { id: CHAT, type: 'private' }, text: 'دو تسک برای آلفا بساز' }));
    const confirm = texts().at(-1)!;
    expect(confirm).toContain('مورد یک');
    expect(confirm).toContain('مورد دو');
    expect(buttons().filter((b) => b.callback_data?.startsWith('a:y:'))).toHaveLength(1);
    await handleUpdate(press(CHAT, buttons().find((b) => b.callback_data?.startsWith('a:y:'))!.callback_data!));
    expect(await taskByTitle('مورد یک')).toBeDefined();
    expect(await taskByTitle('مورد دو')).toBeDefined();
    expect(texts()).toContain('هر دو ساخته شدند.');
  });
});

describe('ویدیو', () => {
  it('صدای ویدیو با زمان به مدل می‌رسد؛ ربات می‌گوید چه دید', async () => {
    const ai = fakeWorld([() => say('خلاصه: دکمه خراب است (0:05).')]);
    await handleUpdate(update({
      chat: { id: CHAT, type: 'private' }, caption: 'بازبینی کن',
      video: { file_id: 'v1', file_size: 1000, duration: 12, mime_type: 'video/mp4' },
    }));
    expect(ai).toHaveLength(1);
    expect(userText(ai[0]!)).toContain('[0:05] the button is broken');
    expect(userText(ai[0]!)).toContain('Request: بازبینی کن');
    expect(texts().join('\n')).toContain('ویدیو دیده شد');
    expect(texts()).toContain('خلاصه: دکمه خراب است (0:05).');
  });

  it('ویدیوی بزرگ‌تر از ۲۰ مگابایت پیش از دانلود رد می‌شود', async () => {
    const ai = fakeWorld([() => say('x')]);
    await handleUpdate(update({ chat: { id: CHAT, type: 'private' }, video: { file_id: 'v2', file_size: 50 * 1024 * 1024 } }));
    expect(ai).toHaveLength(0);
    expect(texts()[0]).toContain('۲۰ مگابایت');
  });
});

describe('دستیار در گروهِ پروژه', () => {
  const inGroup = (from: number, text: string, extra: Partial<TgMessage> = {}) =>
    update({ chat: { id: GROUP, type: 'supergroup' }, from: { id: from }, text, ...extra });

  it('بی صدازدن جواب نمی‌دهد', async () => {
    const ai = fakeWorld([() => say('x')]);
    await handleUpdate(inGroup(CHAT, 'سلام بچه‌ها'));
    expect(sent).toHaveLength(0);
    expect(ai).toHaveLength(0);
  });

  it('ناشناس و کارفرما جوابِ کوتاه می‌گیرند و مدل صدا زده نمی‌شود', async () => {
    const ai = fakeWorld([() => say('x')]);
    await handleUpdate(inGroup(4242, '/ask وضعیت چیست؟'));
    expect(texts().at(-1)).toContain('تلگرامِ خودتان');
    await handleUpdate(inGroup(CHAT_CLIENT, '@kabarza_bot وضعیت چیست؟'));
    expect(texts().at(-1)).toContain('فقط برای اعضای تیم');
    expect(ai).toHaveLength(0);
  });

  it('عضوِ تیم: پروژه معلوم، ابزارهای شخصی نیست، جواب زیرِ همان پیام', async () => {
    const ai = fakeWorld([
      (body) => {
        expect(systemText(body)).toContain('Telegram group of project "آلفا"');
        const names = toolNames(body);
        expect(names).toContain('create_task');
        for (const hidden of ['send_message', 'log_hours', 'list_inbox', 'ask_user_to_choose_project']) expect(names).not.toContain(hidden);
        return calls([{ name: 'create_task', args: { project_id: PROJECT, title: 'از گروه' } }]);
      },
      () => say('ساخته شد.'),
    ]);
    await handleUpdate(inGroup(CHAT, '/ask@kabarza_bot یک تسک «از گروه» بساز'));
    const confirm = sent.at(-1)!;
    expect(confirm.payload.chat_id).toBe(GROUP);
    expect(confirm.payload.reply_parameters).toBeDefined();
    const yes = buttons().find((b) => b.callback_data?.startsWith('a:y:'))!;

    // عضوِ دیگرِ گروه نمی‌تواند به جای پرسنده تأیید کند.
    await handleUpdate(press(CHAT_OTHER, yes.callback_data!, GROUP, 'supergroup'));
    const alert = sent.find((s) => s.method === 'answerCallbackQuery' && s.payload.show_alert);
    expect(String(alert?.payload.text)).toContain('فقط کسی که پرسیده');
    expect(await taskByTitle('از گروه')).toBeUndefined();

    await handleUpdate(press(CHAT, yes.callback_data!, GROUP, 'supergroup'));
    expect(await taskByTitle('از گروه')).toBeDefined();
    expect(texts()).toContain('ساخته شد.');
    expect(ai).toHaveLength(2);
  });

  it('گفت‌وگوی گروه از گفت‌وگوی خصوصی جداست', async () => {
    const ai = fakeWorld([() => say('یک'), () => say('دو')]);
    await handleUpdate(update({ chat: { id: CHAT, type: 'private' }, text: 'رمزِ خصوصیِ من ۱۲۳ است' }));
    await handleUpdate(inGroup(CHAT, '/ask چه گفتم؟'));
    expect(JSON.stringify(ai[1]!.messages)).not.toContain('رمزِ خصوصیِ من');
  });
});
