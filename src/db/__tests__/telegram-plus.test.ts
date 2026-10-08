import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { comments, messages, projectMembers, projects, schedulerStamps, tags, tasks, threadUsers, threads, userRoles, users } from '../schema';
import { handleUpdate, resetBotState, sendMorningBrief, setTelegramApi, type TgUpdate } from '@/server/telegram/bot';
import { notify } from '@/server/notifications/service';
import { announceTask, linkProjectGroup } from '@/server/telegram/group';
import { createTask } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';
import { runTick } from '@/server/scheduler/service';

/**
 * ربات، دورِ دوم (۲.۱۴.۰): دکمه‌های زیرِ اعلان، «🔕 دیگر نفرست»، پاسخ از زیرِ
 * اعلان، صفحه‌کلیدِ ثابت، گزارشِ صبحگاهی، فایل، گروهِ پروژه و منوی مدیران.
 */

let A = 0, B = 0, OWNER = 0, P = 0, PB = 0, THREAD = 0, COMMENT = 0;
const CHAT_A = 7100, CHAT_OWNER = 7101;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

let sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
let nextId = 1;
const texts = () => sent.filter((s) => s.method === 'sendMessage' || s.method === 'editMessageText').map((s) => String(s.payload.text));
const buttons = () => sent.flatMap((s) => {
  const m = s.payload.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } | undefined;
  return (m?.inline_keyboard ?? []).flat();
});
const msg = (chat: number, text: string, type = 'private'): TgUpdate => ({ update_id: nextId++, message: { message_id: nextId, text, chat: { id: chat, type } } });
const press = (chat: number, data: string): TgUpdate => ({ update_id: nextId++, callback_query: { id: `q${nextId}`, data, from: { id: chat }, message: { message_id: 5, chat: { id: chat, type: 'private' } } } });

