import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, projectMembers, tags, unitEntries, userRoles, users } from '../schema';
import { addUnitEntry, MemberMoneyError } from '@/server/finance/member-service';
import { addProjectMember, createProject, setMembers, updateProject } from '@/server/projects/service';
import { getMyMoney } from '@/server/finance/my-money';
import type { Actor } from '@/domain/access/permissions';

/**
 * نوعِ دستمزدِ هر عضو (۲.۵۱.۰): روی یک پروژه یکی قراردادی، دیگری تعدادی.
 * نوعِ پروژه فقط پیش‌فرض است و ردیف‌های قدیمی (خالی) همان رفتارِ قبلی را دارند.
 */

let OWNER = 0, FIXED = 0, UNIT = 0, ROLE = 0, ROLE2 = 0, EUR = 0, PROJ = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => as(OWNER, ['owner']);

const base = {
  description: '', regDate: null, deadline: null, statusTagId: null, price: '0', currencyId: null,
  officeId: null, parentId: null, isTender: false, scope: 'company' as const,
};

const reason = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e) { return e instanceof MemberMoneyError ? e.reason : 'other'; }
};
const entry = (userId: number, projectId = PROJ) =>
  addUnitEntry(owner(), { projectId, userId, entryDate: '2026-11-01', quantity: 3, note: '' });
const typesOf = async (projectId: number) => (await db
  .select({ userId: projectMembers.userId, payType: projectMembers.payType, agreed: projectMembers.agreedAmount })
  .from(projectMembers).where(eq(projectMembers.projectId, projectId)).orderBy(projectMembers.id));

