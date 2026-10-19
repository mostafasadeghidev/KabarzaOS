import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { projectMembers, projects, tags, taskRoles, tasks, userRoles, users } from '../schema';
import { getProjectDetail, getTaskDetail, setTaskStatus, updateTask } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * وضعیتِ تسک مالِ صاحبِ کار است (۲.۳۹.۰): مسئول، دارندهٔ نقشِ برنداشته، سازندهٔ
 * تسکِ بی‌مسئول، و مدیر — نه همکارِ دیگر، حتی اگر تسک را ببیند.
 */

const OWNER = 1, DEV1 = 2, DEV2 = 3;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const member = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });

let devRole = 0, todo = 0, done = 0, project = 0;
let devTwoTask = 0, roleTask = 0, devOneMadeForTwo = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, comments, task_roles, tasks, project_members, project_clients,
    projects, tags, user_roles, users, notifications restart identity cascade`;
  await db.insert(users).values([
    { email: 'o@s', name: 'مالک' }, { email: 'd1@s', name: 'دولوپر یک' }, { email: 'd2@s', name: 'دولوپر دو' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: DEV1, role: 'member' }, { userId: DEV2, role: 'member' },
  ]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  devRole = role!.id;
  const st = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'task_status', statusGroup: 'in_progress' },
    { name: 'تمام', type: 'task_status', statusGroup: 'complete', isClosed: true },
  ]).returning({ id: tags.id });
  todo = st[0]!.id; done = st[1]!.id;
  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0' }).returning({ id: projects.id });
  project = p!.id;
  await db.insert(projectMembers).values([
    { projectId: project, userId: DEV1, roleTagId: devRole },
    { projectId: project, userId: DEV2, roleTagId: devRole },
  ]);
  const t = await db.insert(tasks).values([
    { projectId: project, title: 'کارِ دولوپر دو', statusTagId: todo, assignedTo: DEV2, createdBy: OWNER },
    { projectId: project, title: 'کارِ نقشی', statusTagId: todo, createdBy: OWNER },
    { projectId: project, title: 'سفارشِ یک برای دو', statusTagId: todo, assignedTo: DEV2, createdBy: DEV1 },
  ]).returning({ id: tasks.id });
  [devTwoTask, roleTask, devOneMadeForTwo] = t.map((r) => r.id) as [number, number, number];
  await db.insert(taskRoles).values({ taskId: roleTask, roleTagId: devRole });
});

afterAll(async () => { await sql.end(); });

describe('وضعیتِ تسک مالِ صاحبِ کار است', () => {
  it('⚠️ همکار وضعیتِ کارِ دیگری را عوض نمی‌کند؛ خودِ مسئول و مالک می‌کنند', async () => {
    await expect(setTaskStatus(member(DEV1), devTwoTask, done)).rejects.toBeInstanceOf(ForbiddenError);
    await setTaskStatus(member(DEV2), devTwoTask, done);
    await setTaskStatus(owner(), devTwoTask, todo);
  });

  it('تسکِ نقشیِ برنداشته: هر دارندهٔ نقش؛ پس از برداشتن فقط خودش', async () => {
    await setTaskStatus(member(DEV1), roleTask, done);
    await db.update(taskRoles).set({ claimedBy: DEV2 }).where(eq(taskRoles.taskId, roleTask));
    await expect(setTaskStatus(member(DEV1), roleTask, todo)).rejects.toBeInstanceOf(ForbiddenError);
    await setTaskStatus(member(DEV2), roleTask, todo);
  });

  it('⚠️ سازنده متنِ تسکِ سپرده‌شده به دیگری را ویرایش می‌کند، ولی وضعیتش را نه', async () => {
    const input = {
      title: 'سفارشِ یک برای دو (ویرایش)', description: '', priorityTagId: null, assignedTo: DEV2,
      dueDate: null, isPrivate: false,
    };
    await updateTask(member(DEV1), devOneMadeForTwo, { ...input, statusTagId: todo });
    await expect(updateTask(member(DEV1), devOneMadeForTwo, { ...input, statusTagId: done }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('پرچمِ UI همان قاعدهٔ سرور است — فهرستِ پروژه و مودالِ تسک', async () => {
    const asOne = await getProjectDetail(member(DEV1), project);
    const flag = (id: number) => asOne.tasks.find((t) => t.id === id)?.canSetStatus;
    // عضوِ ساده کارِ دیگری را روی تخته نمی‌بیند؛ اگر هم ببیند (از راهِ دیگر) پرچم بسته است.
    expect(flag(devTwoTask) ?? false).toBe(false);
    expect((await getTaskDetail(member(DEV1), devTwoTask)).canSetStatus).toBe(false);
    expect((await getTaskDetail(member(DEV2), devTwoTask)).canSetStatus).toBe(true);
    expect((await getTaskDetail(owner(), devTwoTask)).canSetStatus).toBe(true);
  });
});
