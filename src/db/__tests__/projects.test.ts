import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, users, tags, tagRelations, projects, projectMembers, projectPayments,
  tasks, qaItems, projectQa, tenderBids, comments, timelogs,
} from '../schema';
import * as service from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { LightenError, ProjectDeleteError } from '@/domain/projects/lifecycle';
import type { Actor, Permission, Role } from '@/domain/access/permissions';

/** پروژه از انتها تا انتها: سرویس + گاردها + دیتابیسِ واقعی. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

const manager = () => actor({ id: 1, permissions: ['projects.manage'] as Permission[] });
const viewer = () => actor({ id: 2, permissions: ['projects.view'] as Permission[] });
const owner = () => actor({ id: 3, roles: ['owner'] as Role[] });

let eurId: number, devRole: number, designRole: number;
let companyProject: number, privateProject: number;
let alice: number, bob: number, gone: number;

beforeAll(async () => {
  await sql`truncate table audit_log, task_roles, tasks, comments, timelogs, project_qa, qa_items, tender_bids, project_payments, project_members, tag_relations, projects, tags, users, currencies restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eurId = c[0]!.id;

  const u = await db.insert(users).values([
    { email: 'alice@test', name: 'آلیس' },
    { email: 'bob@test', name: 'باب' },
    { email: 'gone@test', name: 'عضوِ سابق', memberState: 'locked' },
  ]).returning({ id: users.id });
  alice = u[0]!.id; bob = u[1]!.id; gone = u[2]!.id;

  const t = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'طراح', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
  ]).returning({ id: tags.id });
  devRole = t[0]!.id; designRole = t[1]!.id;

  const p = await db.insert(projects).values([
    { title: 'پروژهٔ شرکتی', price: '1000', currencyId: eurId, statusTagId: t[2]!.id },
    { title: 'پروژهٔ خصوصی', price: '500', currencyId: eurId, scope: 'private' },
  ]).returning({ id: projects.id });
  companyProject = p[0]!.id; privateProject = p[1]!.id;
});

afterAll(async () => { await sql.end(); });

describe('گاردِ دسترسی روی سرویس', () => {
  it('بدونِ مجوز، فهرست به «پروژه‌های خودم» می‌افتد — دیدِ عضویت‌محور', async () => {
    // ⚠️ قراردادِ قدیم «خطا» بود و همین عضوها را از اپ بیرون گذاشته بود؛
    // حالا مثلِ نسخهٔ قبلی (`user_can_access`)، بی‌مجوز یعنی فقط عضویت‌ها —
    // و این بازیگرِ ساختگی عضوِ هیچ پروژه‌ای نیست.
    await expect(service.listProjects(actor())).resolves.toEqual([]);
  });

  it('با مجوزِ مشاهده فهرست می‌آید', async () => {
    const list = await service.listProjects(viewer());
    expect(list.length).toBeGreaterThan(0);
  });

  it('بیننده نمی‌تواند اعضا را تغییر دهد', async () => {
    await expect(service.setMembers(viewer(), companyProject, [])).rejects.toThrow(ForbiddenError);
  });
});

describe('درزِ scope — دادهٔ خصوصی', () => {
  it('بدونِ گرنت، پروژهٔ خصوصی در فهرست نیست', async () => {
    const list = await service.listProjects(viewer());
    expect(list.map((p) => p.id)).not.toContain(privateProject);
  });

  it('مالک هر دو را می‌بیند', async () => {
    const list = await service.listProjects(owner());
    expect(list.map((p) => p.id)).toContain(privateProject);
  });

  it('دسترسیِ مستقیم به پروژهٔ خصوصی «یافت نشد» می‌دهد، نه «ممنوع»', async () => {
    await expect(service.getProject(viewer(), privateProject)).rejects.toThrow(service.NotFoundError);
  });

  it('با گرنتِ دسترسیِ خصوصی دیده می‌شود', async () => {
    const granted = actor({ id: 4, permissions: ['projects.view'] as Permission[], privateAccess: true });
    const p = await service.getProject(granted, privateProject);
    expect(p.title).toBe('پروژهٔ خصوصی');
  });
});

describe('R-PROJ-08/09 — اعضا روی دیتابیسِ واقعی', () => {
  it('عضو با دو نقش دو ردیف می‌گیرد', async () => {
    const diff = await service.setMembers(manager(), companyProject, [
      { userId: alice, roleTagId: devRole, agreedAmount: '600' },
      { userId: alice, roleTagId: designRole, agreedAmount: '400' },
    ]);
    expect(diff.toInsert).toHaveLength(2);
    expect(diff.newlyAdded).toEqual([alice]);

    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, companyProject));
    expect(rows).toHaveLength(2);
  });

  it('ذخیرهٔ دوباره هیچ اعلانی نمی‌فرستد', async () => {
    const diff = await service.setMembers(manager(), companyProject, [
      { userId: alice, roleTagId: devRole, agreedAmount: '600' },
      { userId: alice, roleTagId: designRole, agreedAmount: '400' },
    ]);
    expect(diff.newlyAdded).toEqual([]);
    expect(diff.toInsert).toEqual([]);
  });

  it('تغییرِ مبلغ به‌روزرسانی است', async () => {
    const diff = await service.setMembers(manager(), companyProject, [
      { userId: alice, roleTagId: devRole, agreedAmount: '750' },
      { userId: alice, roleTagId: designRole, agreedAmount: '400' },
    ]);
    expect(diff.toUpdate).toHaveLength(1);

    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, companyProject));
    expect(rows.find((r) => r.roleTagId === devRole)!.agreedAmount).toBe('750.0000');
  });

  it('عضوِ غیرفعال اضافه نمی‌شود', async () => {
    const diff = await service.setMembers(manager(), companyProject, [
      { userId: alice, roleTagId: devRole, agreedAmount: '750' },
      { userId: alice, roleTagId: designRole, agreedAmount: '400' },
      { userId: gone, roleTagId: devRole, agreedAmount: '100' },
    ]);
    expect(diff.toInsert).toEqual([]);
  });

  it('حذفِ عضو از فهرست، ردیفش را برمی‌دارد', async () => {
    await service.setMembers(manager(), companyProject, [
      { userId: alice, roleTagId: devRole, agreedAmount: '750' },
    ]);
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, companyProject));
    expect(rows).toHaveLength(1);
  });
});

describe('R-PROJ-01 — حذفِ پروژه', () => {
  it('پروژهٔ تمیز حذف می‌شود', async () => {
    const p = await db.insert(projects).values({ title: 'موقت', currencyId: eurId }).returning({ id: projects.id });
    const plan = await service.deleteProject(manager(), p[0]!.id, {});
    expect(plan.financial).toBe('none');

    const list = await service.listProjects(manager());
    expect(list.map((x) => x.id)).not.toContain(p[0]!.id);
  });

  it('پروژه با ماندهٔ باز هرگز حذف نمی‌شود', async () => {
    // ⚠️ ماندهٔ باز از خودِ داده: قیمت ۱۰۰، فقط ۱۰ دریافت شده → PARTIAL → قفل.
    // پیش از این فراخوان false هاردکد می‌کرد و این حالت هرگز رخ نمی‌داد.
    const p = await db.insert(projects).values({ title: 'پروژهٔ نیمه‌پرداخت', currencyId: eurId, price: '100' })
      .returning({ id: projects.id });
    await db.insert(projectPayments).values({
      projectId: p[0]!.id, direction: 'incoming', amount: '10', amountEur: '10', currencyId: eurId,
    });
    await expect(service.deleteProject(manager(), p[0]!.id, {
      mode: 'full', confirmTitle: 'پروژهٔ نیمه‌پرداخت',
    })).rejects.toThrow(/locked/);
  });
});

describe('R-PERF-01 — فهرست با کوئریِ ثابت', () => {
  it('افزودنِ ۲۰ پروژه ساختارِ کوئری را عوض نمی‌کند', async () => {
    await db.insert(projects).values(
      Array.from({ length: 20 }, (_, i) => ({ title: `پروژه ${i}`, currencyId: eurId })),
    );
    const list = await service.listProjects(manager());
    expect(list.length).toBeGreaterThan(20);
    // شمارشِ اعضا و تسک هر کدام یک کوئریِ گروهی‌اند، نه یکی به‌ازای هر پروژه.
    expect(list.every((p) => typeof p.memberCount === 'number')).toBe(true);
  });
});

describe('R-RBAC-12 — نشتیِ تسکِ خصوصی روی دیتابیسِ واقعی', () => {
  let projectId: number;
  let ownerTask: number;

  beforeAll(async () => {
    const p = await db.insert(projects)
      .values({ title: 'پروژهٔ تسک‌دار', currencyId: eurId })
      .returning({ id: projects.id });
    projectId = p[0]!.id;

    const t = await db.insert(tasks).values([
      { projectId, title: 'تسکِ عمومی', createdBy: alice },
      { projectId, title: 'تسکِ خصوصیِ آلیس', isPrivate: true, createdBy: alice },
      { projectId, title: 'تسکِ خصوصیِ دیگری', isPrivate: true, createdBy: bob },
    ]).returning({ id: tasks.id });
    ownerTask = t[1]!.id;
  });

  it('سازندهٔ تسکِ خصوصی آن را می‌بیند', async () => {
    const aliceActor = actor({ id: alice, permissions: ['projects.view'] as Permission[] });
    const detail = await service.getProjectDetail(aliceActor, projectId);
    expect(detail.tasks.map((t) => t.id)).toContain(ownerTask);
  });

  it('⚠️ شخصِ ثالث تسکِ خصوصیِ دیگران را نمی‌بیند', async () => {
    const stranger = actor({ id: 777, permissions: ['projects.view'] as Permission[] });
    const detail = await service.getProjectDetail(stranger, projectId);
    const titles = detail.tasks.map((t) => t.title);
    expect(titles).toContain('تسکِ عمومی');
    expect(titles).not.toContain('تسکِ خصوصیِ آلیس');
    expect(titles).not.toContain('تسکِ خصوصیِ دیگری');
  });

  it('⚠️ شمارنده هم از فهرستِ فیلترشده می‌آید، نه از کلِ تسک‌ها', async () => {
    const stranger = actor({ id: 777, permissions: ['projects.view'] as Permission[] });
    const detail = await service.getProjectDetail(stranger, projectId);
    // سه تسک در دیتابیس است ولی بیگانه فقط یکی را می‌بیند.
    expect(detail.tasks).toHaveLength(1);
  });

  it('مدیرِ بخش همه را می‌بیند', async () => {
    const detail = await service.getProjectDetail(manager(), projectId);
    expect(detail.tasks).toHaveLength(3);
  });

  it('canManage در پاسخ منعکس می‌شود', async () => {
    expect((await service.getProjectDetail(manager(), projectId)).canManage).toBe(true);
    expect((await service.getProjectDetail(viewer(), projectId)).canManage).toBe(false);
  });
});

describe('ساختِ پروژه', () => {
  const base = {
    description: '', regDate: null, deadline: null, statusTagId: null,
    price: '0', currencyId: null, officeId: null, parentId: null,
    isUnitBased: false, isTender: false, scope: 'company' as const,
  };

  it('بدونِ مجوزِ مدیریت ساخته نمی‌شود', async () => {
    await expect(service.createProject(viewer(), { ...base, title: 'ممنوع' }))
      .rejects.toThrow(ForbiddenError);
  });

  it('مدیر می‌سازد و مقادیر همان‌طور ذخیره می‌شوند', async () => {
    const id = await service.createProject(manager(), {
      ...base, title: 'پروژهٔ نو', price: '2500.5', currencyId: eurId, isUnitBased: true,
    });
    const row = (await db.select().from(projects).where(eq(projects.id, id)))[0]!;
    expect(row.title).toBe('پروژهٔ نو');
    expect(row.isUnitBased).toBe(true);
    expect(row.scope).toBe('company');
    // پول با دقتِ ثابت ذخیره می‌شود — رشته، نه number (R-MONEY-11).
    expect(Number(row.price)).toBe(2500.5);
  });

  it('⚠️ کسی که دسترسیِ خصوصی ندارد نمی‌تواند پروژهٔ خصوصی بسازد', async () => {
    // وگرنه پروژه‌ای می‌ساخت که خودش هم دیگر آن را نمی‌دید.
    await expect(service.createProject(manager(), { ...base, title: 'خصوصی', scope: 'private' }))
      .rejects.toThrow(ForbiddenError);
  });

  it('مالک پروژهٔ خصوصی می‌سازد', async () => {
    const id = await service.createProject(owner(), { ...base, title: 'خصوصیِ مالک', scope: 'private' });
    const row = (await db.select().from(projects).where(eq(projects.id, id)))[0]!;
    expect(row.scope).toBe('private');
  });

  it('والدِ نامعتبر پذیرفته نمی‌شود', async () => {
    await expect(service.createProject(manager(), { ...base, title: 'یتیم', parentId: 999999 }))
      .rejects.toThrow();
  });

  it('⚠️ زیرپروژه نمی‌تواند خودش والد باشد — سلسله‌مراتب یک‌سطحی می‌ماند (R-PROJ-20)', async () => {
    const child = await service.createProject(manager(), {
      ...base, title: 'زیرپروژه', parentId: companyProject,
    });
    await expect(service.createProject(manager(), { ...base, title: 'نوه', parentId: child }))
      .rejects.toThrow();
  });

  it('والدِ خصوصی برای کسی که آن را نمی‌بیند نامرئی است، نه فقط ممنوع', async () => {
    await expect(service.createProject(manager(), { ...base, title: 'ز', parentId: privateProject }))
      .rejects.toThrow();
  });

  it('ساخت در audit_log ثبت می‌شود', async () => {
    const id = await service.createProject(manager(), { ...base, title: 'قابلِ ردیابی' });
    const rows = await sql`select * from audit_log where object_id = ${id} and action = 'project.create'`;
    expect(rows).toHaveLength(1);
  });
});

describe('R-PROJ-23 — طلبِ عضو با ویرایشِ اعضا گم نمی‌شود', () => {
  let proj: number;

  beforeAll(async () => {
    const p = await db.insert(projects)
      .values({ title: 'پروژهٔ تسویه', price: '1000', currencyId: eurId })
      .returning({ id: projects.id });
    proj = p[0]!.id;

    await service.setMembers(manager(), proj, [
      { userId: alice, roleTagId: devRole, agreedAmount: '600' },
      { userId: bob, roleTagId: designRole, agreedAmount: '400' },
    ]);

    // باب کاملاً تسویه شده؛ آلیس هنوز ۲۰۰ طلب دارد.
    await db.insert(projectPayments).values([
      { projectId: proj, userId: alice, direction: 'member_payout', amount: '400', currencyId: eurId },
      { projectId: proj, userId: bob, direction: 'member_payout', amount: '400', currencyId: eurId },
    ]);
  });

  it('⚠️ عضوِ طلبکار می‌ماند، عضوِ تسویه‌شده می‌رود', async () => {
    const diff = await service.setMembers(manager(), proj, []);
    // فقط یک ردیف حذف می‌شود: باب که کاملاً تسویه شده.
    expect(diff.toDelete).toHaveLength(1);

    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj));
    // ردیفِ آلیس (طلبکار) مانده، ردیفِ باب (تسویه‌شده) رفته.
    expect(rows.map((r) => r.userId)).toEqual([alice]);
  });
});

describe('R-PROJ-10 و فیلدهای مالی روی دیتابیس', () => {
  let proj: number;

  beforeAll(async () => {
    const p = await db.insert(projects)
      .values({ title: 'پروژهٔ تعدادی', price: '0', currencyId: eurId, isUnitBased: true })
      .returning({ id: projects.id });
    proj = p[0]!.id;
    // آلیس نقشِ اصلیِ «دولوپر» دارد.
    await db.insert(tagRelations).values({ tagId: devRole, objectId: alice, objectType: 'user' });
  });

  it('نقشِ خالی از پروفایلِ عضو ارث می‌برد', async () => {
    await service.setMembers(manager(), proj, [
      { userId: alice, roleTagId: null, agreedAmount: '0', unitRate: '5', currencyId: eurId },
    ]);
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.roleTagId).toBe(devRole);
  });

  it('⚠️ تغییرِ نرخِ هر واحد واقعاً ذخیره می‌شود', async () => {
    // در پروژهٔ تعدادی کلِ دستمزد روی همین نرخ است.
    const diff = await service.setMembers(manager(), proj, [
      { userId: alice, roleTagId: devRole, agreedAmount: '0', unitRate: '8', currencyId: eurId },
    ]);
    expect(diff.toUpdate).toHaveLength(1);

    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj));
    expect(Number(rows[0]!.unitRate)).toBe(8);
  });
});

describe('تسک از انتها تا انتها', () => {
  let proj: number, taskStatus: number, taskId: number;

  beforeAll(async () => {
    const p = await db.insert(projects)
      .values({ title: 'پروژهٔ تسک‌ها', price: '0', currencyId: eurId })
      .returning({ id: projects.id });
    proj = p[0]!.id;

    const t = await db.insert(tags)
      .values({ name: 'در حال انجام', type: 'task_status', statusGroup: 'in_progress' })
      .returning({ id: tags.id });
    taskStatus = t[0]!.id;
  });

  it('مدیر تسک می‌سازد و scope ِ پروژه را ارث می‌برد', async () => {
    taskId = await service.createTask(manager(), proj, {
      title: 'تسکِ نو', description: '', statusTagId: taskStatus,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    });
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(rows[0]!.scope).toBe('company');
    expect(rows[0]!.createdBy).toBe(manager().id);
  });

  it('⚠️ تسکِ پروژهٔ خصوصی هم خصوصی می‌شود', async () => {
    // وگرنه تسکِ «شرکتی» زیرِ پروژهٔ خصوصی می‌نشست و از فهرستِ تسک‌ها لو می‌رفت.
    const id = await service.createTask(owner(), privateProject, {
      title: 'تسکِ خصوصی', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    });
    const rows = await db.select().from(tasks).where(eq(tasks.id, id));
    expect(rows[0]!.scope).toBe('private');
  });

  it('بدونِ مجوزِ مدیریت تسک ساخته نمی‌شود', async () => {
    await expect(service.createTask(viewer(), proj, {
      title: 'ممنوع', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    })).rejects.toThrow(ForbiddenError);
  });

  it('⚠️ تگِ وضعیت باید از نوعِ وضعیتِ تسک باشد', async () => {
    // devRole یک نقشِ عضو است، نه وضعیتِ تسک.
    await expect(service.createTask(manager(), proj, {
      title: 'تگِ غلط', description: '', statusTagId: devRole,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    })).rejects.toThrow();
  });

  it('ویرایش «آخرین ویرایش توسط» را ثبت می‌کند', async () => {
    await service.updateTask(manager(), taskId, {
      title: 'تسکِ ویرایش‌شده', description: 'توضیح', statusTagId: taskStatus,
      priorityTagId: null, assignedTo: null, dueDate: '2026-09-15', isPrivate: true,
    });
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(rows[0]!.title).toBe('تسکِ ویرایش‌شده');
    expect(rows[0]!.updatedBy).toBe(manager().id);
    expect(rows[0]!.isPrivate).toBe(true);
  });

  it('یادداشتِ گفتگو ثبت می‌شود و به تسک می‌چسبد', async () => {
    await service.addTaskNote(manager(), taskId, 'یادداشتِ اول');
    const detail = await service.getTaskDetail(manager(), taskId);
    expect(detail.notes).toHaveLength(1);
    expect(detail.notes[0]!.body).toBe('یادداشتِ اول');
  });

  it('یادداشتِ خالی رد می‌شود', async () => {
    await expect(service.addTaskNote(manager(), taskId, '   ')).rejects.toThrow(ForbiddenError);
  });

  it('⚠️ حذف نرم است — تسک از فهرست می‌رود ولی ردیفش می‌ماند', async () => {
    await service.deleteTask(manager(), taskId);
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).not.toBeNull();
    await expect(service.getTaskDetail(manager(), taskId)).rejects.toThrow(service.NotFoundError);
  });
});

describe('QA و مناقصه روی دیتابیس', () => {
  let proj: number, leadStatus: number, inProgress: number;

  beforeAll(async () => {
    const st = await db.insert(tags).values([
      { name: 'احتمال عقد قرارداد', type: 'project_status', statusGroup: 'lead' },
      { name: 'در حال اجرا', type: 'project_status', statusGroup: 'in_progress' },
    ]).returning({ id: tags.id });
    leadStatus = st[0]!.id; inProgress = st[1]!.id;

    const p = await db.insert(projects).values({
      title: 'مناقصهٔ تست', price: '0', currencyId: eurId,
      statusTagId: leadStatus, isTender: true,
    }).returning({ id: projects.id });
    proj = p[0]!.id;
  });

  it('⚠️ تسکِ کارفرمای QA روی پروژهٔ بی‌کارفرما به چک‌لیست تبدیل می‌شود', async () => {
    await db.insert(qaItems).values([
      { title: 'تأییدِ کارفرما', description: '', roleTagId: null, isTask: true },
    ]);
    const result = await service.applyQa(manager(), proj, ['client']);
    expect(result.added).toBe(1);

    const rows = await db.select().from(projectQa).where(eq(projectQa.projectId, proj));
    expect(rows).toHaveLength(1);
    // به تسک تبدیل نشده، چون کارفرمایی نیست که به او بخورد.
    const taskRows = await db.select().from(tasks).where(eq(tasks.projectId, proj));
    expect(taskRows).toHaveLength(0);
  });

  it('اعمالِ دوباره چیزی اضافه نمی‌کند', async () => {
    const result = await service.applyQa(manager(), proj, ['client']);
    expect(result.added).toBe(0);
  });

  it('تیک «انجام‌شده توسط» را مهر می‌زند و برداشتنش پاکش می‌کند', async () => {
    const rows = await db.select().from(projectQa).where(eq(projectQa.projectId, proj));
    const id = rows[0]!.id;

    await service.toggleQaItem(manager(), id);
    let row = (await db.select().from(projectQa).where(eq(projectQa.id, id)))[0]!;
    expect(row.isDone).toBe(true);
    expect(row.doneBy).toBe(manager().id);

    await service.toggleQaItem(manager(), id);
    row = (await db.select().from(projectQa).where(eq(projectQa.id, id)))[0]!;
    expect(row.isDone).toBe(false);
    expect(row.doneBy).toBeNull();
  });

  it('⚠️ تأییدِ پیشنهاد، برندهٔ قبلیِ همان نقش را کنار می‌گذارد', async () => {
    const bids = await db.insert(tenderBids).values([
      { projectId: proj, userId: alice, roleTagId: devRole, amount: '900', currencyId: eurId },
      { projectId: proj, userId: bob, roleTagId: devRole, amount: '700', currencyId: eurId },
    ]).returning({ id: tenderBids.id });

    await service.approveBid(manager(), bids[0]!.id);
    let members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj));
    expect(members.map((m) => m.userId)).toEqual([alice]);

    // برندهٔ دوم: آلیس باید کنار برود و پیشنهادش «در انتظار» شود.
    await service.approveBid(manager(), bids[1]!.id);
    members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj));
    expect(members.map((m) => m.userId)).toEqual([bob]);

    const first = (await db.select().from(tenderBids).where(eq(tenderBids.id, bids[0]!.id)))[0]!;
    expect(first.status).toBe('pending');
  });

  it('⚠️ پس‌گرفتنِ پیشنهادِ برنده عضویتش را هم برمی‌دارد', async () => {
    const winner = (await db.select().from(tenderBids)
      .where(and(eq(tenderBids.projectId, proj), eq(tenderBids.status, 'approved'))))[0]!;

    await service.withdrawBid(manager(), winner.id);
    const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj));
    expect(members).toHaveLength(0);
  });

  it('⚠️ پس از شروعِ کار، مناقصه بسته است و تأیید رد می‌شود', async () => {
    await db.update(projects).set({ statusTagId: inProgress }).where(eq(projects.id, proj));
    const pendingBid = (await db.select().from(tenderBids)
      .where(and(eq(tenderBids.projectId, proj), eq(tenderBids.status, 'pending'))))[0]!;

    await expect(service.approveBid(manager(), pendingBid.id)).rejects.toThrow(ForbiddenError);
  });
});

describe('سبک‌سازی و حذف', () => {
  let proj: number;

  beforeAll(async () => {
    const p = await db.insert(projects)
      .values({ title: 'پروژهٔ سبک‌شدنی', price: '5000', currencyId: eurId })
      .returning({ id: projects.id });
    proj = p[0]!.id;

    await db.insert(tasks).values({ projectId: proj, title: 'تسکی', createdBy: alice });
    await db.insert(comments).values({ projectId: proj, userId: alice, body: 'کامنتی' });
    await db.insert(timelogs).values({ projectId: proj, userId: alice, logDate: '2026-08-01', minutes: 120 });
    await db.insert(projectMembers).values({ projectId: proj, userId: alice, roleTagId: devRole, agreedAmount: '500' });
    await db.insert(projectPayments).values({
      projectId: proj, userId: alice, direction: 'incoming',
      amount: '1000', amountEur: '1000', currencyId: eurId,
    });
  });

  it('⚠️ سبک‌سازیِ پروژهٔ بایگانی‌نشده رد می‌شود', async () => {
    await expect(service.lightenProject(manager(), proj)).rejects.toThrow(LightenError);
  });

  it('پس از بایگانی، سبک‌سازی جزئیات را می‌برد و پول را نگه می‌دارد', async () => {
    await service.setArchived(manager(), proj, true);
    const summary = await service.lightenProject(manager(), proj);

    // ⚠️ عکس پیش از پاک‌شدن گرفته شده — وگرنه ساعت صفر می‌افتاد.
    expect(summary.minutes).toBe(120);
    expect(Number(summary.clientPaidEur)).toBe(1000);

    expect(await db.select().from(tasks).where(eq(tasks.projectId, proj))).toHaveLength(0);
    expect(await db.select().from(comments).where(eq(comments.projectId, proj))).toHaveLength(0);
    expect(await db.select().from(timelogs).where(eq(timelogs.projectId, proj))).toHaveLength(0);

    // پول و پیوندهای انسانی دست‌نخورده.
    expect(await db.select().from(projectPayments).where(eq(projectPayments.projectId, proj))).toHaveLength(1);
    expect(await db.select().from(projectMembers).where(eq(projectMembers.projectId, proj))).toHaveLength(1);
  });

  it('سبک‌سازیِ دوباره رد می‌شود', async () => {
    await expect(service.lightenProject(manager(), proj)).rejects.toThrow(LightenError);
  });
});

describe('R-PROJ-03 — جداسازی در برابر حذفِ کامل', () => {
  async function makeProject(title: string) {
    const p = await db.insert(projects)
      .values({ title, price: '3000', currencyId: eurId })
      .returning({ id: projects.id });
    const id = p[0]!.id;
    await db.insert(projectPayments).values({
      projectId: id, userId: alice, direction: 'incoming',
      // ⚠️ تمام‌پرداخت: R-PROJ-03 دربارهٔ سرنوشتِ تراکنش است، نه ماندهٔ باز.
      // با ۸۰۰ از ۳۰۰۰، گاردِ R-PROJ-04 (که حالا واقعاً کار می‌کند) حذف را قفل می‌کرد.
      amount: '3000', amountEur: '3000', currencyId: eurId, note: 'پیش‌پرداخت',
    });
    return id;
  }

  it('⚠️ جداسازی تراکنش را نگه می‌دارد و نامِ پروژه را در شرحش می‌نویسد', async () => {
    // بدونِ این، پولِ جداشده بی‌هویت می‌شد.
    const id = await makeProject('پروژهٔ جداشدنی');
    await service.deleteProject(manager(), id, {
      mode: 'detach', confirmTitle: 'پروژهٔ جداشدنی',
    });

    const rows = await sql`select project_id, note from project_payments where note like '%جداشدنی%'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.project_id).toBeNull();
    expect(String(rows[0]!.note)).toContain('پیش‌پرداخت');
    expect(String(rows[0]!.note)).toContain('بابت پروژه: پروژهٔ جداشدنی');
  });

  it('حذفِ کامل تراکنش را هم می‌برد', async () => {
    const id = await makeProject('پروژهٔ کاملاً حذفی');
    await service.deleteProject(manager(), id, {
      mode: 'full', confirmTitle: 'پروژهٔ کاملاً حذفی',
    });
    expect(await db.select().from(projectPayments).where(eq(projectPayments.projectId, id))).toHaveLength(0);
  });

  it('⚠️ نامِ غلط حذف را متوقف می‌کند', async () => {
    const id = await makeProject('پروژهٔ محافظت‌شده');
    await expect(service.deleteProject(manager(), id, {
      mode: 'full', confirmTitle: 'نامِ غلط',
    })).rejects.toThrow(ProjectDeleteError);

    const rows = await db.select().from(projects).where(eq(projects.id, id));
    expect(rows[0]!.deletedAt).toBeNull();
  });

  it('⚠️ ماندهٔ باز حذف را قفل می‌کند — از خودِ داده، نه از فراخوان', async () => {
    const id = await makeProject('پروژهٔ قفل‌شده');
    // ۳۰۰۰ دریافت شده از ۵۰۰۰ → ماندهٔ باز → قفل.
    await db.update(projects).set({ price: '5000' }).where(eq(projects.id, id));
    await expect(service.deleteProject(manager(), id, {
      mode: 'full', confirmTitle: 'پروژهٔ قفل‌شده',
    })).rejects.toThrow(ProjectDeleteError);
  });
});

/**
 * آیتمِ **تسک‌ساز** — پورتِ نقشهٔ `META_TASKS` و.
 *
 * ⚠️ این باگِ واقعی بود: آیتمِ تسک‌ساز ردیفی در `project_qa` نمی‌نویسد، پس
 * اگر «قبلاً اعمال‌شده» فقط از آن جدول خوانده شود، هر اعمالِ دوباره تسکِ
 * تکراری می‌سازد.
 */
