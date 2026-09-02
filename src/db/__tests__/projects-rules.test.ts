import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  comments, currencies, notifications, offices, projectMembers, projects,
  tags, taskRoles, tasks, tenderBids, userOffices, userRoles, users,
} from '../schema';
import * as service from '@/server/projects/service';
import * as repo from '@/server/projects/repository';
import { FrozenProjectError } from '@/server/projects/authority';
import { ForbiddenError } from '@/domain/access/guard';
import { PM_CAP } from '@/domain/access/project-scope';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * قواعدِ پروژه و تسک — پورتِ نسخهٔ قبلی:
 * وضعیتِ پیش‌فرض، کارفرمایان با diff، حذف فقط مالک + بی‌والدشدنِ زیرپروژه‌ها،
 * انجماد با استثنای مالک، تیکِ کامنت برای شرکت‌کننده، برداشتنِ همهٔ نقش‌ها،
 * پس‌گرفتنِ فقط برنده، و «گذشته از ددلاین»/«مناقصهٔ باز» در فهرست.
 */

const actor = (id: number, over: Partial<Actor> = {}): Actor => ({
  id, roles: ['member'], permissions: [], privateAccess: false, ...over,
});

let ownerId: number, staffId: number, sara: number, ali: number, bob: number, outsider: number;
let client1: number, client2: number;
let currencyId: number, officeId: number;
let notStarted: number, lead: number, onHold: number, completed: number;
let todo: number, doing: number;
let devRole: number, designRole: number, pmRole: number;

const owner = () => actor(ownerId, { roles: ['owner'] });
const staff = () => actor(staffId, { roles: ['admin'], permissions: ['projects.view', 'projects.manage'] as Permission[] });

const projectInput = (over: Partial<Parameters<typeof service.createProject>[1]> = {}) => ({
  title: 'پروژه', description: '', regDate: '2026-09-01', deadline: null,
  statusTagId: null, price: '0', currencyId, officeId: null, parentId: null,
  isUnitBased: false, isTender: false, tenderRoles: [], scope: 'company' as const,
  ...over,
});

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, comments, task_roles, tasks, tender_bids,
    project_clients, project_members, projects, tags, user_offices, offices, user_roles, users,
    currencies restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  currencyId = c[0]!.id;

  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'st@t', name: 'همکار' },
    { email: 's@t', name: 'سارا' },
    { email: 'a@t', name: 'علی' },
    { email: 'b@t', name: 'باب' },
    { email: 'x@t', name: 'بیرونی' },
    { email: 'c1@t', name: 'شرکتِ الف' },
    { email: 'c2@t', name: 'شرکتِ ب' },
  ]).returning({ id: users.id });
  [ownerId, staffId, sara, ali, bob, outsider, client1, client2] =
    u.map((r) => r.id) as [number, number, number, number, number, number, number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: staffId, role: 'admin' },
    { userId: sara, role: 'member' },
    { userId: ali, role: 'member' },
    { userId: bob, role: 'member' },
    { userId: outsider, role: 'member' },
    { userId: client1, role: 'client' },
    { userId: client2, role: 'client' },
  ]);

  const o = await db.insert(offices).values({ name: 'تهران' }).returning({ id: offices.id });
  officeId = o[0]!.id;
  await db.insert(userOffices).values({ userId: sara, officeId, manages: false });

  const t = await db.insert(tags).values([
    { name: 'شروع نشده', type: 'project_status', statusGroup: 'not_started' },
    { name: 'احتمالِ عقد قرارداد', type: 'project_status', statusGroup: 'lead' },
    { name: 'نگه‌داشته‌شده', type: 'project_status', statusGroup: 'on_hold' },
    { name: 'تکمیل‌شده', type: 'project_status', statusGroup: 'completed', isClosed: true },
    { name: 'انجام‌نشده', type: 'task_status', statusGroup: 'todo' },
    { name: 'در حالِ انجام', type: 'task_status', statusGroup: 'in_progress' },
    { name: 'دولوپر', type: 'member_role' },
    { name: 'دیزاینر', type: 'member_role' },
    { name: 'مدیر پروژه', type: 'member_role', grantsCap: PM_CAP },
  ]).returning({ id: tags.id });
  [notStarted, lead, onHold, completed, todo, doing, devRole, designRole, pmRole] =
    t.map((r) => r.id) as [number, number, number, number, number, number, number, number, number];
});

