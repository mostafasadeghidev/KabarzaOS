import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, projectMembers, projects, tags, unitEntries, userRoles, users } from '../schema';
import { addUnitEntry, MemberMoneyError, setUnitEntryAmount } from '@/server/finance/member-service';
import { createProject, updateProject } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * مبلغِ دستیِ ردیفِ پروژهٔ تعدادی (۲.۲۰.۰): مسئولِ پروژه می‌تواند مبلغ بزند یا
 * از نرخِ توافقی پیروی کند؛ عضوِ ساده هرگز؛ و فقط وقتی پروژه اجازه داده.
 */

let OWNER = 0, MEMBER = 0, ROLE = 0, EUR = 0, MANUAL = 0, PLAIN = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => as(OWNER, ['owner']);
const member = () => as(MEMBER, ['member']);

const base = {
  description: '', regDate: null, deadline: null, statusTagId: null, price: '0', currencyId: null,
  officeId: null, parentId: null, isTender: false, scope: 'company' as const,
};

const amountOf = async (id: number) => (await db.select({ a: unitEntries.amount, s: unitEntries.status }).from(unitEntries).where(eq(unitEntries.id, id)))[0]!;
const entry = (projectId: number, amount?: string, actor = owner()) =>
  addUnitEntry(actor, { projectId, userId: MEMBER, entryDate: '2026-10-10', quantity: 2, note: '', amount });
const reason = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e) { return e instanceof MemberMoneyError ? e.reason : 'other'; }
};

beforeAll(async () => {
  await sql`truncate table unit_entries, project_members, projects, user_roles, tags, currencies, audit_log, users restart identity cascade`;
  const u = await db.insert(users).values([{ email: 'o@n', name: 'مالک' }, { email: 'm@n', name: 'عضو' }]).returning({ id: users.id });
  [OWNER, MEMBER] = u.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: MEMBER, role: 'member' }]);
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'Euro', isDefault: true }).returning({ id: currencies.id });
  EUR = c!.id;
  const [r] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  ROLE = r!.id;

  MANUAL = await createProject(owner(), { ...base, title: 'Manual', isUnitBased: true, unitManualAmount: true });
  PLAIN = await createProject(owner(), { ...base, title: 'Plain', isUnitBased: true });
  for (const p of [MANUAL, PLAIN]) {
    await db.insert(projectMembers).values({ projectId: p, userId: MEMBER, roleTagId: ROLE, unitRate: '10', currencyId: EUR });
  }
});

describe('ثبتِ ردیف', () => {
  it('بی‌مبلغ از نرخِ توافقی پیروی می‌کند (تعداد × نرخ)', async () => {
    const id = await entry(MANUAL);
    expect((await amountOf(id)).a).toBe('20.0000');
  });

  it('مسئولِ پروژه با تیکِ پروژه می‌تواند مبلغ بزند', async () => {
    const id = await entry(MANUAL, '180');
    expect((await amountOf(id)).a).toBe('180.0000');
  });

  it('بدونِ تیکِ پروژه مبلغِ دستی رد می‌شود؛ بی‌مبلغ هنوز کار می‌کند', async () => {
    expect(await reason(entry(PLAIN, '180'))).toBe('amount_forbidden');
    expect((await amountOf(await entry(PLAIN))).a).toBe('20.0000');
  });

  it('عضوِ ساده برای خودش مبلغ نمی‌نویسد', async () => {
    expect(await reason(entry(MANUAL, '999', member()))).toBe('amount_forbidden');
  });

  it('مبلغِ نامعتبر رد می‌شود', async () => {
    expect(await reason(entry(MANUAL, '-4'))).toBe('amount_invalid');
    expect(await reason(entry(MANUAL, 'abc'))).toBe('amount_invalid');
  });
});

describe('ویرایشِ مبلغ', () => {
  it('ردیفِ پرداخت‌نشده عوض می‌شود و خالی‌گذاشتن به نرخِ توافقی برمی‌گرداند', async () => {
    const id = await entry(MANUAL, '50');
    await setUnitEntryAmount(owner(), id, '75.5');
    expect((await amountOf(id)).a).toBe('75.5000');
    await setUnitEntryAmount(owner(), id, '');
    expect((await amountOf(id)).a).toBe('20.0000');
  });

  it('عضو، پروژهٔ بی‌تیک و ردیفِ غیرپرداخت‌نشده رد می‌شوند', async () => {
    const id = await entry(MANUAL, '50');
    expect(await reason(setUnitEntryAmount(member(), id, '1'))).toBe('amount_forbidden');
    const plain = await entry(PLAIN);
    expect(await reason(setUnitEntryAmount(owner(), plain, '1'))).toBe('amount_forbidden');
    await db.update(unitEntries).set({ status: 'requested' }).where(eq(unitEntries.id, id));
    expect(await reason(setUnitEntryAmount(owner(), id, '1'))).toBe('not_editable');
    await db.update(unitEntries).set({ status: 'paid' }).where(eq(unitEntries.id, id));
    expect(await reason(setUnitEntryAmount(owner(), id, '1'))).toBe('not_editable');
  });
});

describe('تنظیمِ پروژه', () => {
  it('تیک ذخیره می‌شود، با برداشتنِ تعدادی‌بودن خاموش می‌شود و فراخوانِ قدیمی آن را نگه می‌دارد', async () => {
    const flag = async () => (await db.select({ f: projects.unitManualAmount }).from(projects).where(eq(projects.id, PLAIN)))[0]!.f;
    expect(await flag()).toBe(false);
    await updateProject(owner(), PLAIN, { ...base, title: 'Plain', isUnitBased: true, unitManualAmount: true });
    expect(await flag()).toBe(true);
    await updateProject(owner(), PLAIN, { ...base, title: 'Plain', isUnitBased: true });
    expect(await flag()).toBe(true);
    await updateProject(owner(), PLAIN, { ...base, title: 'Plain', isUnitBased: false, unitManualAmount: true });
    expect(await flag()).toBe(false);
  });
});
