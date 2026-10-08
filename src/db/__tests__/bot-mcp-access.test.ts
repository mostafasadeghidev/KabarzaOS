import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { db, sql } from '../client';
import { aiConnections, apiKeys, projectClients, projectMembers, projects, tags, tasks, userRoles, users } from '../schema';
import { handleUpdate, resetBotState, setTelegramApi, type TgUpdate } from '@/server/telegram/bot';
import { resetAgentState } from '@/server/ai/agent';
import { seal } from '@/server/ai/secret-box';
import { authenticateToken, createToken } from '@/server/mcp/tokens';
import { buildMcpServer } from '@/server/mcp/server';
import { listProjects } from '@/server/projects/service';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { POST as webhookPost } from '@/app/api/telegram/webhook/route';
import type { Actor } from '@/domain/access/permissions';

/**
 * ممیزیِ دسترسیِ ربات تلگرام و MCP (۲.۹.۰).
 *
 * روش: هر دادهٔ ممنوع یک «نشانهٔ سرّی» (`SECRET-…`) در نام دارد. بعد هر راهی
 * — دستور، دکمهٔ جعلی، هوشِ مصنوعی، توکنِ MCP — امتحان می‌شود و هیچ پاسخی
 * نباید آن نشانه را داشته باشد؛ هیچ نوشتنی هم نباید در دیتابیس بنشیند.
 */

let OWNER = 0, A = 0, B = 0, CLIENT = 0, LOCKED = 0, FINANCE = 0, DELETED = 0;
let P1 = 0, P2 = 0, P3 = 0, P4 = 0, T_P2 = 0, T_PRIV = 0;
const CHAT = { A: 6001, CLIENT: 6002, LOCKED: 6003, FINANCE: 6004, DELETED: 6005, STRANGER: 6999 };

const roles = (id: number, r: Actor['roles'], privateAccess = false): Actor => ({ id, roles: r, permissions: [], privateAccess });

/* ---------------- تلگرامِ جعلی ---------------- */

let sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
let nextId = 1;
const out = () => JSON.stringify(sent);
const replies = () => sent.filter((s) => s.method === 'sendMessage' || s.method === 'editMessageText').map((s) => String(s.payload.text));
const msg = (chat: number, text: string, type = 'private'): TgUpdate =>
  ({ update_id: nextId++, message: { message_id: 1, text, chat: { id: chat, type }, from: { id: chat } } });
const press = (chat: number, data: string): TgUpdate =>
  ({ update_id: nextId++, callback_query: { id: `q${nextId}`, data, from: { id: chat }, message: { message_id: 3, chat: { id: chat, type: 'private' } } } });

/** همهٔ دستورها و دکمه‌ها — از جمله دکمه‌های جعلیِ پروژه‌های ممنوع. */
function everyInput(chat: number): TgUpdate[] {
  return [
    msg(chat, '/start'), msg(chat, '/help'), msg(chat, '/tasks'), msg(chat, '/hours'), msg(chat, '/timer'),
    msg(chat, '/stop'), msg(chat, '/log'), msg(chat, '/new'), msg(chat, 'پروژهٔ SECRET چیست؟'),
    press(chat, 'm:tasks'), press(chat, 'm:hours'), press(chat, 't:p'), press(chat, 't:x'), press(chat, 'l:p'),
    ...[P1, P2, P3, P4].flatMap((p) => [press(chat, `t:s:${p}`), press(chat, `l:j:${p}`), press(chat, `l:m:${p}:60`)]),
    press(chat, 'a:y:forged-id'), press(chat, 'a:n:forged-id'),
  ];
}

async function writes() {
  const [t] = await sql<Array<{ logs: number; timers: number; tasks: number; comments: number }>>`select (select count(*) from timelogs)::int as logs, (select count(*) from work_timers)::int as timers,
    (select count(*) from tasks)::int as tasks, (select count(*) from comments)::int as comments`;
  return t!;
}

/* ---------------- ارائه‌دهندهٔ جعلی ---------------- */

