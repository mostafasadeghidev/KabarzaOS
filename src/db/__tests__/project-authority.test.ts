import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  offices, projectMembers, projects, tags, tasks, userOffices, userRoles, users,
} from '../schema';
import * as service from '@/server/projects/service';
import { canManageProject } from '@/server/projects/authority';
import { ForbiddenError } from '@/domain/access/guard';
import { NotFoundError } from '@/server/projects/service';
import { PM_CAP } from '@/domain/access/project-scope';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * اختیارِ پروژه‌محور.
 *
 * ⚠️ حساس‌ترین تستِ این دور: اینجا مرزِ دسترسی **باز** می‌شود. هر شاخه دو
 * تست دارد — یکی که باید بتواند و یکی که نباید. تستِ ایجابیِ تنها، نشتِ
 * دسترسی را نشان نمی‌دهد.
 */

const view = ['projects.view'] as Permission[];
const globalManage = ['projects.view', 'projects.manage'] as Permission[];

const actor = (id: number, perms: Permission[] = view): Actor => ({
  id, roles: [], permissions: perms, privateAccess: false,
});

let owner: number, pm: number, plainMember: number, officeBoss: number, stranger: number;
let tehran: number, shiraz: number;
let pmTag: number, devTag: number;
let projectA: number, projectB: number, orphanProject: number;

beforeAll(async () => {
  await sql`truncate table tasks, project_members, project_clients, projects, offices,
    user_offices, user_roles, tags, audit_log, notifications, users restart identity cascade`;

  const u = await db.insert(users).values([
    { email: 'own@t', name: 'مالک' },
    { email: 'pm@t', name: 'مدیرِ پروژه' },
    { email: 'mem@t', name: 'عضوِ عادی' },
    { email: 'boss@t', name: 'مدیرِ دفتر' },
    { email: 'str@t', name: 'بیگانه' },
  ]).returning({ id: users.id });
  [owner, pm, plainMember, officeBoss, stranger] =
    u.map((r) => r.id) as [number, number, number, number, number];

  await db.insert(userRoles).values(
    u.map((r) => ({ userId: r.id, role: 'member' as const })),
  );

  const o = await db.insert(offices).values([
    { name: 'تهران' }, { name: 'شیراز' },
  ]).returning({ id: offices.id });
  tehran = o[0]!.id; shiraz = o[1]!.id;

  await db.insert(userOffices).values({ userId: officeBoss, officeId: tehran, manages: true });

  const t = await db.insert(tags).values([
    { name: 'مدیرِ پروژه', type: 'member_role', grantsCap: PM_CAP },
    { name: 'دولوپر', type: 'member_role', grantsCap: '' },
  ]).returning({ id: tags.id });
  pmTag = t[0]!.id; devTag = t[1]!.id;

  const p = await db.insert(projects).values([
    { title: 'پروژهٔ الف', scope: 'company', officeId: tehran },
    { title: 'پروژهٔ ب', scope: 'company', officeId: shiraz },
    { title: 'پروژهٔ بی‌دفتر', scope: 'company', officeId: null },
  ]).returning({ id: projects.id });
  projectA = p[0]!.id; projectB = p[1]!.id; orphanProject = p[2]!.id;

  await db.insert(projectMembers).values([
    // مدیرِ پروژه فقط روی «الف» امضا شده.
    { projectId: projectA, userId: pm, roleTagId: pmTag },
    // عضوِ عادی روی هر دو، ولی با نقشِ بی‌دسترسی.
    { projectId: projectA, userId: plainMember, roleTagId: devTag },
    { projectId: projectB, userId: plainMember, roleTagId: devTag },
    // مدیرِ دفتر روی «ب» (دفترِ دیگر) امضا شده.
    { projectId: projectB, userId: officeBoss, roleTagId: devTag },
  ]);
});

describe('canManageProject — سه راهِ نسخهٔ قبلی', () => {
  it('مجوزِ سراسری روی هر پروژه', async () => {
    expect(await canManageProject(actor(owner, globalManage), projectA)).toBe(true);
    expect(await canManageProject(actor(owner, globalManage), projectB)).toBe(true);
  });

  it('مدیرِ پروژه روی پروژهٔ خودش می‌تواند', async () => {
    expect(await canManageProject(actor(pm), projectA)).toBe(true);
  });

  it('⚠️ مدیرِ پروژه روی پروژهٔ دیگر نمی‌تواند', async () => {
    expect(await canManageProject(actor(pm), projectB)).toBe(false);
  });

  it('⚠️ عضوِ عادی هیچ‌جا نمی‌تواند — حتی روی پروژهٔ خودش', async () => {
    expect(await canManageProject(actor(plainMember), projectA)).toBe(false);
    expect(await canManageProject(actor(plainMember), projectB)).toBe(false);
  });

  it('مدیرِ دفتر روی پروژهٔ دفترِ خودش، بدونِ امضا', async () => {
    expect(await canManageProject(actor(officeBoss), projectA)).toBe(true);
  });

  it('مدیرِ دفتر روی پروژهٔ دفترِ دیگر فقط چون امضا شده', async () => {
    expect(await canManageProject(actor(officeBoss), projectB)).toBe(true);
  });

  it('⚠️ مدیرِ دفتر روی پروژهٔ بی‌دفتری که رویش نیست، نمی‌تواند', async () => {
    expect(await canManageProject(actor(officeBoss), orphanProject)).toBe(false);
  });

  it('⚠️ بیگانه هیچ‌جا نمی‌تواند', async () => {
    expect(await canManageProject(actor(stranger), projectA)).toBe(false);
    expect(await canManageProject(actor(stranger), projectB)).toBe(false);
  });
});

