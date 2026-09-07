import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  projectMembers, projects, tags, taskRoles, tasks, userRoles, users,
} from '../schema';
import {
  getProjectTabs, referTask, setMembers, setProjectAccess,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * قواعدِ تخصیصِ تسک: دیدِ عضوِ ساده، واگذاریِ خودکارِ نقش، انتقال هنگامِ قطعِ
 * دسترسی، و ارجاع.
 */

const OWNER = 1, DEV1 = 2, DEV2 = 3, DESIGNER = 4;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const member = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });

let devRole: number, designRole: number, todo: number, done: number;
let project: number;

beforeAll(async () => {
  await sql`truncate table audit_log, comments, task_roles, tasks, project_members, project_clients,
    projects, tags, user_roles, users, notifications restart identity cascade`;

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'd1@t', name: 'دولوپر یک' },
    { email: 'd2@t', name: 'دولوپر دو' }, { email: 'ds@t', name: 'دیزاینر' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: DEV1, role: 'member' },
    { userId: DEV2, role: 'member' }, { userId: DESIGNER, role: 'member' },
  ]);

  const roles = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'دیزاینر', type: 'member_role' },
  ]).returning({ id: tags.id });
  devRole = roles[0]!.id; designRole = roles[1]!.id;

  const status = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'task_status', statusGroup: 'in_progress' },
    { name: 'تمام', type: 'task_status', statusGroup: 'complete', isClosed: true },
  ]).returning({ id: tags.id });
  todo = status[0]!.id; done = status[1]!.id;

  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0' }).returning({ id: projects.id });
  project = p!.id;

  await db.insert(projectMembers).values([
    { projectId: project, userId: DEV1, roleTagId: devRole },
    { projectId: project, userId: DEV2, roleTagId: devRole },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('دیدِ عضوِ ساده روی تختهٔ پروژه', () => {
  it('کارِ دولوپرِ دیگر را نمی‌بیند، ولی وابستگی‌اش را چرا', async () => {
    const [t1] = await db.insert(tasks).values({
      projectId: project, title: 'کارِ دولوپر ۱', assignedTo: DEV1, statusTagId: todo, createdBy: OWNER,
    }).returning({ id: tasks.id });
    await db.insert(tasks).values({
      projectId: project, title: 'کارِ دولوپر ۲', assignedTo: DEV2, statusTagId: todo,
      createdBy: OWNER, dependsOn: t1!.id,
    });
    await db.insert(tasks).values({
      projectId: project, title: 'کارِ نامرتبطِ دولوپر ۱', assignedTo: DEV1, statusTagId: todo, createdBy: OWNER,
    });

    const seen = await getProjectTabs(member(DEV2), project);
    const titles = seen.tasks.map((t) => t.title);
    expect(titles).toContain('کارِ دولوپر ۲');
    expect(titles).toContain('کارِ دولوپر ۱'); // وابستگی — استثنا
    expect(titles).not.toContain('کارِ نامرتبطِ دولوپر ۱');

    // مدیرِ کل همه را می‌بیند.
    const all = await getProjectTabs(owner(), project);
    expect(all.tasks).toHaveLength(3);
  });

  it('تسکِ نقشیِ برنداشته برای هر دو دیده می‌شود و پس از برداشتن فقط برای یکی', async () => {
    const [roleTask] = await db.insert(tasks).values({
      projectId: project, title: 'تسکِ نقشی', statusTagId: todo, createdBy: OWNER,
    }).returning({ id: tasks.id });
    await db.insert(taskRoles).values({ taskId: roleTask!.id, roleTagId: devRole });

    for (const id of [DEV1, DEV2]) {
      const view = await getProjectTabs(member(id), project);
      expect(view.tasks.map((t) => t.title)).toContain('تسکِ نقشی');
    }

    await db.update(taskRoles).set({ claimedBy: DEV1 }).where(eq(taskRoles.taskId, roleTask!.id));
    const mine = await getProjectTabs(member(DEV1), project);
    const theirs = await getProjectTabs(member(DEV2), project);
    expect(mine.tasks.map((t) => t.title)).toContain('تسکِ نقشی');
    expect(theirs.tasks.map((t) => t.title)).not.toContain('تسکِ نقشی');
  });
});

describe('نقشِ بی‌متصدی', () => {
  it('تسکِ نقشِ دیزاینر با آمدنِ تنها دیزاینر خودکار به نامش می‌خورد', async () => {
    const [waiting] = await db.insert(tasks).values({
      projectId: project, title: 'طراحیِ صفحه', statusTagId: todo, createdBy: OWNER,
    }).returning({ id: tasks.id });
    await db.insert(taskRoles).values({ taskId: waiting!.id, roleTagId: designRole });

    await setMembers(owner(), project, [
      { userId: DEV1, roleTagId: devRole, agreedAmount: '0' },
      { userId: DEV2, roleTagId: devRole, agreedAmount: '0' },
      { userId: DESIGNER, roleTagId: designRole, agreedAmount: '0' },
    ]);

    const [row] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, waiting!.id));
    expect(row!.assignedTo).toBe(DESIGNER);
    const [claim] = await db.select({ claimedBy: taskRoles.claimedBy })
      .from(taskRoles).where(eq(taskRoles.taskId, waiting!.id));
    expect(claim!.claimedBy).toBe(DESIGNER);
  });
});