const toolCall = (name: string, args: Record<string, unknown>, id = `c-${name}`) => Response.json({
  choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});
const say = (t: string) => Response.json({ choices: [{ message: { content: t } }] });

/** هر چه مدل از ابزارها گرفته (پیام‌های role=tool) جمع می‌شود. */
function fakeAi(script: Response[]) {
  const toolResults: string[] = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as { messages: Array<{ role: string; content: string }> } : null;
    for (const m of body?.messages ?? []) if (m.role === 'tool') toolResults.push(m.content);
    return (script[Math.min(i++, script.length - 1)]!).clone();
  }));
  return toolResults;
}

/* ---------------- MCP ---------------- */

async function mcpAs(actor: Actor, scope: 'read' | 'write' = 'write') {
  // ⚠️ سقفِ ۱۰ توکن برای هر کاربر — توکن‌های آزمون‌های قبلی را پاک کن.
  await db.delete(apiKeys).where(eq(apiKeys.userId, actor.id));
  const { token } = await createToken(actor, { name: `audit-${actor.id}-${scope}-${nextId++}`, scope });
  const auth = await authenticateToken(token);
  if (!auth.ok) throw new Error(`auth ${auth.reason}`);
  const server = buildMcpServer(auth.session);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'audit', version: '1' });
  await Promise.all([server.connect(s), client.connect(c)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>; isError?: boolean };
    return { error: r.isError === true, text: r.content.map((x) => x.text).join('\n') };
  };
  return { call, token, client, close: () => client.close() };
}

/* ---------------- داده ---------------- */