beforeAll(async () => {
  await sql`truncate table messages, thread_users, threads, comments, tasks, project_members, projects, user_roles, tags, audit_log, notifications, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'a@p', name: 'عضو', telegramChatId: String(CHAT_A) },
    { email: 'b@p', name: 'دیگری' },
    { email: 'o@p', name: 'مالک', telegramChatId: String(CHAT_OWNER) },
  ]).returning({ id: users.id });
  [A, B, OWNER] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([{ userId: A, role: 'member' }, { userId: B, role: 'member' }, { userId: OWNER, role: 'owner' }]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const p = await db.insert(projects).values([{ title: 'پروژهٔ آ', scope: 'company' }, { title: 'SECRET-B', scope: 'company' }]).returning({ id: projects.id });
  [P, PB] = p.map((r) => r.id) as [number, number];
  await db.insert(projectMembers).values([{ projectId: P, userId: A, roleTagId: role!.id }, { projectId: P, userId: B, roleTagId: role!.id }, { projectId: PB, userId: B, roleTagId: role!.id }]);
  const [th] = await db.insert(threads).values({ creatorId: B, allowReply: true }).returning({ id: threads.id });
  THREAD = th!.id;
  await db.insert(threadUsers).values([{ threadId: THREAD, userId: A }, { threadId: THREAD, userId: B }]);
  const [c] = await db.insert(comments).values({ projectId: P, userId: B, type: 'comment', body: 'سلام', status: 'open' }).returning({ id: comments.id });
  COMMENT = c!.id;
});

beforeEach(() => {
  sent = [];
  resetBotState();
  setTelegramApi(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: { message_id: 99 } }; });
});
afterEach(() => { vi.unstubAllGlobals(); setTelegramApi(null); delete process.env.TELEGRAM_BOT_TOKEN; });

/** fetch ِ جعلی برای اعلان (sendTelegram مستقیم fetch می‌کند). */
function captureTelegramFetch() {
  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAPlusTestTokenForUnitTestsOnly00000';
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body));
    return Response.json({ ok: true });
  }));
  return bodies;
}

describe('دکمه‌های زیرِ اعلان و «🔕 دیگر نفرست»', () => {
  it('تایمرِ روشن: «توقف» و «🔕»؛ پیام: «پاسخ»؛ اعلانِ کاری «🔕» ندارد', async () => {
    const bodies = captureTelegramFetch();
    await notify([A], { type: 'timer_running', title: 'تایمرِ کار روشن مانده', url: '/hours' });
    await notify([A], { type: 'message.received', title: 'پیام جدید', body: 'x', url: `/messages/${THREAD}` });
    await notify([A], { type: 'task.assigned', title: 'تسک', url: '/tasks' });
    const kb = (i: number) => JSON.stringify(bodies[i]?.reply_markup ?? '');
    expect(kb(0)).toContain('"t:x"');
    expect(kb(0)).toContain('"q:timer_running"');
    expect(kb(1)).toContain(`"r:m:${THREAD}"`);
    expect(kb(2)).not.toContain('q:');
  });

  it('«🔕» نوع را فقط در تلگرام خاموش می‌کند؛ «بازگرداندن» روشن', async () => {
    await handleUpdate(press(CHAT_A, 'q:no_timelog'));
    expect((await db.select().from(users).where(eq(users.id, A)))[0]!.telegramMuted).toContain('no_timelog');
    const bodies = captureTelegramFetch();
    await notify([A], { type: 'no_timelog', title: 'ساعت ثبت نشده' });
    expect(bodies).toHaveLength(0);
    // زنگولهٔ داخلِ برنامه می‌ماند.
    const [n] = await sql<Array<{ n: number }>>`select count(*)::int as n from notifications where user_id = ${A} and type = 'no_timelog'`;
    expect(n!.n).toBeGreaterThan(0);
    await handleUpdate(press(CHAT_A, 'u:no_timelog'));
    expect((await db.select().from(users).where(eq(users.id, A)))[0]!.telegramMuted).not.toContain('no_timelog');
    // نوعِ ناشناخته پذیرفته نمی‌شود.
    await handleUpdate(press(CHAT_A, 'q:task.assigned'));
    expect((await db.select().from(users).where(eq(users.id, A)))[0]!.telegramMuted).not.toContain('task.assigned');
  });
});

describe('پاسخ از زیرِ اعلان', () => {
  it('پیام: «پاسخ» ← متنِ بعدی در همان گفتگو می‌نشیند', async () => {
    await handleUpdate(press(CHAT_A, `r:m:${THREAD}`));
    expect(JSON.stringify(sent.at(-1)?.payload)).toContain('force_reply');
    await handleUpdate(msg(CHAT_A, 'باشه، فردا می‌فرستم'));
    const rows = await db.select().from(messages).where(and(eq(messages.threadId, THREAD), eq(messages.fromUserId, A)));
    expect(rows.map((r) => r.body)).toContain('باشه، فردا می‌فرستم');
  });

  it('کامنت: پاسخ زیرِ همان کامنت؛ /cancel لغو می‌کند؛ گفتگوی دیگران نه', async () => {
    await handleUpdate(press(CHAT_A, `r:c:${P}:${COMMENT}`));
    await handleUpdate(msg(CHAT_A, 'دیدم'));
    const replies = await db.select().from(comments).where(eq(comments.parentId, COMMENT));
    expect(replies.map((r) => r.body)).toContain('دیدم');
    await handleUpdate(press(CHAT_A, `r:c:${P}:${COMMENT}`));
    await handleUpdate(msg(CHAT_A, '/cancel'));
    await handleUpdate(msg(CHAT_A, 'این نباید کامنت شود'));
    expect((await db.select().from(comments).where(eq(comments.parentId, COMMENT))).map((r) => r.body)).not.toContain('این نباید کامنت شود');
    // گفتگو/پروژه‌ای که عضوش نیست: خطا، نه ثبت.
    const [other] = await db.insert(threads).values({ creatorId: B, allowReply: true }).returning({ id: threads.id });
    await handleUpdate(press(CHAT_A, `r:m:${other!.id}`));
    await handleUpdate(msg(CHAT_A, 'نفوذ'));
    expect(await db.select().from(messages).where(eq(messages.threadId, other!.id))).toHaveLength(0);
    await handleUpdate(press(CHAT_A, `r:c:${PB}:${COMMENT}`));
    await handleUpdate(msg(CHAT_A, 'نفوذ'));
    expect(JSON.stringify(sent)).not.toContain('SECRET');
  });
});

describe('صفحه‌کلیدِ ثابت و منوی مدیران', () => {
  it('/start صفحه‌کلیدِ پایین را می‌فرستد و دکمه‌اش کار می‌کند', async () => {
    await handleUpdate(msg(CHAT_A, '/start'));
    const kb = sent.find((s) => (s.payload.reply_markup as { keyboard?: unknown } | undefined)?.keyboard);
    expect(kb).toBeDefined();
    const labels = JSON.stringify(kb!.payload.reply_markup);
    expect(labels).toContain('تسک‌های من');
    // عضوِ ساده دکمهٔ «تیم من» / «وضعیتِ شرکت» ندارد.
    expect(labels).not.toContain('تیم من');
    sent = [];
    await handleUpdate(msg(CHAT_A, '📋 تسک‌های من'));
    expect(texts().join(' ')).toMatch(/تسک/);
  });

  it('مالک: «تیم من» و «وضعیتِ شرکت»؛ عضو با دکمهٔ دست‌ساز چیزی نمی‌بیند', async () => {
    await handleUpdate(msg(CHAT_OWNER, '/start'));
    expect(JSON.stringify(sent)).toContain('m:co');
    sent = [];
    await handleUpdate(press(CHAT_OWNER, 'm:co'));
    expect(texts().join(' ')).toContain('وضعیتِ شرکت');
    sent = [];
    await handleUpdate(press(CHAT_A, 'm:co'));
    await handleUpdate(press(CHAT_A, 'm:team'));
    await handleUpdate(press(CHAT_A, 'pr:A:1'));
    expect(texts().join(' ')).not.toContain('وضعیتِ شرکت');
  });
});

describe('گزارشِ صبحگاهی', () => {
  it('روزِ خالی هیچ نمی‌فرستد؛ با دیرکرد می‌فرستد و «🔕» دارد', async () => {
    expect(await sendMorningBrief(OWNER)).toBe(false);
    expect(sent).toHaveLength(0);
    await db.insert(tasks).values({ projectId: P, title: 'دیرشده', createdBy: A, assignedTo: A, dueDate: '2020-01-01' });
    expect(await sendMorningBrief(A)).toBe(true);
    expect(texts()[0]).toContain('دیرشده');
    expect(buttons().some((b) => b.callback_data === 'q:brief')).toBe(true);
  });
});

describe('فایل به ربات', () => {
  it('عکس ← «کجا برود؟»؛ فقط پروژه‌های خودش؛ پروژهٔ دست‌ساز نه', async () => {
    await handleUpdate({ update_id: nextId++, message: { message_id: 1, chat: { id: CHAT_A, type: 'private' }, photo: [{ file_id: 'small' }, { file_id: 'big', file_size: 1000 }] } });
    expect(buttons().map((b) => b.callback_data)).toEqual(expect.arrayContaining(['f:p', 'f:t', 'f:x']));
    sent = [];
    await handleUpdate(press(CHAT_A, 'f:p'));
    const list = buttons().map((b) => b.callback_data);
    expect(list).toContain(`f:pp:${P}`);
    expect(list).not.toContain(`f:pp:${PB}`);
    expect(JSON.stringify(sent)).not.toContain('SECRET');
    // پروژهٔ ممنوع با دکمهٔ دست‌ساز: سرویس رد می‌کند؛ نامی لو نمی‌رود.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    setTelegramApi(async (method, payload) => {
      sent.push({ method, payload });
      return method === 'getFile' ? { ok: true, result: { file_path: 'p/x.jpg', file_size: 3 } } : { ok: true, result: {} };
    });
    process.env.TELEGRAM_BOT_TOKEN = '123456789:AAPlusTestTokenForUnitTestsOnly00000';
    await handleUpdate(press(CHAT_A, `f:pp:${PB}`));
    expect(JSON.stringify(sent)).not.toContain('SECRET');
    const [att] = await sql<Array<{ n: number }>>`select count(*)::int as n from attachments where project_id = ${PB}`;
    expect(att!.n).toBe(0);
  });
});

describe('گروهِ تلگرامِ پروژه', () => {
  it('وصل با توکنِ یک‌بارمصرف؛ گروه به هیچ دستورِ دیگری جواب نمی‌دهد', async () => {
    await db.update(projects).set({ telegramGroupToken: 'tok_group_abcdefghijkl' }).where(eq(projects.id, P));
    await handleUpdate(msg(-500, '/tasks', 'group'));
    expect(sent).toHaveLength(0);
    await handleUpdate(msg(-500, '/start@kabarza_bot tok_group_abcdefghijkl', 'group'));
    expect((await db.select().from(projects).where(eq(projects.id, P)))[0]!.telegramGroupId).toBe('-500');
    expect(texts()[0]).toContain('پروژهٔ آ');
    expect(await linkProjectGroup('tok_group_abcdefghijkl', -600)).toBeNull();
  });

  it('تسکِ تازه به گروه می‌رود؛ خصوصی و «پنهان از کارفرما» نه', async () => {
    const bodies = captureTelegramFetch();
    const pub = await createTask(as(A, ['member']), P, { title: 'تسکِ عمومی', description: '', statusTagId: null, priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false });
    // ⚠️ عضوِ ساده در خودِ برنامه هم تسکِ خصوصی نمی‌سازد؛ مالک می‌سازد.
    const priv = await createTask(as(OWNER, ['owner']), P, { title: 'SECRET-PRIVATE', description: '', statusTagId: null, priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: true });
    await new Promise((r) => setTimeout(r, 100));
    expect((await db.select().from(tasks).where(eq(tasks.id, priv)))[0]!.isPrivate).toBe(true);
    await announceTask(pub, 'new');
    await announceTask(priv, 'new');
    const all = JSON.stringify(bodies);
    expect(all).toContain('تسکِ عمومی');
    expect(all).not.toContain('SECRET-PRIVATE');
  });
});

describe('زمان‌بندِ گزارشِ صبحگاهی', () => {
  it('یک بار در روز؛ تیکِ دوم همان روز چیزی نمی‌فرستد؛ عصر هم نه', async () => {
    // ⚠️ فقط پیام‌های گزارش به چتِ A شمرده می‌شود؛ فایل‌های دیگر هم کاربرِ تلگرامی دارند.
    captureTelegramFetch();
    sent = [];
    // ⚠️ مهرِ روز از اجرای قبلیِ آزمون در پایگاه می‌ماند.
    await db.delete(schedulerStamps).where(eq(schedulerStamps.key, `brief:${A}`));
    const briefsToA = () => sent.filter((m) => String(m.payload.chat_id) === String(CHAT_A) && String(m.payload.text ?? '').includes('☀️')).length;
    await db.update(users).set({ briefAt: '08:30', timezone: 'UTC' }).where(eq(users.id, A));
    await runTick(new Date('2030-01-07T09:00:00Z'));
    expect(briefsToA()).toBe(1);
    await runTick(new Date('2030-01-07T09:30:00Z'));
    expect(briefsToA()).toBe(1);
    await runTick(new Date('2030-01-08T15:00:00Z'));
    expect(briefsToA()).toBe(1);
    // «🔕» ← دیگر هرگز.
    await db.update(users).set({ telegramMuted: ['brief'] }).where(eq(users.id, A));
    await runTick(new Date('2030-01-09T09:00:00Z'));
    expect(briefsToA()).toBe(1);
  });
});
