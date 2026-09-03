import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  comments, notifications, offices, projectClients, projectMembers, projects,
  tags, taskRoles, tasks, userOffices, userRoles, users,
} from '../schema';
import * as projectService from '@/server/projects/service';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * اعلانِ رویدادها — پورتِ `Support\Notifications`.
 *
 * ⚠️ این تست دربارهٔ **گیرنده** است، نه دربارهٔ ارسال. اشتباهِ گیرنده بی‌صدا
 * می‌ماند: اگر مدیرِ دفتر جا بیفتد هیچ خطایی رخ نمی‌دهد و فقط اعلانی نمی‌رسد.
 * پیش از این هیچ‌کدام از این رویدادها اصلاً `notify()` صدا نمی‌زدند.
 */

const manage = ['projects.view', 'projects.manage'] as Permission[];
const actor = (id: number, perms: Permission[] = manage): Actor => ({
  id, roles: [], permissions: perms, privateAccess: false,
});

let owner: number, dev: number, designer: number, client: number, officeBoss: number, outsider: number;
let projectId: number, devRole: number, reviewTag: number, doingTag: number;

beforeAll(async () => {
  await sql`truncate table notifications, comments, task_roles, tasks, project_clients,
    project_members, projects, offices, user_offices, user_roles, tags, audit_log, users
    restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 'owner@t', name: 'مالک' },
    { email: 'dev@t', name: 'دولوپر' },
    { email: 'des@t', name: 'دیزاینر' },
    { email: 'cli@t', name: 'کارفرما' },
    { email: 'boss@t', name: 'مدیرِ دفتر' },
    { email: 'out@t', name: 'بیرونی' },
  ]).returning({ id: users.id });
  [owner, dev, designer, client, officeBoss, outsider] =
    u.map((r) => r.id) as [number, number, number, number, number, number];

  await db.insert(userRoles).values([
    { userId: owner, role: 'owner' },
    { userId: dev, role: 'member' },
    { userId: designer, role: 'member' },
    { userId: client, role: 'client' },
    { userId: officeBoss, role: 'member' },
    { userId: outsider, role: 'member' },
  ]);

  const o = await db.insert(offices).values({ name: 'تهران' }).returning({ id: offices.id });
  await db.insert(userOffices).values({ userId: officeBoss, officeId: o[0]!.id, manages: true });

  const t = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'در حالِ انجام', type: 'task_status', statusGroup: 'in_progress' },
    { name: 'نیاز به بررسی', type: 'task_status', statusGroup: 'in_progress', isReview: true },
  ]).returning({ id: tags.id });
  devRole = t[0]!.id; doingTag = t[1]!.id; reviewTag = t[2]!.id;

  const p = await db.insert(projects).values({
    title: 'پروژهٔ آزمون', scope: 'company', officeId: o[0]!.id,
  }).returning({ id: projects.id });
  projectId = p[0]!.id;

  await db.insert(projectMembers).values([
    { projectId, userId: dev, roleTagId: devRole },
    { projectId, userId: designer, roleTagId: null },
  ]);
  await db.insert(projectClients).values({ projectId, userId: client });
});

beforeEach(async () => {
  await sql`truncate table notifications restart identity cascade`;
});

const recipients = async () =>
  (await db.select({ userId: notifications.userId }).from(notifications))
    .map((r) => r.userId).sort((a, b) => a - b);

describe('کامنتِ تازه', () => {
  it('به مدیران، مدیرِ دفتر، اعضا و کارفرما می‌رود — نه به نویسنده', async () => {
    await projectService.addComment(actor(dev), projectId, 'یک نکته');
    expect(await recipients()).toEqual([owner, designer, client, officeBoss].sort((a, b) => a - b));
  });

  it('⚠️ بیرونی چیزی نمی‌گیرد', async () => {
    await projectService.addComment(actor(owner), projectId, 'نکتهٔ مدیر');
    expect(await recipients()).not.toContain(outsider);
  });

  it('نوعِ رویداد درست است', async () => {
    await projectService.addComment(actor(dev), projectId, 'نکته');
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, owner));
    expect(row!.type).toBe('comment');
  });
});

describe('ریویو و برگشت از ریویو', () => {
  let taskId: number;

  beforeEach(async () => {
    await sql`truncate table task_roles, tasks restart identity cascade`;
    const t = await db.insert(tasks).values({
      projectId, title: 'تسکِ آزمون', assignedTo: dev, createdBy: dev, scope: 'company', statusTagId: doingTag,
    }).returning({ id: tasks.id });
    taskId = t[0]!.id;
  });

  it('ورود به ریویو → مدیران، مدیرِ دفتر و کارفرما', async () => {
    await projectService.setTaskStatus(actor(owner), taskId, reviewTag);
    // ⚠️ اعضای پروژه گیرنده نیستند — ریویو کارِ تصمیم‌گیرنده است.
    expect(await recipients()).toEqual([client, officeBoss].sort((a, b) => a - b));
  });

  it('برگشت از ریویو → انجام‌دهندهٔ تسک', async () => {
    await projectService.setTaskStatus(actor(owner), taskId, reviewTag);
    await sql`truncate table notifications restart identity cascade`;

    await projectService.setTaskStatus(actor(owner), taskId, doingTag);
    expect(await recipients()).toEqual([dev]);
  });

  it('⚠️ تغییر بینِ دو وضعیتِ غیرِریویو اعلانی نمی‌فرستد', async () => {
    await projectService.setTaskStatus(actor(owner), taskId, null);
    expect(await recipients()).toEqual([]);
  });

  it('تسکِ نقشیِ برگشتی به صاحبانِ نقش می‌رود', async () => {
    const t = await db.insert(tasks).values({
      projectId, createdBy: dev, title: 'تسکِ نقشی', assignedTo: null, scope: 'company', statusTagId: reviewTag,
    }).returning({ id: tasks.id });
    await db.insert(taskRoles).values({ taskId: t[0]!.id, roleTagId: devRole });

    await projectService.setTaskStatus(actor(owner), t[0]!.id, doingTag);
    expect(await recipients()).toEqual([dev]);
  });
});

describe('تغییرِ تخصیصِ تسک', () => {
  it('مسئولِ تازه اعلان می‌گیرد، مسئولِ قبلی نه', async () => {
    const t = await db.insert(tasks).values({
      projectId, createdBy: dev, title: 'تسک', assignedTo: dev, scope: 'company',
    }).returning({ id: tasks.id });

    await projectService.updateTask(actor(owner), t[0]!.id, {
      title: 'تسک', description: '', statusTagId: null, priorityTagId: null,
      assignedTo: designer, dueDate: null, isPrivate: false,
    });
    expect(await recipients()).toEqual([designer]);
  });

  it('⚠️ کسی که تسک را به خودش می‌دهد اعلان نمی‌گیرد', async () => {
    const t = await db.insert(tasks).values({
      projectId, createdBy: dev, title: 'تسک', assignedTo: null, scope: 'company',
    }).returning({ id: tasks.id });

    await projectService.updateTask(actor(owner), t[0]!.id, {
      title: 'تسک', description: '', statusTagId: null, priorityTagId: null,
      assignedTo: owner, dueDate: null, isPrivate: false,
    });
    expect(await recipients()).toEqual([]);
  });

  it('بدونِ تغییرِ مسئول اعلانی نیست', async () => {
    const t = await db.insert(tasks).values({
      projectId, createdBy: dev, title: 'تسک', assignedTo: dev, scope: 'company',
    }).returning({ id: tasks.id });

    await projectService.updateTask(actor(owner), t[0]!.id, {
      title: 'عنوانِ تازه', description: '', statusTagId: null, priorityTagId: null,
      assignedTo: dev, dueDate: null, isPrivate: false,
    });
    expect(await recipients()).toEqual([]);
  });
});

describe('امضای عضو روی پروژه', () => {
  it('عضوِ تازه اعلان می‌گیرد', async () => {
    await projectService.setMembers(actor(owner), projectId, [
      { userId: dev, roleTagId: devRole, agreedAmount: '0' },
      { userId: designer, roleTagId: null, agreedAmount: '0' },
      { userId: outsider, roleTagId: devRole, agreedAmount: '0' },
    ]);
    expect(await recipients()).toEqual([outsider]);

    // پاک‌سازی برای تست‌های بعدی
    await db.delete(projectMembers).where(and(
      eq(projectMembers.projectId, projectId), eq(projectMembers.userId, outsider),
    ));
  });

  it('⚠️ عضوی که از قبل بوده دوباره اعلان نمی‌گیرد', async () => {
    await projectService.setMembers(actor(owner), projectId, [
      { userId: dev, roleTagId: devRole, agreedAmount: '100' },
      { userId: designer, roleTagId: null, agreedAmount: '0' },
    ]);
    expect(await recipients()).toEqual([]);
  });
});
