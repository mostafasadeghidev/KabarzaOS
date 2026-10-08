import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { db, sql } from '../client';
import { comments, projectMembers, projects, tags, tasks, timelogs, userRoles, users } from '../schema';
import { authenticateToken, createToken } from '@/server/mcp/tokens';
import { buildMcpServer } from '@/server/mcp/server';
import { shape } from '@/server/mcp/kit';
import type { Actor } from '@/domain/access/permissions';

/** ابزارهای نوشتنیِ روزمره (۲.۱۳.۰) — همان کارِ سایت، با گاردِ خودِ سرویس. */

let OWNER = 0, A = 0, P = 0, T = 0, PRIO = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

async function mcp(actor: Actor, scope: 'read' | 'write' | 'sensitive' = 'write') {
  const { token } = await createToken(actor, { name: `w-${actor.id}-${Math.random()}`, scope });
  const auth = await authenticateToken(token);
  if (!auth.ok) throw new Error('auth');
  const server = buildMcpServer(auth.session);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(s), client.connect(c)]);
  return {
    client,
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>; isError?: boolean };
      return { error: r.isError === true, text: r.content.map((x) => x.text).join('\n') };
    },
  };
}

beforeAll(async () => {
  await sql`truncate table api_keys, timelogs, comments, tasks, project_members, projects, user_roles, tags, audit_log, absences, users restart identity cascade`;
  const u = await db.insert(users).values([{ email: 'o@w', name: 'مالک' }, { email: 'a@w', name: 'عضو' }]).returning({ id: users.id });
  [OWNER, A] = u.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: A, role: 'member' }]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const [prio] = await db.insert(tags).values({ name: 'بالا', type: 'task_priority' }).returning({ id: tags.id });
  PRIO = prio!.id;
  const [p] = await db.insert(projects).values({ title: 'کار', scope: 'company' }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: A, roleTagId: role!.id });
  const [t] = await db.insert(tasks).values({
    projectId: P, title: 'تسکِ اصلی', description: 'توضیحِ اصلی', createdBy: A, assignedTo: A, dueDate: '2030-05-01', priorityTagId: PRIO,
  }).returning({ id: tasks.id });
  T = t!.id;
});

describe('ابزارهای روزمره', () => {
  it('ویرایشِ جزئیِ تسک فقط همان فیلد را عوض می‌کند', async () => {
    const { call } = await mcp(as(A, ['member']));
    const r = await call('update_task', { task_id: T, title: 'عنوانِ تازه' });
    expect(r.error, r.text).toBe(false);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, T));
    expect(row).toMatchObject({ title: 'عنوانِ تازه', description: 'توضیحِ اصلی', dueDate: '2030-05-01', priorityTagId: PRIO, assignedTo: A });
    await call('update_task', { task_id: T, due_date: '' });
    expect((await db.select().from(tasks).where(eq(tasks.id, T)))[0]!.dueDate).toBeNull();
  });

  it('یادداشتِ تسک در گفتگوی همان تسک می‌نشیند و جزئیاتِ تسک آن را نشان می‌دهد', async () => {
    const { call } = await mcp(as(A, ['member']));
    expect((await call('add_task_note', { task_id: T, text: 'شروع کردم' })).error).toBe(false);
    const notes = await db.select().from(comments).where(eq(comments.taskId, T));
    expect(notes.map((n) => n.body)).toContain('شروع کردم');
    expect((await call('get_task', { task_id: T })).text).toContain('شروع کردم');
  });

  it('مرخصی و برنامهٔ هفتگیِ خودم', async () => {
    const { call } = await mcp(as(A, ['member']));
    expect((await call('record_leave', { from: '2030-06-01', to: '2030-06-03', note: 'سفر' })).error).toBe(false);
    expect((await call('set_weekly_schedule', { days: [{ day: 0, slots: [{ from: '09:00', to: '17:00' }] }] })).error).toBe(false);
    const sched = await call('my_schedule');
    expect(sched.text).toContain('09:00');
    expect(sched.text).toContain('2030-06-01');
    // برنامهٔ دیگری بی مجوزِ اعضا نه.
    expect((await call('set_weekly_schedule', { user_id: OWNER, days: [] })).error).toBe(true);
  });

  it('ویرایشِ ساعتِ ثبت‌شده؛ و فقط‌خواندنی هیچ نمی‌نویسد', async () => {
    const { call } = await mcp(as(A, ['member']));
    await call('log_hours', { project_id: P, hours: 1 });
    const list = JSON.parse((await call('list_time_logs')).text) as { rows: Array<{ id: number }> };
    const id = list.rows[0]!.id;
    expect((await call('update_time_log', { log_id: id, hours: 2, minutes: 15, description: 'اصلاح' })).error).toBe(false);
    expect((await db.select().from(timelogs).where(eq(timelogs.id, id)))[0]!.minutes).toBe(135);
    const ro = await mcp(as(A, ['member']), 'read');
    expect((await ro.call('update_time_log', { log_id: id, hours: 9, minutes: 0 })).error).toBe(true);
    expect((await db.select().from(timelogs).where(eq(timelogs.id, id)))[0]!.minutes).toBe(135);
  });

  it('عضو جلسه برای پروژه‌ای که مدیرش نیست نمی‌سازد', async () => {
    const { call } = await mcp(as(A, ['member']));
    const r = await call('create_meeting', { title: 'جلسه', at: '2030-01-01 10:00', project_id: P });
    expect(r.error).toBe(true);
  });

  it('پالایهٔ خروجی: راز و کلیدِ فایل حذف، اندازه مهار', () => {
    const out = shape({ name: 'x', passwordHash: 'h', storageKey: 'k', nested: { apiKeyEnc: 'e', ok: 1 }, list: Array.from({ length: 100 }, (_, i) => i), when: new Date('2030-01-01T00:00:00Z') }) as Record<string, unknown>;
    expect(out).not.toHaveProperty('passwordHash');
    expect(out).not.toHaveProperty('storageKey');
    expect(out.nested).toEqual({ ok: 1 });
    expect((out.list as unknown[]).length).toBe(61);
    expect(out.when).toBe('2030-01-01T00:00:00.000Z');
  });

  it('دامنهٔ «حساس» در توکن جدا ذخیره می‌شود', async () => {
    const { token } = await createToken(as(A, ['member']), { name: 'all', scope: 'sensitive' });
    const auth = await authenticateToken(token);
    expect(auth.ok && auth.session.scopes).toEqual(['read', 'write', 'sensitive']);
  });
});

