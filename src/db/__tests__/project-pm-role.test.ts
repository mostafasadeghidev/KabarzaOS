import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { offices, projectMembers, projects, tagRelations, tags, userOffices, userRoles, users } from '../schema';
import { addProjectMember, getMembersForm, setMembers } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * «مدیر پروژه» نقشِ روی پروژه است (۲.۴۲.۰): برای هر عضو قابلِ انتخاب، بی‌آنکه
 * روی پروفایلش باشد؛ فقط مدیرِ کل و مدیرِ دفترِ همان پروژه تعیینش می‌کنند؛ و
 * «نقشِ خودش» هرگز به «مدیر پروژه» حل نمی‌شود.
 */

const OWNER = 1, OFFICE_MGR = 2, DEV = 3, PM_USER = 4, OTHER = 5;
const actor = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

let devRole = 0, pmRole = 0, project = 0;

const rolesOf = async (userId: number) => (await db.select({ roleTagId: projectMembers.roleTagId })
  .from(projectMembers).where(and(eq(projectMembers.projectId, project), eq(projectMembers.userId, userId))))
  .map((r) => r.roleTagId).sort();

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, project_members, project_clients, projects, tag_relations,
    tags, user_offices, offices, user_roles, users restart identity cascade`;
  await db.insert(users).values([
    { email: 'o@pm', name: 'مالک' }, { email: 'm@pm', name: 'مدیرِ دفتر' }, { email: 'd@pm', name: 'دولوپر' },
    { email: 'p@pm', name: 'مدیرِ پروژه' }, { email: 'x@pm', name: 'دیگری' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: OFFICE_MGR, role: 'member' }, { userId: DEV, role: 'member' },
    { userId: PM_USER, role: 'member' }, { userId: OTHER, role: 'member' },
  ]);
  const t = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role', sortOrder: 9 },
    { name: 'مدیر پروژه', type: 'member_role', sortOrder: 1, grantsCap: 'pm' },
  ]).returning({ id: tags.id });
  [devRole, pmRole] = t.map((r) => r.id) as [number, number];
  // ⚠️ «مدیر پروژه» ِ پروفایل جلوتر از دولوپر است — «نقشِ خودش» باز هم باید دولوپر شود.
  await db.insert(tagRelations).values([
    { tagId: devRole, objectId: DEV, objectType: 'user' },
    { tagId: pmRole, objectId: OTHER, objectType: 'user' },
    { tagId: devRole, objectId: OTHER, objectType: 'user' },
  ]);
  const [office] = await db.insert(offices).values({ name: 'آلمان' }).returning({ id: offices.id });
  await db.insert(userOffices).values({ userId: OFFICE_MGR, officeId: office!.id, manages: true });
  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0', officeId: office!.id }).returning({ id: projects.id });
  project = p!.id;
  await db.insert(projectMembers).values({ projectId: project, userId: PM_USER, roleTagId: pmRole });
});

afterAll(async () => { await sql.end(); });

describe('«مدیر پروژه» روی یک پروژه', () => {
  it('⚠️ مالک دولوپری را که این نقش روی پروفایلش نیست مدیرِ همین پروژه می‌کند', async () => {
    await addProjectMember(actor(OWNER, ['owner']), project, { userId: DEV, roleTagId: pmRole, agreedAmount: '0' });
    expect(await rolesOf(DEV)).toEqual([pmRole]);
  });

  it('⚠️ مدیرِ پروژه اعضا را می‌گرداند ولی مدیرِ دیگری نمی‌سازد', async () => {
    const pm = actor(PM_USER, ['member']);
    await expect(addProjectMember(pm, project, { userId: OTHER, roleTagId: pmRole, agreedAmount: '0' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    const form = await getMembersForm(pm, project);
    expect(form.canAssignPm).toBe(false);
    expect(form.pmRoleIds).toEqual([pmRole]);
    // افزودنِ دولوپرِ معمولی بی‌اشکال است — ردیف‌های مدیر دست نخورده‌اند.
    await setMembers(pm, project, [
      ...form.members.map((m) => ({ userId: m.userId, roleTagId: m.roleTagId, agreedAmount: '0' })),
      { userId: OTHER, roleTagId: devRole, agreedAmount: '0' },
    ]);
    expect(await rolesOf(OTHER)).toEqual([devRole]);
    // برداشتنِ مدیرِ دیگر هم اختیارِ ویژه می‌خواهد.
    const after = await getMembersForm(pm, project);
    await expect(setMembers(pm, project, after.members
      .filter((m) => m.userId !== DEV)
      .map((m) => ({ userId: m.userId, roleTagId: m.roleTagId, agreedAmount: '0' }))))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('مدیرِ دفترِ همین پروژه مدیرِ پروژه تعیین می‌کند', async () => {
    const mgr = actor(OFFICE_MGR, ['member']);
    expect((await getMembersForm(mgr, project)).canAssignPm).toBe(true);
    await addProjectMember(mgr, project, { userId: OTHER, roleTagId: pmRole, agreedAmount: '0' });
    expect(await rolesOf(OTHER)).toEqual([devRole, pmRole].sort());
  });

  it('⚠️ «نقشِ خودش» هرگز «مدیر پروژه» نیست — حتی اگر روی پروفایل جلوتر باشد', async () => {
    const [p2] = await db.insert(projects).values({ title: 'دوم', price: '0' }).returning({ id: projects.id });
    await addProjectMember(actor(OWNER, ['owner']), p2!.id, { userId: OTHER, roleTagId: null, agreedAmount: '0' });
    const rows = await db.select({ roleTagId: projectMembers.roleTagId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, p2!.id), eq(projectMembers.userId, OTHER)));
    expect(rows.map((r) => r.roleTagId)).toEqual([devRole]);
  });
});