afterAll(async () => { await sql.end(); });

describe('وضعیتِ پیش‌فرض', () => {
  it('⚠️ پروژهٔ بی‌وضعیت «شروع نشده» می‌گیرد؛ مناقصه «احتمالِ عقد قرارداد»', async () => {
    const plain = await service.createProject(owner(), projectInput({ title: 'عادی' }));
    const tender = await service.createProject(owner(), projectInput({
      title: 'مناقصه', isTender: true, tenderRoles: [{ roleTagId: devRole, cap: '0' }],
    }));
    const rows = await db.select({ id: projects.id, statusTagId: projects.statusTagId })
      .from(projects).where(eq(projects.id, plain));
    expect(rows[0]!.statusTagId).toBe(notStarted);
    const trow = await db.select({ statusTagId: projects.statusTagId }).from(projects).where(eq(projects.id, tender));
    expect(trow[0]!.statusTagId).toBe(lead);
  });

  it('تسکِ بی‌وضعیت اولین تگِ todo را می‌گیرد', async () => {
    const pid = await service.createProject(owner(), projectInput({ title: 'برای تسک' }));
    const taskId = await service.createTask(owner(), pid, {
      title: 'کار', description: '', statusTagId: null, priorityTagId: null,
      assignedTo: null, dueDate: null, isPrivate: false, roleTagIds: [],
    }, { silent: true });
    const row = await db.select({ statusTagId: tasks.statusTagId }).from(tasks).where(eq(tasks.id, taskId));
    expect(row[0]!.statusTagId).toBe(todo);
  });
});

describe('کارفرمایان — diff، کارفرمای اصلی ثابت، اعلان', () => {
  let pid: number;
  beforeAll(async () => { pid = await service.createProject(owner(), projectInput({ title: 'کارفرمایی' })); });

  it('افزودنِ دو کارفرما: هر دو خبردار می‌شوند؛ اولی اصلی است', async () => {
    const r = await service.setClients(owner(), pid, [client1, client2]);
    expect(r).toEqual({ added: 2, removed: 0 });
    expect(await repo.primaryClientId(pid)).toBe(client1);
    for (const c of [client1, client2]) {
      const n = await db.select().from(notifications).where(eq(notifications.userId, c));
      expect(n.some((x) => x.type === 'project.signed')).toBe(true);
    }
  });

  it('⚠️ ویرایش با ترتیبِ دیگر، کارفرمای اصلی را جابه‌جا نمی‌کند (diff نه بازنویسی)', async () => {
    const r = await service.setClients(owner(), pid, [client2, client1]);
    expect(r).toEqual({ added: 0, removed: 0 });
    expect(await repo.primaryClientId(pid)).toBe(client1);
  });

  it('حذفِ کارفرما ممکن است — و اصلی به بعدی می‌رسد', async () => {
    const r = await service.setClients(owner(), pid, [client2]);
    expect(r).toEqual({ added: 0, removed: 1 });
    expect(await repo.primaryClientId(pid)).toBe(client2);
    expect((await repo.listClientIds(pid)).has(client1)).toBe(false);
  });

  it('کسی که نقشِ کارفرما ندارد پذیرفته نمی‌شود', async () => {
    await expect(service.setClients(owner(), pid, [client2, ali])).rejects.toThrow(ForbiddenError);
  });
});