describe('کارهای حساس با اجازهٔ صریح', () => {
  it('بی اجازهٔ حساس ابزارِ حساسی در فهرست نیست؛ با اجازه هست', async () => {
    const w = await mcp(as(A, ['member']), 'write');
    const plain = (await w.client.listTools()).tools.map((t) => t.name);
    expect(plain).not.toContain('delete_task');
    expect(plain).not.toContain('create_ledger_entry');
    const s = await mcp(as(A, ['member']), 'sensitive');
    const all = (await s.client.listTools()).tools.map((t) => t.name);
    expect(all).toContain('delete_task');
    expect(all).toContain('create_ledger_entry');
  });

  it('مالک با اجازهٔ حساس پروژه می‌سازد و تسک حذف می‌کند؛ ثبت با برچسبِ حساس', async () => {
    const { call } = await mcp(as(OWNER, ['owner']), 'sensitive');
    const made = JSON.parse((await call('create_project', { title: 'از هوشِ مصنوعی' })).text) as { projectId: number };
    expect(made.projectId).toBeGreaterThan(0);
    const [t] = await db.insert(tasks).values({ projectId: P, title: 'برای حذف', createdBy: OWNER }).returning({ id: tasks.id });
    const r = await call('delete_task', { task_id: t!.id });
    expect(r.error, r.text).toBe(false);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t!.id));
    expect(row?.deletedAt ?? null).not.toBeNull();
    const logs = await sql<Array<{ after: { sensitive?: boolean; tool: string } }>>`select after from audit_log where action = 'mcp.call' and after->>'tool' = 'delete_task'`;
    expect(logs[0]!.after.sensitive).toBe(true);
  });

  it('عضو ساعتِ خودش را پاک می‌کند، نه ساعتِ دیگری را؛ و پول نمی‌پردازد', async () => {
    const { call } = await mcp(as(A, ['member']), 'sensitive');
    await call('log_hours', { project_id: P, hours: 1 });
    const mine = await db.select().from(timelogs).where(eq(timelogs.userId, A));
    const [other] = await db.insert(timelogs).values({ userId: OWNER, projectId: P, logDate: '2030-01-01', minutes: 30, description: '' }).returning({ id: timelogs.id });
    expect((await call('delete_time_log', { log_id: other!.id })).error).toBe(true);
    expect(await db.select().from(timelogs).where(eq(timelogs.id, other!.id))).toHaveLength(1);
    expect((await call('delete_time_log', { log_id: mine.at(-1)!.id })).error).toBe(false);
    expect((await call('create_ledger_entry', { account_id: 1, date: '2030-01-01', direction: 'out', amount: '100', currency_id: 1 })).error).toBe(true);
    expect((await call('pay', { what: 'request', id: 1, account_id: 1, date: '2030-01-01' })).error).toBe(true);
  });
});
