import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { notifications, projectClients, projectMembers, projects, tags, tasks, userRoles, users } from '../schema';
import { addTaskNote, createTask, setTaskStatus } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * ۲.۱۷.۱: کامنتِ تازه روی تسک به مسئول و سازنده می‌رسد (نه نویسنده)، تسکِ پنهان
 * از کارفرما به کارفرما نه؛ و «نیاز به کار بیشتر» از هر وضعیتی به مسئول خبر می‌دهد.
 */

let OWNER = 0, DEV = 0, CLIENT = 0, P = 0, REWORK = 0, TODO = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const count = async (userId: number, type: string) =>
  (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, type)))).length;

beforeAll(async () => {
  await sql`truncate table notifications, comments, tasks, project_members, project_clients, projects, user_roles, tags, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([{ email: 'o@tn', name: 'مالک' }, { email: 'd@tn', name: 'دولوپر' }, { email: 'c@tn', name: 'کارفرما' }]).returning({ id: users.id });
  [OWNER, DEV, CLIENT] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: DEV, role: 'member' }, { userId: CLIENT, role: 'client' }]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  const st = await db.insert(tags).values([
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'todo' },
    { name: 'نیاز به کار بیشتر', type: 'task_status', statusGroup: 'in_progress', slug: 'need-more-work' },
  ]).returning({ id: tags.id });
  [TODO, REWORK] = st.map((r) => r.id) as [number, number];
  const [p] = await db.insert(projects).values({ title: 'پروژه', scope: 'company' }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: DEV, roleTagId: role!.id });
  await db.insert(projectClients).values({ projectId: P, userId: CLIENT });
});

describe('اعلانِ کامنتِ تسک', () => {
  it('به مسئول و سازنده می‌رسد، نه به نویسنده', async () => {
    const id = await createTask(as(CLIENT, ['client']), P, { title: 'تسکِ کارفرما', description: '', statusTagId: TODO, priorityTagId: null, assignedTo: DEV, dueDate: null, isPrivate: false });
    // کارفرما خودش به شخص نمی‌سپارد؛ مدیر بعداً به دولوپر می‌سپارد.
    await db.update(tasks).set({ assignedTo: DEV }).where(eq(tasks.id, id));
    await addTaskNote(as(DEV, ['member']), id, 'انجامش دادم');
    expect(await count(CLIENT, 'task_note')).toBe(1);
    expect(await count(DEV, 'task_note')).toBe(0);
    await addTaskNote(as(CLIENT, ['client']), id, 'مرسی');
    expect(await count(DEV, 'task_note')).toBe(1);
  });

  it('تسکِ «پنهان از کارفرما» به کارفرما خبر نمی‌دهد', async () => {
    const before = await count(CLIENT, 'task_note');
    const id = await createTask(as(OWNER, ['owner']), P, { title: 'داخلی', description: '', statusTagId: TODO, priorityTagId: null, assignedTo: DEV, dueDate: null, isPrivate: false });
    await db.update(tasks).set({ clientHidden: true, createdBy: CLIENT }).where(eq(tasks.id, id));
    await addTaskNote(as(DEV, ['member']), id, 'یادداشتِ داخلی');
    expect(await count(CLIENT, 'task_note')).toBe(before);
  });
});

describe('«نیاز به کار بیشتر»', () => {
  it('از هر وضعیتی به مسئول خبر می‌دهد', async () => {
    const id = await createTask(as(OWNER, ['owner']), P, { title: 'هدر', description: '', statusTagId: TODO, priorityTagId: null, assignedTo: DEV, dueDate: null, isPrivate: false });
    const before = await count(DEV, 'task.back');
    await setTaskStatus(as(OWNER, ['owner']), id, REWORK);
    expect(await count(DEV, 'task.back')).toBe(before + 1);
  });
});