beforeAll(async () => {
  await sql`truncate table ai_connections, api_keys, comments, timelogs, work_timers, tasks, project_clients, project_members, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'own@a', name: 'مالک' },
    { email: 'a@a', name: 'عضوِ آ', telegramChatId: String(CHAT.A) },
    { email: 'b@a', name: 'SECRET-USER-B' },
    { email: 'c@a', name: 'کارفرما', telegramChatId: String(CHAT.CLIENT) },
    { email: 'l@a', name: 'قفل', memberState: 'locked', telegramChatId: String(CHAT.LOCKED) },
    { email: 'f@a', name: 'سابق', memberState: 'finance', telegramChatId: String(CHAT.FINANCE) },
    { email: 'd@a', name: 'حذفی', deletedAt: new Date(), telegramChatId: String(CHAT.DELETED) },
  ]).returning({ id: users.id });
  [OWNER, A, B, CLIENT, LOCKED, FINANCE, DELETED] = u.map((r) => r.id) as [number, number, number, number, number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: A, role: 'member' }, { userId: B, role: 'member' },
    { userId: CLIENT, role: 'client' }, { userId: LOCKED, role: 'member' }, { userId: FINANCE, role: 'member' },
    { userId: DELETED, role: 'member' },
  ]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const p = await db.insert(projects).values([
    { title: 'پروژهٔ آ', scope: 'company', price: '777777' },
    { title: 'SECRET-P2 فقط ب', scope: 'company' },
    { title: 'SECRET-P3 خصوصی', scope: 'private' },
    { title: 'SECRET-P4 قطع‌شده', scope: 'company' },
  ]).returning({ id: projects.id });
  [P1, P2, P3, P4] = p.map((r) => r.id) as [number, number, number, number];
  await db.insert(projectMembers).values([
    { projectId: P1, userId: A, roleTagId: role!.id, agreedAmount: '55555' },
    { projectId: P1, userId: B, roleTagId: role!.id, agreedAmount: '66666' },
    { projectId: P2, userId: B, roleTagId: role!.id },
    // پروژهٔ خصوصی: آ نه عضو است، نه دسترسیِ خصوصی دارد.
    // (عضویت عمداً بر scope مقدم است — `canViewProject`؛ پس آ را عضو نمی‌کنیم.)
    { projectId: P3, userId: B, roleTagId: role!.id },
    { projectId: P4, userId: A, roleTagId: role!.id, accessBlocked: true },
    { projectId: P1, userId: LOCKED, roleTagId: role!.id },
    { projectId: P1, userId: FINANCE, roleTagId: role!.id },
  ]);
  await db.insert(projectClients).values({ projectId: P1, userId: CLIENT });
  const t = await db.insert(tasks).values([
    { projectId: P1, title: 'تسکِ عمومیِ آ', createdBy: OWNER, assignedTo: A },
    { projectId: P2, title: 'SECRET-T2', createdBy: B, assignedTo: B },
    { projectId: P1, title: 'SECRET-PRIV-TASK', createdBy: OWNER, assignedTo: OWNER, isPrivate: true },
    { projectId: P3, title: 'SECRET-T3', createdBy: OWNER, assignedTo: A },
    { projectId: P4, title: 'SECRET-T4', createdBy: OWNER, assignedTo: A },
  ]).returning({ id: tasks.id });
  [, T_P2, T_PRIV] = t.map((r) => r.id) as [number, number, number];
  // هوشِ مصنوعیِ آ (کلیدِ ساختگی؛ fetch جعلی است).
  await db.insert(aiConnections).values({
    userId: A, provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
    apiKeyEnc: seal('sk-audit-000000000000'), keyHint: '…0000',
  });
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

afterAll(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

/* ================================================================== */

describe('ربات — کسی که دسترسی ندارد', () => {
  for (const [label, chat] of [
    ['غریبه (هیچ‌وقت وصل نشده)', CHAT.STRANGER],
    ['عضوِ قفل‌شده', CHAT.LOCKED],
    ['عضوِ سابق («فقط مالی»)', CHAT.FINANCE],
    ['کاربرِ حذف‌شده', CHAT.DELETED],
  ] as const) {
    it(`${label}: هیچ داده‌ای نمی‌گیرد و هیچ چیزی نمی‌نویسد`, async () => {
      const before = await writes();
      for (const u of everyInput(chat)) await handleUpdate(u);
      expect(out()).not.toMatch(/SECRET|پروژهٔ آ|تسکِ عمومی|777777|55555/);
      // پیام‌ها فقط «وصل نیست»؛ دکمه‌ها حتی همان را هم نمی‌گیرند.
      for (const text of replies()) expect(text).toContain('وصل نیست');
      expect(sent.filter((s) => s.method === 'editMessageText')).toHaveLength(0);
      expect(await writes()).toEqual(before);
      // هوشِ مصنوعی هرگز صدا زده نشد.
      expect(sent.some((s) => s.method === 'sendChatAction')).toBe(false);
    });
  }

  it('گروه — حتی برای عضوِ وصل — هیچ پاسخی ندارد', async () => {
    for (const cmd of ['/tasks', '/hours', '/start', 'SECRET؟']) await handleUpdate(msg(CHAT.A, cmd, 'group'));
    for (const cmd of ['/tasks', '/hours']) await handleUpdate(msg(CHAT.A, cmd, 'supergroup'));
    expect(sent).toHaveLength(0);
  });

  it('لینکِ اتصالِ جعلی یا حدسی چیزی را وصل نمی‌کند', async () => {
    for (const tok of ['x', 'AAAA', '../../', "' or 1=1 --", 'null']) await handleUpdate(msg(CHAT.STRANGER, `/start ${tok}`));
    const linked = await db.select().from(users).where(eq(users.telegramChatId, String(CHAT.STRANGER)));
    expect(linked).toHaveLength(0);
    expect(out()).not.toMatch(/SECRET/);
  });
});

describe('ربات — عضوِ وصل، بیرون از دسترسی‌اش', () => {
  it('/tasks فقط تسک‌های خودش؛ نه پروژهٔ دیگران، نه خصوصی، نه قطع‌شده، نه تسکِ خصوصی', async () => {
    await handleUpdate(msg(CHAT.A, '/tasks'));
    expect(out()).toContain('تسکِ عمومیِ آ');
    expect(out()).not.toMatch(/SECRET/);
  });

  it('فهرستِ پروژهٔ تایمر/ثبت فقط پروژه‌های مجاز را دارد', async () => {
    await handleUpdate(msg(CHAT.A, '/timer'));
    await handleUpdate(msg(CHAT.A, '/log'));
    const buttons = JSON.stringify(sent.map((s) => s.payload.reply_markup));
    expect(buttons).toContain(`t:s:${P1}`);
    for (const p of [P2, P3, P4]) {
      expect(buttons).not.toContain(`:${p}"`);
    }
    expect(out()).not.toMatch(/SECRET/);
  });

  it('دکمهٔ جعلی برای پروژهٔ ممنوع: نه تایمر، نه ساعت، نه نامِ پروژه', async () => {
    const before = await writes();
    for (const p of [P2, P3, P4]) {
      await handleUpdate(press(CHAT.A, `t:s:${p}`));
      await handleUpdate(press(CHAT.A, `l:m:${p}:60`));
    }
    expect(await writes()).toEqual(before);
    expect(out()).not.toMatch(/SECRET/);
    // دکمه با شناسهٔ ساختگی/منفی/متن هم چیزی نمی‌سازد.
    for (const d of ['t:s:-1', 't:s:abc', 'l:m:0:-60', 'l:m:0:99999', `l:m:${P1}:1e9`, 'zz:yy', '']) await handleUpdate(press(CHAT.A, d));
    expect(await writes()).toEqual(before);
  });

  it('کارفرما: نه تایمر، نه ثبتِ ساعت، نه نامِ تیم یا پروژهٔ دیگران', async () => {
    const before = await writes();
    for (const u of everyInput(CHAT.CLIENT)) await handleUpdate(u);
    expect(out()).not.toMatch(/SECRET|55555|66666|777777/);
    expect(await writes()).toEqual(before);
  });
});

