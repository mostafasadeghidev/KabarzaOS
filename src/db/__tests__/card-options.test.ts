import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { currencies, offices, projects, userOffices, userRoles, users } from '../schema';
import { addProjectMember, getCardOptions } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/**
 * منوی کارتِ پروژه (افزودنِ عضو/کارفرما و وضعیت) برای مدیرِ دفتر (۱.۱۱۹.۰).
 * ⚠️ همان اجازه‌ای که سرور و صفحهٔ پروژه می‌دهند — فقط روی پروژه‌های دفترِ خودش.
 */

const O = 1, MGR = 2, M = 3;
const actor = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
let MINE = 0, OTHER = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, project_members, project_clients, projects, user_offices, offices,
    user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'g@t', name: 'مدیرِ دفتر' }, { email: 'm@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: O, role: 'owner' }, { userId: MGR, role: 'member' }, { userId: M, role: 'member' }]);
  const [a, b] = await db.insert(offices).values([{ name: 'Germany' }, { name: 'Iran' }]).returning({ id: offices.id });
  await db.insert(userOffices).values({ userId: MGR, officeId: a!.id, manages: true });
  const p = await db.insert(projects).values([
    { title: 'دفترِ من', price: '0', officeId: a!.id },
    { title: 'دفترِ دیگر', price: '0', officeId: b!.id },
  ]).returning({ id: projects.id });
  [MINE, OTHER] = [p[0]!.id, p[1]!.id];
});

afterAll(async () => { await sql.end(); });

describe('منوی کارتِ پروژه', () => {
  it('مدیرِ سراسری همه را مدیریت می‌کند', async () => {
    expect((await getCardOptions(actor(O, ['owner']))).manageableIds).toBeNull();
  });

  it('مدیرِ دفتر فقط پروژه‌های دفترِ خودش را — و همان‌جا عضو اضافه می‌کند', async () => {
    const options = await getCardOptions(actor(MGR, ['member']));
    expect(options.manageableIds).toEqual([MINE]);
    expect(options.statuses).toBeDefined();
    await addProjectMember(actor(MGR, ['member']), MINE, { userId: M, roleTagId: null, agreedAmount: '0' });
    await expect(addProjectMember(actor(MGR, ['member']), OTHER, { userId: M, roleTagId: null, agreedAmount: '0' }))
      .rejects.toThrow();
  });

  it('عضوِ ساده منو ندارد', async () => {
    await expect(getCardOptions(actor(M, ['member']))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('مبلغِ اعضا برای مدیرِ بی‌اختیارِ پول (۱.۱۱۹.۱)', () => {
  it('⚠️ مدیرِ دفتر مبلغ نمی‌بیند و ذخیره‌اش مبلغِ موجود را عوض نمی‌کند', async () => {
    const { getMembersForm, setMembers } = await import('@/server/projects/service');
    const { projectMembers } = await import('../schema');
    const { eq } = await import('drizzle-orm');
    // مالک مبلغ را تعیین می‌کند.
    await setMembers(actor(O, ['owner']), MINE, [{ userId: M, roleTagId: null, agreedAmount: '700', unitRate: '0', currencyId: null }]);
    const form = await getMembersForm(actor(MGR, ['member']), MINE);
    expect(form.canEditMoney).toBe(false);
    expect(form.members.map((m) => m.agreedAmount)).toEqual(['0']);
    // مدیرِ دفتر فرم را بی‌مبلغ می‌فرستد.
    await setMembers(actor(MGR, ['member']), MINE, [{ userId: M, roleTagId: null, agreedAmount: '0', unitRate: '0', currencyId: null }]);
    const [row] = await db.select().from(projectMembers).where(eq(projectMembers.projectId, MINE));
    expect(Number(row!.agreedAmount)).toBe(700);
    expect((await getCardOptions(actor(MGR, ['member']))).canEditMoney).toBe(false);
  });
});
