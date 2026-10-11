import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { projectClients, projectMembers, projects, tags, tasks, userRoles, users } from '../schema';
import { createProject, createTask, deleteTask, getProjectDetail, getTaskDetail, myTasks } from '@/server/projects/service';
import { findTaskByRef, setProjectCode } from '@/server/projects/task-numbers';
import { search } from '@/server/search/service';
import { handleUpdate, resetBotState, setTelegramApi, type TgUpdate } from '@/server/telegram/bot';
import type { Actor } from '@/domain/access/permissions';

/**
 * شمارهٔ تسک بر اساسِ پروژه (۲.۱۶.۰): تریگرِ پایگاه‌داده شماره می‌دهد، شماره
 * دوباره داده نمی‌شود، کارفرما نمی‌بیندش، و «ALZ-325» در جستجو و ربات پیدا
 * می‌شود — فقط برای کسی که تسک را می‌بیند.
 */

let OWNER = 0, MEMBER = 0, CLIENT = 0, OUTSIDER = 0, P = 0, Q = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => as(OWNER, ['owner']);
const member = () => as(MEMBER, ['member']);
const client = () => as(CLIENT, ['client']);
const newTask = (projectId: number, title: string, extra: Partial<{ isPrivate: boolean }> = {}) =>
  createTask(owner(), projectId, {
    title, description: '', statusTagId: null, priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false, ...extra,
  });

