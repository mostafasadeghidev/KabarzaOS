import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  comments, currencies, offices, projectMembers, projects, tags, taskRoles, tasks, timelogs,
  userOffices, userRoles, users,
} from '../schema';
import {
  taskFilterOptions, teamComments, teamMemberProjects, teamMembers, teamOverview, teamProjects, teamTasks,
} from '@/server/team/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * بردهای «تیمِ من» — پورتِ `team_overview_cards`، `render_projects_board`،
 * `render_task_board`، `view_team_comments` و `view_team_member_projects`.
 */

const MGR = 1, M1 = 2, M2 = 3, CL = 4, OUT = 5;
const manager = (): Actor => ({ id: MGR, roles: ['member'], permissions: [], privateAccess: false });
let PA1 = 0, PA2 = 0, PB = 0;
let designer = 0, todo = 0, review = 0, high = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, absences, comments, timelogs, task_roles, tasks, project_members, projects,
    tag_relations, tags, user_offices, offices, user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([
    { email: 'mgr@t', name: 'مدیر' }, { email: 'm1@t', name: 'سارا' }, { email: 'm2@t', name: 'بابک' },
    { email: 'cl@t', name: 'کارفرما' }, { email: 'out@t', name: 'بیرونی' },
  ]);
  await db.insert(userRoles).values([
    { userId: MGR, role: 'member' }, { userId: M1, role: 'member' }, { userId: M2, role: 'member' },
    { userId: CL, role: 'client' }, { userId: OUT, role: 'member' },
  ]);
  const o = await db.insert(offices).values([{ name: 'تهران' }, { name: 'شیراز' }]).returning({ id: offices.id });
  const [A, B] = [o[0]!.id, o[1]!.id];
  await db.insert(userOffices).values([
    { userId: MGR, officeId: A, manages: true },
    { userId: M1, officeId: A },
    // کارفرمای وصل به دفتر «کارمند» نیست.
    { userId: CL, officeId: A },
    { userId: M2, officeId: B },
    { userId: OUT, officeId: B },
  ]);
  const tg = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'طراح', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'نگه‌داشته', type: 'project_status', statusGroup: 'on_hold' },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'todo', sortOrder: 1 },
    { name: 'ریویو', type: 'task_status', statusGroup: 'in_progress', isReview: true, sortOrder: 2 },
    { name: 'انجام شد', type: 'task_status', statusGroup: 'complete', isClosed: true, sortOrder: 3 },
    { name: 'فوری', type: 'task_priority', color: '#e11' },
  ]).returning({ id: tags.id });
  const [dev, des, inp, hold, td, rv, done, hi] = tg.map((r) => r.id) as number[];
  designer = des!; todo = td!; review = rv!; high = hi!;

  const p = await db.insert(projects).values([
    { title: 'الف۱', price: '0', statusTagId: inp, officeId: A, regDate: '2026-01-01' },
    { title: 'الف۲', price: '0', statusTagId: hold, officeId: A },
    { title: 'ب', price: '0', statusTagId: inp, officeId: B },
  ]).returning({ id: projects.id });
  [PA1, PA2, PB] = [p[0]!.id, p[1]!.id, p[2]!.id];

  await db.insert(projectMembers).values([
    { projectId: PA1, userId: M1, roleTagId: dev, agreedAmount: '0' },
    { projectId: PA2, userId: M1, roleTagId: dev, agreedAmount: '0' },
    { projectId: PB, userId: M1, roleTagId: dev, agreedAmount: '0' },
  ]);

  const t = await db.insert(tasks).values([
    { projectId: PA1, title: 'باز-سارا', statusTagId: td, assignedTo: M1, priorityTagId: hi, createdBy: MGR },
    { projectId: PA1, title: 'ریویو-سارا', statusTagId: rv, assignedTo: M1, createdBy: MGR },
    { projectId: PA1, title: 'بسته', statusTagId: done, assignedTo: M1, createdBy: MGR },
    { projectId: PA1, title: 'نقشی', statusTagId: td, createdBy: MGR },
    { projectId: PA1, title: 'باز-بابک', statusTagId: td, assignedTo: M2, createdBy: MGR },
    { projectId: PB, title: 'بیرون', statusTagId: td, assignedTo: M1, createdBy: MGR },
  ]).returning({ id: tasks.id });
  await db.insert(taskRoles).values({ taskId: t[3]!.id, roleTagId: des! });

  const today = new Date().toISOString().slice(0, 10);
  await db.insert(timelogs).values([
    { projectId: PA1, userId: M1, logDate: today, minutes: 60 },
    // بابک از دفترِ دیگر روی پروژهٔ این دفتر کار کرده — در جدولِ ساعت، نه در کارت‌ها.
    { projectId: PA1, userId: M2, logDate: today, minutes: 30 },
    // ساعت روی پروژهٔ دفترِ دیگر شمرده نمی‌شود.
    { projectId: PB, userId: M1, logDate: today, minutes: 500 },
  ]);

  // رشتهٔ ۱: باز، با پاسخِ باز — یک رشته، نه دو ردیف.
  const [r1] = await db.insert(comments).values({ projectId: PA1, userId: M1, type: 'comment', status: 'needs_review', body: 'سؤالِ اول' }).returning({ id: comments.id });
  await db.insert(comments).values({ projectId: PA1, userId: M2, parentId: r1!.id, type: 'comment', status: 'needs_review', body: 'پاسخِ تازه' });
  // رشتهٔ ۲: بسته شده — نمی‌آید.
  const [r2] = await db.insert(comments).values({ projectId: PA1, userId: M1, type: 'comment', status: 'needs_review', body: 'قدیمی' }).returning({ id: comments.id });
  await db.insert(comments).values({ projectId: PA1, userId: MGR, parentId: r2!.id, type: 'comment', status: 'done', body: 'حل شد' });
  // رشتهٔ ۳: روی پروژهٔ منجمد — شمرده نمی‌شود.
  await db.insert(comments).values({ projectId: PA2, userId: M1, type: 'comment', status: 'needs_review', body: 'منجمد' });
});