beforeAll(async () => {
  await sql`truncate table unit_entries, project_members, projects, user_roles, tags, currencies, audit_log, notifications, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'o@p', name: 'مالک' }, { email: 'f@p', name: 'قراردادی' }, { email: 'u@p', name: 'تعدادی' },
  ]).returning({ id: users.id });
  [OWNER, FIXED, UNIT] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: FIXED, role: 'member' }, { userId: UNIT, role: 'member' },
  ]);
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'Euro', isDefault: true }).returning({ id: currencies.id });
  EUR = c!.id;
  const r = await db.insert(tags).values([{ name: 'دولوپر', type: 'member_role' }, { name: 'دیزاینر', type: 'member_role' }])
    .returning({ id: tags.id });
  [ROLE, ROLE2] = r.map((x) => x.id) as [number, number];
  PROJ = await createProject(owner(), { ...base, title: 'Mixed', isUnitBased: false });
});

describe('ذخیرهٔ نوع', () => {
  it('پروژهٔ قراردادی: عضوِ هم‌نوع خالی، عضوِ تعدادی صریح ذخیره می‌شود', async () => {
    await setMembers(owner(), PROJ, [
      { userId: FIXED, roleTagId: ROLE, agreedAmount: '500', unitRate: '0', currencyId: EUR, payType: 'fixed' },
      { userId: UNIT, roleTagId: ROLE, agreedAmount: '0', unitRate: '10', currencyId: EUR, payType: 'unit' },
    ]);
    expect((await typesOf(PROJ)).map((m) => [m.userId, m.payType])).toEqual([[FIXED, null], [UNIT, 'unit']]);
  });

  it('ذخیرهٔ دوباره با همان داده چیزی را عوض نمی‌کند', async () => {
    const diff = await setMembers(owner(), PROJ, [
      { userId: FIXED, roleTagId: ROLE, agreedAmount: '500', unitRate: '0', currencyId: EUR, payType: 'fixed' },
      { userId: UNIT, roleTagId: ROLE, agreedAmount: '0', unitRate: '10', currencyId: EUR, payType: 'unit' },
    ]);
    expect(diff.toUpdate).toHaveLength(0);
  });

  it('عضوِ دو-نقشه یک نوع دارد — نوعِ اولین ردیفش', async () => {
    await setMembers(owner(), PROJ, [
      { userId: FIXED, roleTagId: ROLE, agreedAmount: '500', unitRate: '0', currencyId: EUR, payType: 'fixed' },
      { userId: UNIT, roleTagId: ROLE, agreedAmount: '0', unitRate: '10', currencyId: EUR, payType: 'unit' },
      { userId: UNIT, roleTagId: ROLE2, agreedAmount: '0', unitRate: '10', currencyId: EUR, payType: 'fixed' },
    ]);
    const rows = (await typesOf(PROJ)).filter((m) => m.userId === UNIT);
    expect(rows.map((m) => m.payType)).toEqual(['unit', 'unit']);
  });

  it('افزودنِ سریعِ نقشِ تازه نوعِ ردیف‌های قبلیِ همان نفر را می‌گیرد', async () => {
    await setMembers(owner(), PROJ, [
      { userId: FIXED, roleTagId: ROLE, agreedAmount: '500', unitRate: '0', currencyId: EUR, payType: 'fixed' },
      { userId: UNIT, roleTagId: ROLE, agreedAmount: '0', unitRate: '10', currencyId: EUR, payType: 'unit' },
    ]);
    await addProjectMember(owner(), PROJ, { userId: UNIT, roleTagId: ROLE2, agreedAmount: '0', unitRate: '10', currencyId: EUR, payType: 'fixed' });
    const rows = (await typesOf(PROJ)).filter((m) => m.userId === UNIT);
    expect(rows.map((m) => m.payType)).toEqual(['unit', 'unit']);
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, PROJ), eq(projectMembers.roleTagId, ROLE2)));
  });
});

describe('کارکرد', () => {
  it('عضوِ تعدادی روی پروژهٔ قراردادی کارکرد می‌گیرد، با نرخِ خودش', async () => {
    const id = await entry(UNIT);
    const [row] = await db.select({ amount: unitEntries.amount }).from(unitEntries).where(eq(unitEntries.id, id));
    expect(row!.amount).toBe('30.0000');
  });

  it('عضوِ قراردادی کارکرد نمی‌گیرد', async () => {
    expect(await reason(entry(FIXED))).toBe('not_unit_based');
  });

  it('روی پروژهٔ تعدادی، عضوِ قراردادیِ صریح هم کارکرد نمی‌گیرد', async () => {
    const unitProject = await createProject(owner(), { ...base, title: 'Unit', isUnitBased: true });
    await setMembers(owner(), unitProject, [
      { userId: FIXED, roleTagId: ROLE, agreedAmount: '800', unitRate: '0', currencyId: EUR, payType: 'fixed' },
      { userId: UNIT, roleTagId: ROLE, agreedAmount: '0', unitRate: '5', currencyId: EUR, payType: 'unit' },
    ]);
    expect((await typesOf(unitProject)).map((m) => m.payType)).toEqual(['fixed', null]);
    expect(await reason(entry(FIXED, unitProject))).toBe('not_unit_based');
    expect(await entry(UNIT, unitProject)).toBeGreaterThan(0);
  });
});

describe('مالیِ من', () => {
  it('هر عضو نوعِ خودش را می‌بیند', async () => {
    const fixed = (await getMyMoney(as(FIXED, ['member']))).memberProjects.find((p) => p.projectId === PROJ)!;
    const unit = (await getMyMoney(as(UNIT, ['member']))).memberProjects.find((p) => p.projectId === PROJ)!;
    expect(fixed.isUnitBased).toBe(false);
    expect(fixed.agreed).toBe('500.00');
    expect(unit.isUnitBased).toBe(true);
    expect(unit.unitUnpaid).toBe('30.00');
  });
});

describe('تغییرِ نوعِ پروژه', () => {
  it('عضوِ خالی با پروژه عوض می‌شود، عضوِ صریح نه', async () => {
    await updateProject(owner(), PROJ, { ...base, title: 'Mixed', isUnitBased: true });
    // UNIT صریحاً تعدادی بود؛ حالا هم‌نوعِ پروژه است ولی مقدارش تا ذخیرهٔ بعدی می‌ماند.
    expect(await entry(UNIT)).toBeGreaterThan(0);
    // FIXED خالی بود و حالا با پروژه تعدادی شده است.
    expect(await reason(entry(FIXED))).toBe(null);
  });
});