describe('گاردِ عمل‌های پروژه‌محور', () => {
  beforeEach(async () => {
    await sql`truncate table tasks restart identity cascade`;
  });

  it('مدیرِ پروژه می‌تواند تسک بسازد', async () => {
    const id = await service.createTask(actor(pm), projectA, {
      title: 'تسکِ مدیرِ پروژه', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    });
    expect(id).toBeGreaterThan(0);
  });

  it('⚠️ روی پروژهٔ دیگر نمی‌تواند', async () => {
    await expect(service.createTask(actor(pm), projectB, {
      title: 'نباید ساخته شود', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('⚠️ عضوِ عادی نمی‌تواند تسک بسازد', async () => {
    await expect(service.createTask(actor(plainMember), projectA, {
      title: 'نباید', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('مدیرِ پروژه وضعیتِ پروژه‌اش را عوض می‌کند', async () => {
    await expect(service.setProjectStatus(actor(pm), projectA, null)).resolves.toBeUndefined();
  });

  it('⚠️ ولی وضعیتِ پروژهٔ دیگر را نه', async () => {
    await expect(service.setProjectStatus(actor(pm), projectB, null))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('مدیرِ پروژه عضو اضافه می‌کند', async () => {
    await expect(service.addProjectClient(actor(pm), projectA, stranger))
      .resolves.toBeUndefined();
  });

  it('مدیرِ پروژه تسکِ پروژهٔ خودش را ویرایش و حذف می‌کند', async () => {
    const id = await service.createTask(actor(owner, globalManage), projectA, {
      title: 'تسک', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    });

    await expect(service.updateTask(actor(pm), id, {
      title: 'ویرایش‌شده', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    })).resolves.toBe(projectA);

    await expect(service.deleteTask(actor(pm), id)).resolves.toBe(projectA);
  });

  it('⚠️ تسکِ پروژهٔ دیگر را نه', async () => {
    const id = await service.createTask(actor(owner, globalManage), projectB, {
      title: 'تسکِ ب', description: '', statusTagId: null,
      priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false,
    });
    await expect(service.deleteTask(actor(pm), id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('⚠️ عمل‌های ویرانگر پروژه‌محور نمی‌شوند', () => {
  it('حذفِ پروژه فقط با مجوزِ سراسری — نسخهٔ قبلی manage_options می‌خواهد', async () => {
    await expect(service.deleteProject(actor(pm), projectA, {
      mode: 'detach', balances: { clientPartiallyPaid: false, memberPartiallyPaid: false },
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('سبک‌سازی فقط با مجوزِ سراسری', async () => {
    await expect(service.lightenProject(actor(pm), projectA))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ساختِ پروژهٔ تازه فقط با مجوزِ سراسری', async () => {
    await expect(service.createProject(actor(pm), {
      title: 'پروژهٔ مدیرِ پروژه', scope: 'company',
    } as Parameters<typeof service.createProject>[1]))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('دامنهٔ scope بر اختیار مقدم است', () => {
  it('⚠️ پروژهٔ خصوصیِ بیرون از دید «یافت نشد» است، نه «ممنوع»', async () => {
    const p = await db.insert(projects)
      .values({ title: 'خصوصی', scope: 'private' })
      .returning({ id: projects.id });
    await db.insert(projectMembers).values({
      projectId: p[0]!.id, userId: pm, roleTagId: pmTag,
    });

    await expect(service.setProjectStatus(actor(pm), p[0]!.id, null))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('تگ بدونِ دسترسی، اختیار نمی‌دهد', () => {
  it('⚠️ تغییرِ تگ به «بدونِ دسترسی» اختیار را پس می‌گیرد', async () => {
    expect(await canManageProject(actor(pm), projectA)).toBe(true);

    await db.update(tags).set({ grantsCap: '' }).where(eq(tags.id, pmTag));
    expect(await canManageProject(actor(pm), projectA)).toBe(false);

    await db.update(tags).set({ grantsCap: PM_CAP }).where(eq(tags.id, pmTag));
  });

  it('⚠️ برداشتنِ امضا هم اختیار را پس می‌گیرد', async () => {
    await db.delete(projectMembers).where(eq(projectMembers.userId, pm));
    expect(await canManageProject(actor(pm), projectA)).toBe(false);

    await db.insert(projectMembers).values({
      projectId: projectA, userId: pm, roleTagId: pmTag,
    });
  });

  it('عضویت با چند نقش: یکی از آنها کافی است', async () => {
    await db.insert(projectMembers).values({
      projectId: projectB, userId: pm, roleTagId: devTag,
    });
    expect(await canManageProject(actor(pm), projectB)).toBe(false);

    await db.insert(projectMembers).values({
      projectId: projectB, userId: pm, roleTagId: pmTag,
    });
    expect(await canManageProject(actor(pm), projectB)).toBe(true);

    await db.delete(projectMembers).where(eq(projectMembers.projectId, projectB));
  });
});