beforeAll(async () => {
  await sql`truncate table tasks, project_members, project_clients, projects, user_roles, tags, audit_log, notifications, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'o@n', name: 'مالک' }, { email: 'm@n', name: 'عضو', telegramChatId: '8800' },
    { email: 'c@n', name: 'کارفرما' }, { email: 'x@n', name: 'غریبه' },
  ]).returning({ id: users.id });
  [OWNER, MEMBER, CLIENT, OUTSIDER] = u.map((r) => r.id) as [number, number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: MEMBER, role: 'member' },
    { userId: CLIENT, role: 'client' }, { userId: OUTSIDER, role: 'member' },
  ]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  P = await createProject(owner(), {
    title: 'Alzahra website', description: '', regDate: null, deadline: null, statusTagId: null, price: '0',
    currencyId: null, officeId: null, parentId: null, isUnitBased: false, isTender: false, scope: 'company',
  } as Parameters<typeof createProject>[1]);
  const [q] = await db.insert(projects).values({ title: 'پروژهٔ دوم', scope: 'company' }).returning({ id: projects.id });
  Q = q!.id;
  await db.insert(projectMembers).values([{ projectId: P, userId: MEMBER, roleTagId: role!.id }, { projectId: Q, userId: MEMBER, roleTagId: role!.id }]);
  await db.insert(projectClients).values({ projectId: P, userId: CLIENT });
});

describe('شماره‌دهی', () => {
  it('هر پروژه از ۱ می‌شمارد؛ حذف شماره را آزاد نمی‌کند؛ درجِ مستقیم هم شماره می‌گیرد', async () => {
    const a = await newTask(P, 'اول');
    const b = await newTask(P, 'دوم');
    const q1 = await newTask(Q, 'پروژهٔ دیگر');
    const num = async (id: number) => (await db.select({ n: tasks.number }).from(tasks).where(eq(tasks.id, id)))[0]!.n;
    expect([await num(a), await num(b), await num(q1)]).toEqual([1, 2, 1]);
    await deleteTask(owner(), b);
    const c = await newTask(P, 'سوم');
    expect(await num(c)).toBe(3);
    // درجِ خامِ بی‌شماره (درون‌ریزی/QA) — تریگر می‌دهد.
    const [raw] = await db.insert(tasks).values({ projectId: P, title: 'خام', createdBy: OWNER }).returning({ id: tasks.id });
    expect(await num(raw!.id)).toBe(4);
  });

  it('پروژهٔ تازه کدِ پیشنهادی از عنوان می‌گیرد؛ کدِ تکراری و نامعتبر رد می‌شود', async () => {
    const [p] = await db.select({ code: projects.code }).from(projects).where(eq(projects.id, P));
    expect(p!.code).toBe('ALZ');
    expect(await setProjectCode(owner(), Q, 'alz')).toEqual({ ok: false, error: expect.any(String) });
    expect((await setProjectCode(owner(), Q, '1x')).ok).toBe(false);
    expect(await setProjectCode(owner(), Q, 'two')).toEqual({ ok: true, code: 'TWO' });
    await expect(setProjectCode(member(), Q, 'MEM')).rejects.toThrow();
  });
});

describe('کارفرما شماره نمی‌بیند', () => {
  it('فهرستِ پروژه، جزئیاتِ تسک، صندوق و جستجو', async () => {
    const id = await newTask(P, 'برای کارفرما');
    const forClient = await getProjectDetail(client(), P);
    expect(forClient.tasks.length).toBeGreaterThan(0);
    expect(forClient.tasks.every((t) => t.number === null)).toBe(true);
    const detail = await getTaskDetail(client(), id);
    expect(detail.task.number).toBeNull();
    expect(detail.task.projectCode).toBe('');
    const inbox = await myTasks(client());
    expect([...inbox.active, ...inbox.review].every((t) => t.number === null)).toBe(true);
    expect(await findTaskByRef(client(), 'ALZ-1')).toBeNull();
    // مالک می‌بیند.
    expect((await getProjectDetail(owner(), P)).tasks.every((t) => (t.number ?? 0) > 0)).toBe(true);
    expect((await getTaskDetail(owner(), id)).task.number).toBeGreaterThan(0);
  });
});

describe('پیدا کردن با شماره', () => {
  it('«ALZ-1» و «#1» با پروژه؛ تسکِ خصوصی و غریبه نه', async () => {
    expect((await findTaskByRef(owner(), 'alz-1'))?.title).toBe('اول');
    expect((await findTaskByRef(member(), '#1', P))?.ref).toBe('ALZ-1');
    expect(await findTaskByRef(member(), '#1')).toBeNull();
    const secret = await newTask(P, 'خصوصی', { isPrivate: true });
    const [{ n }] = (await db.select({ n: tasks.number }).from(tasks).where(eq(tasks.id, secret))) as [{ n: number }];
    expect(await findTaskByRef(member(), `ALZ-${n}`)).toBeNull();
    expect(await findTaskByRef(as(OUTSIDER, ['member']), 'ALZ-1')).toBeNull();
    // کدِ پیش‌فرضِ P + شناسه برای پروژهٔ بی‌کد.
    await db.update(projects).set({ code: '' }).where(eq(projects.id, Q));
    expect((await findTaskByRef(owner(), `P${Q}-1`))?.title).toBe('پروژهٔ دیگر');
  });

  it('جستجوی Ctrl+K «ALZ-1» را با پیوندِ کوتاه می‌دهد', async () => {
    const hits = await search(owner(), 'ALZ-1');
    expect(hits).toContainEqual(expect.objectContaining({ kind: 'task', href: '/t/ALZ-1' }));
    expect((await search(client(), 'ALZ-1')).some((h) => h.kind === 'task')).toBe(false);
  });
});

describe('ربات با شماره', () => {
  let sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
  let nextId = 1;
  const msg = (text: string): TgUpdate => ({ update_id: nextId++, message: { message_id: nextId, text, chat: { id: 8800, type: 'private' } } });
  beforeEach(() => {
    sent = [];
    resetBotState();
    setTelegramApi(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: { message_id: 1 } }; });
  });
  afterEach(() => setTelegramApi(null));

  it('«ALZ-1» کارتِ همان تسک را با شماره می‌فرستد؛ شمارهٔ ناپیدا پیامِ راهنما', async () => {
    await handleUpdate(msg('ALZ-1'));
    const text = sent.map((s) => String(s.payload.text ?? '')).join('\n');
    expect(text).toContain('<b>اول</b> · <code>ALZ-1</code>');
    sent = [];
    await handleUpdate(msg('ALZ-999'));
    expect(sent.map((s) => String(s.payload.text ?? '')).join('\n')).toContain('ALZ-325');
  });
});