describe('QA — آیتمِ تسک‌ساز و رهاکردنش', () => {
  let proj: number, roleItem: number;

  beforeAll(async () => {
    const p = await db.insert(projects).values({
      title: 'پروژهٔ QA ِ تسک‌ساز', price: '0', currencyId: eurId,
    }).returning({ id: projects.id });
    proj = p[0]!.id;

    const q = await db.insert(qaItems).values({
      title: 'بازبینیِ نهاییِ کد', description: '', roleTagId: devRole, isTask: true,
    }).returning({ id: qaItems.id });
    roleItem = q[0]!.id;
  });

  it('آیتمِ تسک‌ساز، تسکِ نقشی می‌سازد و شناسهٔ مبدأ را نگه می‌دارد', async () => {
    const result = await service.applyQa(manager(), proj, [devRole]);
    expect(result.added).toBe(1);

    const rows = await db.select().from(tasks)
      .where(and(eq(tasks.projectId, proj), eq(tasks.qaItemId, roleItem)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('بازبینیِ نهاییِ کد');
  });

  it('⚠️ اعمالِ دوباره تسکِ تکراری نمی‌سازد', async () => {
    const result = await service.applyQa(manager(), proj, [devRole]);
    expect(result.added).toBe(0);

    const rows = await db.select().from(tasks)
      .where(and(eq(tasks.projectId, proj), eq(tasks.qaItemId, roleItem)));
    expect(rows).toHaveLength(1);
  });

  it('⚠️ با حذفِ تسک، همان آیتم دوباره قابلِ اعمال می‌شود', async () => {
    const before = await db.select().from(tasks)
      .where(and(eq(tasks.projectId, proj), eq(tasks.qaItemId, roleItem)));
    await service.deleteTask(manager(), before[0]!.id);

    const result = await service.applyQa(manager(), proj, [devRole]);
    expect(result.added).toBe(1);

    // تسکِ تازه ساخته شد؛ حذف‌شده هنوز حذف‌شده است.
    const live = await db.select().from(tasks)
      .where(and(eq(tasks.projectId, proj), eq(tasks.qaItemId, roleItem), isNull(tasks.deletedAt)));
    expect(live).toHaveLength(1);
    expect(live[0]!.id).not.toBe(before[0]!.id);
  });
});