describe('حذفِ پروژه — فقط مالک؛ زیرپروژه‌ها بی‌والد می‌مانند', () => {
  it('⚠️ همکارِ دارای projects.manage و مدیرِ پروژه نمی‌توانند؛ مالک می‌تواند', async () => {
    const parent = await service.createProject(owner(), projectInput({ title: 'والد' }));
    const child = await service.createProject(owner(), projectInput({ title: 'فرزند', parentId: parent }));
    await db.insert(projectMembers).values({ projectId: parent, userId: sara, roleTagId: pmRole, agreedAmount: '0', unitRate: '0' });

    await expect(service.deleteProject(staff(), parent, {})).rejects.toThrow(ForbiddenError);
    await expect(service.deleteProject(actor(sara), parent, {})).rejects.toThrow(ForbiddenError);

    await service.deleteProject(owner(), parent, {});
    const gone = await db.select({ deletedAt: projects.deletedAt }).from(projects).where(eq(projects.id, parent));
    expect(gone[0]!.deletedAt).not.toBeNull();
    const kid = await db.select({ parentId: projects.parentId, deletedAt: projects.deletedAt })
      .from(projects).where(eq(projects.id, child));
    expect(kid[0]!.parentId).toBeNull();
    expect(kid[0]!.deletedAt).toBeNull();
  });
});

describe('انجماد — عضو قفل، مالک آزاد', () => {
  let pid: number;
  beforeAll(async () => {
    pid = await service.createProject(owner(), projectInput({ title: 'نگه‌داشته', statusTagId: onHold }));
    await db.insert(projectMembers).values({ projectId: pid, userId: ali, roleTagId: devRole, agreedAmount: '0', unitRate: '0' });
  });

  it('عضو روی پروژهٔ نگه‌داشته کامنت نمی‌گذارد', async () => {
    await expect(service.addComment(actor(ali), pid, 'سلام')).rejects.toThrow(FrozenProjectError);
  });

  it('⚠️ مالک می‌تواند — «از نمای کارت مدیریت می‌کند»', async () => {
    await expect(service.addComment(owner(), pid, 'یادداشتِ مدیریت')).resolves.not.toThrow();
  });
});

describe('تیکِ کامنت برای شرکت‌کننده؛ نه بیرونی', () => {
  it('عضوِ پروژه کامنتِ مدیر را «انجام شد» می‌زند؛ بیرونی نه', async () => {
    const pid = await service.createProject(owner(), projectInput({ title: 'کامنتی' }));
    await db.insert(projectMembers).values({ projectId: pid, userId: ali, roleTagId: devRole, agreedAmount: '0', unitRate: '0' });
    await service.addComment(owner(), pid, 'لطفاً بررسی کنید');
    const c = await db.select({ id: comments.id }).from(comments).where(eq(comments.projectId, pid));
    const commentId = c[0]!.id;

    // بیرونی: یا «یافت نشد» (scope) یا «ممنوع» — هر دو رد است.
    await expect(service.toggleCommentStatus(actor(outsider), commentId)).rejects.toThrow();
    await service.toggleCommentStatus(actor(ali), commentId);
    const after = await db.select({ status: comments.status, closedBy: comments.closedBy })
      .from(comments).where(eq(comments.id, commentId));
    expect(after[0]!.status).toBe('done');
    expect(after[0]!.closedBy).toBe(ali);
  });
});

describe('برداشتنِ تسک — همهٔ نقش‌های کاربر، تسک نقشی می‌ماند', () => {
  it('⚠️ دو نقشِ بازِ علی با هم برداشته می‌شوند و assignedTo دست نمی‌خورد', async () => {
    const pid = await service.createProject(owner(), projectInput({ title: 'نقشی' }));
    await db.insert(projectMembers).values([
      { projectId: pid, userId: ali, roleTagId: devRole, agreedAmount: '0', unitRate: '0' },
      { projectId: pid, userId: ali, roleTagId: designRole, agreedAmount: '0', unitRate: '0' },
      { projectId: pid, userId: bob, roleTagId: devRole, agreedAmount: '0', unitRate: '0' },
      { projectId: pid, userId: bob, roleTagId: designRole, agreedAmount: '0', unitRate: '0' },
    ]);
    const taskId = await service.createTask(owner(), pid, {
      title: 'دو نقشه', description: '', statusTagId: null, priorityTagId: null,
      assignedTo: null, dueDate: null, isPrivate: false, roleTagIds: [devRole, designRole],
    }, { silent: true });

    await service.claimTask(actor(ali), taskId);
    const roles = await db.select({ roleTagId: taskRoles.roleTagId, claimedBy: taskRoles.claimedBy })
      .from(taskRoles).where(eq(taskRoles.taskId, taskId));
    expect(roles.every((r) => r.claimedBy === ali)).toBe(true);
    const row = await db.select({ assignedTo: tasks.assignedTo, updatedBy: tasks.updatedBy })
      .from(tasks).where(eq(tasks.id, taskId));
    expect(row[0]!.assignedTo).toBeNull();
    expect(row[0]!.updatedBy).toBe(ali);
  });
});