describe('قطعِ دسترسی', () => {
  it('کارِ نیمه‌تمام به هم‌نقشِ باقی‌مانده می‌رسد و کارِ تمام‌شده دست نمی‌خورد', async () => {
    const [open] = await db.insert(tasks).values({
      projectId: project, title: 'کارِ باز', assignedTo: DEV1, statusTagId: todo, createdBy: OWNER,
    }).returning({ id: tasks.id });
    const [closed] = await db.insert(tasks).values({
      projectId: project, title: 'کارِ بسته', assignedTo: DEV1, statusTagId: done, createdBy: OWNER,
    }).returning({ id: tasks.id });

    await setProjectAccess(owner(), project, DEV1, true);

    const [openRow] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, open!.id));
    const [closedRow] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, closed!.id));
    expect(openRow!.assignedTo).toBe(DEV2);
    expect(closedRow!.assignedTo).toBe(DEV1);
  });
});

describe('ارجاعِ تسک', () => {
  it('مدیر ارجاع می‌دهد، یادداشت می‌ماند؛ عضو اجازه ندارد', async () => {
    const [task] = await db.insert(tasks).values({
      projectId: project, title: 'برای ارجاع', assignedTo: DEV2, statusTagId: todo, createdBy: OWNER,
    }).returning({ id: tasks.id });

    await expect(referTask(member(DEV2), task!.id, DESIGNER, 'لطفاً ببین'))
      .rejects.toBeInstanceOf(ForbiddenError);

    await referTask(owner(), task!.id, DESIGNER, 'لطفاً بررسی کن');
    const [row] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, task!.id));
    expect(row!.assignedTo).toBe(DESIGNER);

    const notes = await sql`select body from comments where task_id = ${task!.id} and type = 'task_note'`;
    expect(notes[0]!.body).toBe('لطفاً بررسی کن');
  });

  it('گیرندهٔ بیرون از پروژه رد می‌شود', async () => {
    const [task] = await db.insert(tasks).values({
      projectId: project, title: 'ارجاعِ ناموفق', statusTagId: todo, createdBy: OWNER,
    }).returning({ id: tasks.id });
    const [stranger] = await db.insert(users).values({ email: 'x@t', name: 'غریبه' }).returning({ id: users.id });

    await expect(referTask(owner(), task!.id, stranger!.id, ''))
      .rejects.toBeInstanceOf(ForbiddenError);
    const [row] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.id, task!.id));
    expect(row!.assignedTo).toBeNull();
  });
});

describe('گزینه‌های فرمِ تسک', () => {
  it('مدیر همهٔ نقش‌ها و مدیرِ کل را در فهرست دارد', async () => {
    const { getTaskFormOptions } = await import('@/server/projects/service');
    const options = await getTaskFormOptions(owner(), project);
    expect(options.roles.map((r) => r.id).sort()).toEqual([devRole, designRole].sort());
    expect(options.assignees.some((a) => a.userId === OWNER)).toBe(true);

    // عضو فقط نقش‌های موجودِ پروژه را می‌بیند و مدیرِ کل در فهرستش نیست.
    const asMember = await getTaskFormOptions(member(DEV2), project);
    expect(asMember.assignees.some((a) => a.userId === OWNER)).toBe(false);
  });
});

/** فقط برای اینکه ایمپورتِ and استفاده شود (کوئری‌های ترکیبی بالا). */
void and;
void projects;

describe('نامِ همکارِ ادمین برای عضو', () => {
  it('عضو به‌جای نامِ دستیار «دستیارِ مدیر» می‌بیند، ولی نامِ مالک را می‌بیند', async () => {
    const [assistant] = await db.insert(users).values({ email: 'as@t', name: 'سارا دستیار' })
      .returning({ id: users.id });
    await db.insert(userRoles).values({ userId: assistant!.id, role: 'admin' });
    await db.insert(projectMembers).values({ projectId: project, userId: assistant!.id, roleTagId: designRole });

    const view = await getProjectTabs(member(DEV2), project);
    const names = view.members.map((m) => m.userName);
    expect(names).toContain('دستیارِ مدیر');
    expect(names).not.toContain('سارا دستیار');

    // مدیرِ کل نامِ واقعی را می‌بیند.
    const asOwner = await getProjectTabs(owner(), project);
    expect(asOwner.members.map((m) => m.userName)).toContain('سارا دستیار');
  });
});