describe('ربات — هوشِ مصنوعی نمی‌تواند از دسترسی بیرون بزند', () => {
  it('مدلی که پروژه/تسکِ ممنوع می‌خواهد فقط «اجازه نیست/پیدا نشد» می‌گیرد', async () => {
    const seen = fakeAi([
      toolCall('get_project', { project_id: P2 }, 'g2'),
      toolCall('get_project', { project_id: P3 }, 'g3'),
      toolCall('get_project', { project_id: P4 }, 'g4'),
      toolCall('search', { query: 'SECRET' }, 's1'),
      toolCall('list_projects', { include_closed: true }, 'l1'),
      toolCall('get_project', { project_id: P1 }, 'g1'),
      say('تمام'),
    ]);
    await handleUpdate(msg(CHAT.A, 'همه چیز را نشانم بده'));
    expect(seen.length).toBeGreaterThan(0);
    const all = seen.join('\n');
    expect(all).not.toMatch(/SECRET/);
    // پروژهٔ مجاز هست، ولی بی قیمت و بی مبلغِ توافقی.
    expect(all).toContain('پروژهٔ آ');
    expect(all).not.toMatch(/777777|55555|66666/);
  });

  it('حلقهٔ بی‌پایانِ ابزار بعد از ۶ گام قطع می‌شود', async () => {
    fakeAi([toolCall('whoami', {})]);
    await handleUpdate(msg(CHAT.A, 'تکرار'));
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('نوشتن روی پروژه/تسکِ ممنوع حتی با «بله» انجام نمی‌شود', async () => {
    const before = await writes();
    const attempts: Array<[string, Record<string, unknown>]> = [
      ['log_hours', { project_id: P2, hours: 3 }],
      ['start_timer', { project_id: P3 }],
      ['create_task', { project_id: P2, title: 'نفوذ' }],
      ['add_comment', { project_id: P4, text: 'نفوذ' }],
      ['set_task_status', { task_id: T_P2, status: 1 }],
      ['set_task_status', { task_id: T_PRIV, status: 1 }],
    ];
    for (const [tool, args] of attempts) {
      sent = [];
      const seen = fakeAi([toolCall(tool, args), say('done')]);
      await handleUpdate(msg(CHAT.A, `do ${tool}`));
      const yes = sent.flatMap((s) => ((s.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> })?.inline_keyboard ?? []).flat())
        .find((b) => b.callback_data?.startsWith('a:y:'));
      expect(yes, tool).toBeDefined();
      await handleUpdate(press(CHAT.A, yes!.callback_data!));
      expect(seen.join('\n'), tool).not.toMatch(/SECRET/);
      // ⚠️ پیامِ تأیید هم نامِ پروژه/تسکِ ممنوع را لو نمی‌دهد (شناسه از مدل می‌آید).
      expect(out(), tool).not.toMatch(/SECRET/);
    }
    expect(await writes()).toEqual(before);
  });

  it('تأییدِ کارِ آ از چتِ کارفرما یا غریبه اجرا نمی‌شود', async () => {
    const before = await writes();
    fakeAi([toolCall('log_hours', { project_id: P1, hours: 1 }), say('ok')]);
    await handleUpdate(msg(CHAT.A, 'یک ساعت ثبت کن'));
    const yes = sent.flatMap((s) => ((s.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> })?.inline_keyboard ?? []).flat())
      .find((b) => b.callback_data?.startsWith('a:y:'))!;
    await handleUpdate(press(CHAT.CLIENT, yes.callback_data!));
    await handleUpdate(press(CHAT.STRANGER, yes.callback_data!));
    expect(await writes()).toEqual(before);
  });

  it('کلیدِ هوشِ مصنوعیِ آ برای کس دیگری خرج نمی‌شود (کارفرما بی‌اتصال است)', async () => {
    const fetchSpy = vi.fn(async () => say('x'));
    vi.stubGlobal('fetch', fetchSpy);
    await handleUpdate(msg(CHAT.CLIENT, 'سلام'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('MCP — بیرون از دسترسی', () => {
  it('عضو: فهرست و جستجو بیش از خودِ برنامه نیست؛ خصوصی، قطع‌شده و پروژهٔ دیگران نه', async () => {
    const actor = roles(A, ['member']);
    const { call, close } = await mcpAs(actor, 'read');
    const list = await call('list_projects', { include_closed: true });
    const app = (await listProjects(actor)).map((p) => p.title);
    for (const title of ['SECRET-P2 فقط ب', 'SECRET-P3 خصوصی', 'SECRET-P4 قطع‌شده']) {
      expect(list.text.includes(title), title).toBe(app.includes(title));
    }
    expect(list.text).not.toMatch(/SECRET-P3|SECRET-P4/);
    expect(list.text).not.toMatch(/777777/);
    const hits = await call('search', { query: 'SECRET' });
    expect(hits.text).not.toMatch(/SECRET-P3|SECRET-P4|SECRET-USER-B/);
    for (const p of [P2, P3, P4]) {
      const r = await call('get_project', { project_id: p });
      expect(r.error, `project ${p}`).toBe(true);
      expect(r.text).not.toMatch(/SECRET/);
    }
    const mine = await call('get_project', { project_id: P1 });
    expect(mine.text).not.toMatch(/SECRET-PRIV-TASK|55555|66666|777777/);
    expect((await call('list_my_tasks')).text).not.toMatch(/SECRET/);
    expect((await call('team_availability')).error).toBe(true);
    await close();
  });

  it('عضو با توکنِ نوشتنی هم روی ممنوع‌ها نمی‌نویسد', async () => {
    const before = await writes();
    const { call, close } = await mcpAs(roles(A, ['member']), 'write');
    const results = [
      await call('log_hours', { project_id: P2, hours: 2 }),
      await call('log_hours', { project_id: P3, hours: 2 }),
      await call('log_hours', { project_id: P4, hours: 2 }),
      await call('start_timer', { project_id: P2 }),
      await call('create_task', { project_id: P2, title: 'x' }),
      await call('add_comment', { project_id: P2, text: 'x' }),
      await call('add_comment', { project_id: P4, text: 'x' }),
      await call('set_task_status', { task_id: T_P2, status: 1 }),
      await call('set_task_status', { task_id: T_PRIV, status: 1 }),
    ];
    for (const r of results) expect(r.text).not.toMatch(/SECRET/);
    expect(await writes()).toEqual(before);
    await close();
  });

  it('سپردنِ تسک به کسی که در پروژه نیست انجام نمی‌شود (هم‌تیمی مجاز است)', async () => {
    const { call, close } = await mcpAs(roles(A, ['member']), 'write');
    const outsider = JSON.parse((await call('create_task', { project_id: P1, title: 'به بیرونی', assignee_user_id: OWNER })).text) as { taskId?: number };
    const teammate = JSON.parse((await call('create_task', { project_id: P1, title: 'به هم‌تیمی', assignee_user_id: B })).text) as { taskId?: number };
    const rows = await db.select({ id: tasks.id, assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.projectId, P1));
    if (outsider.taskId) expect(rows.find((r) => r.id === outsider.taskId)!.assignedTo).not.toBe(OWNER);
    expect(rows.find((r) => r.id === teammate.taskId)!.assignedTo).toBe(B);
    await db.delete(tasks).where(inArray(tasks.id, [outsider.taskId ?? 0, teammate.taskId ?? 0]));
    await close();
  });

  it('کارفرما: فقط پروژهٔ خودش، بی مبلغ؛ و هیچ نوشتنِ ساعت/تایمر', async () => {
    const before = await writes();
    const { call, close } = await mcpAs(roles(CLIENT, ['client']), 'write');
    const list = await call('list_projects', { include_closed: true });
    expect(list.text).not.toMatch(/SECRET|55555|66666/);
    for (const p of [P2, P3, P4]) expect((await call('get_project', { project_id: p })).error).toBe(true);
    expect((await call('get_project', { project_id: P1 })).text).not.toMatch(/SECRET|55555|66666/);
    await call('log_hours', { project_id: P1, hours: 1 });
    await call('start_timer', { project_id: P1 });
    expect((await call('search', { query: 'SECRET' })).text).not.toMatch(/SECRET/);
    const after = await writes();
    expect({ logs: after.logs, timers: after.timers }).toEqual({ logs: before.logs, timers: before.timers });
    await close();
  });

  it('عضوِ قفل‌شده یا سابق: توکنش دیگر کار نمی‌کند', async () => {
    for (const id of [LOCKED, FINANCE]) {
      const { token } = await createToken(roles(id, ['member']), { name: `old-${id}`, scope: 'write' });
      expect((await authenticateToken(token)).ok).toBe(false);
    }
  });

  it('نقطهٔ /api/mcp بی‌توکن، توکنِ ساختگی یا توکنِ عضوِ قفل ← ۴۰۱', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } });
    const headers = (auth?: string) => ({
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      ...(auth ? { authorization: auth } : {}),
    });
    const { token } = await createToken(roles(LOCKED, ['member']), { name: 'locked', scope: 'read' });
    for (const auth of [undefined, 'Bearer kbz_fake', 'Basic abc', `Bearer ${token}`]) {
      const res = await mcpPost(new Request('http://localhost/api/mcp', { method: 'POST', headers: headers(auth), body }));
      expect(res.status, String(auth)).toBe(401);
      expect(await res.text()).not.toMatch(/SECRET/);
    }
  });
});

describe('MCP — پیام‌ها (۲.۱۱.۰)', () => {
  it('فهرستِ گیرنده‌ها همان برنامه است: نه خودش، نه قفل‌شده/سابق/حذف‌شده، نه مالک', async () => {
    const { call, close } = await mcpAs(roles(A, ['member']), 'read');
    const out = JSON.parse((await call('list_message_recipients')).text) as { canSendDirect: boolean; recipients: Array<{ userId: number }> };
    const ids = out.recipients.map((r) => r.userId);
    for (const id of [A, LOCKED, FINANCE, DELETED, OWNER]) expect(ids, String(id)).not.toContain(id);
    await close();
  });

  it('توکنِ فقط‌خواندنی پیام نمی‌فرستد؛ پیام به کاربرِ ناموجود یا قفل‌شده رشته نمی‌سازد', async () => {
    const [before] = await sql<Array<{ n: number }>>`select count(*)::int as n from threads`;
    const read = await mcpAs(roles(A, ['member']), 'read');
    expect((await read.call('send_message', { recipient_user_ids: [B], text: 'x' })).error).toBe(true);
    expect((await read.call('message_management', { text: 'x' })).error).toBe(true);
    await read.close();
    const write = await mcpAs(roles(A, ['member']), 'write');
    const r = await write.call('send_message', { recipient_user_ids: [LOCKED, 999999], text: 'x' });
    expect(r.text).not.toMatch(/SECRET/);
    await write.close();
    const [after] = await sql<Array<{ n: number }>>`select count(*)::int as n from threads`;
    expect(after!.n).toBe(before!.n);
  });
});

describe('MCP — یادآورها و جلسه‌ها (۲.۱۲.۰)', () => {
  it('یادآور مالِ خودِ کاربر است: دیگری نه می‌بیند نه پاک می‌کند؛ زمانِ گذشته رد می‌شود', async () => {
    const a = await mcpAs(roles(A, ['member']), 'write');
    const past = JSON.parse((await a.call('create_reminder', { at: '2020-01-01 10:00', text: 'گذشته' })).text) as { created: boolean };
    expect(past.created).toBe(false);
    const made = JSON.parse((await a.call('create_reminder', { at: '2099-01-01 10:00', text: 'SECRET-REMINDER' })).text) as { created: boolean; reminderId: number };
    expect(made.created).toBe(true);
    expect((await a.call('list_my_reminders')).text).toContain('SECRET-REMINDER');
    await a.close();

    const b = await mcpAs(roles(B, ['member']), 'write');
    expect((await b.call('list_my_reminders')).text).not.toContain('SECRET-REMINDER');
    const del = JSON.parse((await b.call('delete_reminder', { reminder_id: made.reminderId })).text) as { deleted: boolean };
    expect(del.deleted).toBe(false);
    expect((await b.call('list_my_meetings')).error).toBe(false);
    await b.close();

    const again = await mcpAs(roles(A, ['member']), 'write');
    expect((await again.call('list_my_reminders')).text).toContain('SECRET-REMINDER');
    expect(JSON.parse((await again.call('delete_reminder', { reminder_id: made.reminderId })).text)).toEqual({ deleted: true });
    await again.close();
  });
});

describe('MCP — همهٔ ابزارها با شناسهٔ ممنوع (۲.۱۳.۰)', () => {
  /**
   * ⚠️ فازِ کور: هر ابزارِ خواندنی (و نوشتنی) با شناسهٔ پروژه/تسک/آدمِ ممنوع صدا
   * زده می‌شود. هیچ پاسخی نباید نشانهٔ «SECRET» داشته باشد و هیچ نوشتنی نباید
   * روی پروژه‌های ممنوع بنشیند — هر ابزارِ تازه خودبه‌خود زیرِ این آزمون می‌رود.
   */
  type Schema = { properties?: Record<string, { type?: string; enum?: unknown[]; items?: unknown; anyOf?: unknown[] }>; required?: string[] };

  function argsFor(schema: Schema | undefined, ids: { project: number; task: number; user: number; other: number }) {
    const out: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
      if (name === 'project_id') out[name] = ids.project;
      else if (name === 'task_id' || name === 'depends_on_task_id') out[name] = ids.task;
      else if (/user_id$/.test(name)) out[name] = ids.user;
      else if (/_id$/.test(name)) out[name] = ids.other;
      else if (name === 'recipient_user_ids' || name === 'attendee_ids') out[name] = [ids.user];
      else if (name === 'office_ids' || name === 'role_ids') out[name] = [ids.other];
      else if (prop.enum && prop.enum.length > 0) out[name] = prop.enum[0];
      else if ((schema?.required ?? []).includes(name)) {
        if (prop.type === 'string') out[name] = /date|from|to/.test(name) ? '2030-01-01' : name === 'at' ? '2030-01-01 10:00' : name === 'url' ? 'https://example.com' : 'SAFE-TEXT';
        else if (prop.type === 'number' || prop.type === 'integer') out[name] = 1;
        else if (prop.type === 'boolean') out[name] = true;
        else if (prop.type === 'array') out[name] = [];
      }
    }
    return out;
  }

  it('عضو: هیچ ابزاری دادهٔ پروژه/تسک/آدمِ ممنوع را لو نمی‌دهد و چیزی نمی‌نویسد', async () => {
    const before = await writes();
    const { client, call, close } = await mcpAs(roles(A, ['member']), 'write');
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(50);
    const leaks: string[] = [];
    for (const tool of tools) {
      for (const project of [P2, P3, P4]) {
        const args = argsFor(tool.inputSchema as Schema, { project, task: T_P2, user: B, other: project });
        const r = await call(tool.name, args);
        if (/SECRET/.test(r.text)) leaks.push(`${tool.name}(${JSON.stringify(args)}): ${r.text.slice(0, 200)}`);
      }
    }
    expect(leaks).toEqual([]);
    const after = await writes();
    expect({ logs: after.logs, tasks: after.tasks, comments: after.comments }).toEqual({ logs: before.logs, tasks: before.tasks, comments: before.comments });
    await close();
  });

  it('کارفرما: همان فازِ کور، با شناسهٔ پروژهٔ خودش هم بی مبلغِ اعضا', async () => {
    const { client, call, close } = await mcpAs(roles(CLIENT, ['client']), 'read');
    const { tools } = await client.listTools();
    const leaks: string[] = [];
    for (const tool of tools.filter((t) => (t.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint)) {
      for (const project of [P1, P2, P3, P4]) {
        const r = await call(tool.name, argsFor(tool.inputSchema as Schema, { project, task: T_P2, user: B, other: project }));
        if (/SECRET|55555|66666/.test(r.text)) leaks.push(`${tool.name}@${project}: ${r.text.slice(0, 200)}`);
      }
    }
    expect(leaks).toEqual([]);
    await close();
  });

  it('کنترلِ مثبت: روی پروژهٔ مجاز همان ابزارها واقعاً داده می‌دهند', async () => {
    const { call, close } = await mcpAs(roles(A, ['member']), 'write');
    const full = await call('get_project_full', { project_id: P1, sections: ['project', 'tasks'] });
    expect(full.error).toBe(false);
    expect(full.text).toContain('پروژهٔ آ');
    expect(full.text).not.toMatch(/SECRET-PRIV-TASK/);
    const opts = await call('task_form_options', { project_id: P1 });
    expect(opts.error).toBe(false);
    expect((await call('my_schedule')).error).toBe(false);
    expect((await call('list_inbox')).error).toBe(false);
    expect((await call('list_notifications', { include_read: true })).error).toBe(false);
    // بخش‌های مدیریتی برای عضوِ ساده بسته‌اند.
    for (const t of ['finance_accounts', 'access_board', 'list_activity']) expect((await call(t)).error, t).toBe(true);
    expect((await call('list_people', { role: 'member' })).error).toBe(true);
    expect((await call('get_report', { kind: 'overall' })).error).toBe(true);
    await close();
  });

  it('ابزارهای حساس بی اجازهٔ «حساس» اصلاً دیده نمی‌شوند', async () => {
    const { client, close } = await mcpAs(roles(A, ['member']), 'write');
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of names) expect(n.startsWith('sensitive_') || n.startsWith('delete_') && n !== 'delete_reminder').toBe(false);
    await close();
  });
});

describe('وب‌هوکِ ربات', () => {
  it('بی رمزِ درست ۴۰۳ است و پیامِ جعلی هیچ اثری ندارد', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:audit-token';
    const before = await writes();
    const fake = JSON.stringify(msg(CHAT.A, '/tasks'));
    for (const secret of [undefined, '', 'wrong', 'audit-token']) {
      const res = await webhookPost(new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret !== undefined ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
        body: fake,
      }));
      expect(res.status).toBe(403);
    }
    expect(sent).toHaveLength(0);
    expect(await writes()).toEqual(before);
  });
});