afterAll(async () => { await sql.end(); });

describe('کارت‌های تیم', () => {
  it('پروژه، کارکنان، تسکِ باز، ریویو، کامنت — فقط دفاترِ خودش', async () => {
    expect(await teamOverview(manager())).toEqual({
      projects: 2,
      // مدیر (نقشِ عضو) + سارا؛ کارفرما و اعضای دفترِ دیگر نه.
      members: 2,
      openTasks: 3,
      reviewTasks: 1,
      comments: 1,
    });
  });

  it('⚠️ بی‌دفتر ممنوع است', async () => {
    await expect(teamOverview({ id: OUT, roles: ['member'], permissions: [], privateAccess: false }))
      .rejects.toThrow(ForbiddenError);
  });
});

describe('بردِ پروژه', () => {
  it('ستون‌های مدیریتی: دفتر، تاریخ، شمارِ تسک، پیشرفت، زمانِ کل', async () => {
    const rows = await teamProjects(manager());
    const a1 = rows.find((r) => r.id === PA1)!;
    expect(a1).toMatchObject({ officeName: 'تهران', regDate: '2026-01-01', statusGroup: 'in_progress', taskTotal: 5, progress: 20, minutes: 90 });
    expect(rows.map((r) => r.id).sort()).toEqual([PA1, PA2].sort());
  });
});