describe('پس‌گرفتنِ پیشنهاد — فقط برنده', () => {
  it('⚠️ مدیر پیشنهادِ در انتظارِ عضو را پس نمی‌گیرد', async () => {
    const pid = await service.createProject(owner(), projectInput({
      title: 'مناقصهٔ باز', isTender: true, tenderRoles: [{ roleTagId: devRole, cap: '0' }],
    }));
    const b = await db.insert(tenderBids).values({
      projectId: pid, userId: ali, roleTagId: devRole, amount: '100', status: 'pending',
    }).returning({ id: tenderBids.id });
    await expect(service.withdrawBid(owner(), b[0]!.id)).rejects.toThrow(ForbiddenError);
    const still = await db.select({ status: tenderBids.status }).from(tenderBids).where(eq(tenderBids.id, b[0]!.id));
    expect(still[0]!.status).toBe('pending');
  });
});

describe('فهرست — گذشته از ددلاین و مناقصهٔ باز', () => {
  it('⚠️ نگه‌داشته‌شده گذشته از ددلاین نیست، تکمیل‌شده هست؛ مناقصه فقط در lead باز است', async () => {
    const held = await service.createProject(owner(), projectInput({ title: 'دیرِ نگه‌داشته', statusTagId: onHold, deadline: '2020-01-01' }));
    const done = await service.createProject(owner(), projectInput({ title: 'دیرِ تکمیل', statusTagId: completed, deadline: '2020-01-01' }));
    const closedTender = await service.createProject(owner(), projectInput({
      title: 'مناقصهٔ بسته', isTender: true, statusTagId: onHold, tenderRoles: [{ roleTagId: devRole, cap: '0' }],
    }));
    const list = await service.listProjects(owner());
    const by = new Map(list.map((p) => [p.id, p]));
    expect(by.get(held)!.isOverdue).toBe(false);
    expect(by.get(done)!.isOverdue).toBe(true);
    expect(by.get(closedTender)!.tenderOpen).toBe(false);
    expect(by.get(closedTender)!.isTender).toBe(true);
    // تازه‌ترین اول
    expect(list[0]!.id).toBe(closedTender);
  });
});

describe('همکارِ فقط‌خواندنی', () => {
  it('⚠️ با projects.view تنها، وضعیتِ تسک را عوض نمی‌کند و یادداشت نمی‌نویسد', async () => {
    const pid = await service.createProject(owner(), projectInput({ title: 'خواندنی' }));
    const taskId = await service.createTask(owner(), pid, {
      title: 'کار', description: '', statusTagId: null, priorityTagId: null,
      assignedTo: null, dueDate: null, isPrivate: false, roleTagIds: [],
    }, { silent: true });
    const viewer = actor(staffId, { roles: ['admin'], permissions: ['projects.view'] as Permission[] });
    await expect(service.setTaskStatus(viewer, taskId, doing)).rejects.toThrow(ForbiddenError);
    await expect(service.addTaskNote(viewer, taskId, 'یادداشت')).rejects.toThrow(ForbiddenError);
    expect((await service.getTaskDetail(viewer, taskId)).canInteract).toBe(false);
  });
});