describe('بردِ تسک', () => {
  it('پیش‌فرض فقط بازها (نه بسته، نه ریویو)، با تب‌های وضعیت', async () => {
    const b = await teamTasks(manager());
    expect(b.rows.map((r) => r.title).sort()).toEqual(['باز-بابک', 'باز-سارا', 'نقشی'].sort());
    expect(b.allCount).toBe(3);
    expect(b.statusCounts).toEqual([{ id: todo, name: 'شروع نشده', color: '', n: 3 }]);
    const mine = b.rows.find((r) => r.title === 'باز-سارا')!;
    expect(mine).toMatchObject({ priorityName: 'فوری', priorityColor: '#e11', assigneeName: 'سارا' });
    expect(b.rows.find((r) => r.title === 'نقشی')!.roleNames).toEqual(['طراح']);
  });

  it('بسته‌ها و ریویوها با tall؛ شمارِ تب‌ها درونِ فیلترِ عضو', async () => {
    const b = await teamTasks(manager(), { openOnly: false, assignee: { kind: 'user', id: M1 } });
    expect(b.allCount).toBe(3);
    expect(b.statusCounts.map((s) => [s.id, s.n])).toEqual([[todo, 1], [review, 1], [expect.any(Number), 1]]);
    const onlyReview = await teamTasks(manager(), { openOnly: false, assignee: { kind: 'user', id: M1 }, statusTagId: review });
    expect(onlyReview.rows.map((r) => r.title)).toEqual(['ریویو-سارا']);
    expect(onlyReview.total).toBe(1);
    // ⚠️ «همه» شمارِ بی‌تب را نگه می‌دارد، نه شمارِ تبِ انتخاب‌شده.
    expect(onlyReview.allCount).toBe(3);
  });

  it('فیلترِ نقش (r:) و «بدونِ مسئول»', async () => {
    const byRole = await teamTasks(manager(), { assignee: { kind: 'role', id: designer } });
    expect(byRole.rows.map((r) => r.title)).toEqual(['نقشی']);
    const nobody = await teamTasks(manager(), { assignee: { kind: 'none' } });
    expect(nobody.rows.map((r) => r.title)).toEqual(['نقشی']);
    const prio = await teamTasks(manager(), { priorityTagId: high });
    expect(prio.rows.map((r) => r.title)).toEqual(['باز-سارا']);
  });

  it('تعداد در صفحه فقط ۱۰/۲۵/۵۰/۱۰۰ و صفحهٔ بیرون از بازه به آخرین صفحه', async () => {
    expect((await teamTasks(manager(), { perPage: 7 })).perPage).toBe(25);
    const last = await teamTasks(manager(), { perPage: 10, page: 99 });
    expect(last.page).toBe(1);
    expect(last.rows).toHaveLength(3);
  });

  it('گزینه‌های فیلتر: اعضا و نقش‌هایی که روی تسک‌اند', async () => {
    const o = await taskFilterOptions(manager());
    expect(o.assignees.map((a) => a.name).sort()).toEqual(['بابک', 'سارا'].sort());
    expect(o.roles.map((r) => r.name)).toEqual(['طراح']);
    expect(o.priorities.map((p) => p.name)).toEqual(['فوری']);
  });
});

describe('کامنت‌های نیازمندِ بررسی', () => {
  it('یک ردیف برای هر رشتهٔ باز، با تازه‌ترین پیام؛ منجمد و بسته بیرون', async () => {
    const list = await teamComments(manager());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ projectId: PA1, excerpt: 'پاسخِ تازه', authorName: 'بابک' });
  });
});

describe('اعضا و ساعت', () => {
  it('کارت‌ها فقط اعضای دفتر؛ جدولِ ساعت هر کسی که روی پروژه‌های دفتر کار کرده', async () => {
    const d = await teamMembers(manager(), { range: 'week' });
    expect(d.members.map((m) => m.name).sort()).toEqual(['سارا', 'مدیر'].sort());
    const sara = d.members.find((m) => m.id === M1)!;
    expect(sara).toMatchObject({ minutes: 60, projects: 1, openTasks: 1 });
    expect(d.hours.map((h) => [h.name, h.minutes])).toEqual([['سارا', 60], ['بابک', 30]]);
    expect(d.matrix.map((r) => r.id).sort()).toEqual([MGR, M1].sort());
  });
});

describe('پروژه‌های یک عضو', () => {
  it('همهٔ پروژه‌هایش در دامنه، هر وضعیتی؛ دفترِ دیگر نه', async () => {
    const d = await teamMemberProjects(manager(), M1);
    expect(d.projects.map((p) => p.id).sort()).toEqual([PA1, PA2].sort());
    expect(d.projects.find((p) => p.id === PA1)).toMatchObject({ roles: ['دولوپر'], minutes: 60, openTasks: 1 });
  });

  it('⚠️ کسی بیرون از دامنهٔ پایش رد می‌شود', async () => {
    await expect(teamMemberProjects(manager(), OUT)).rejects.toThrow(ForbiddenError);
  });
});
