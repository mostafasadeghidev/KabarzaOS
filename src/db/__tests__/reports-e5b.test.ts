import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  currencies, users, userRoles, userOffices, offices, projects, projectMembers, projectClients,
  accounts, ledger, vendors, timelogs, unitEntries,
} from '../schema';
import {
  getAccountsReport, getClientsReport, getExpensesReport, getHoursReport, getMembersReport,
  getOverall, getProjectsReport, getUnitsReport, reportClosingDates,
} from '@/server/reports/service';
import { closingDates } from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** فیلترِ دفتر، بازهٔ هزینه‌ها، ساعت به‌ازای عضو — پورتِ office_scope / expenses_summary / hours_report. */

const OWNER = 1, M1 = 2, M2 = 3, C1 = 4;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const reportsOnly = (): Actor => ({ id: 9, roles: ['member'], permissions: ['reports.view'], privateAccess: false });

let O1 = 0, O2 = 0, P1 = 0, P2 = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, unit_entries, timelogs, ledger, accounts, vendors, project_members,
    project_clients, projects, user_offices, user_roles, users, offices, currencies, fiscal_closings
    restart identity cascade`;

  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  const o = await db.insert(offices).values([{ name: 'تهران' }, { name: 'برلین' }]).returning({ id: offices.id });
  [O1, O2] = [o[0]!.id, o[1]!.id];

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'عضوِ تهران' },
    { email: 'm2@t', name: 'عضوِ برلین' }, { email: 'c1@t', name: 'کارفرما' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }, { userId: M2, role: 'member' }, { userId: C1, role: 'client' },
  ]);
  await db.insert(userOffices).values([{ userId: M1, officeId: O1 }, { userId: M2, officeId: O2 }]);

  const p = await db.insert(projects).values([
    { title: 'پروژهٔ تهران', price: '1000', currencyId: eur!.id, officeId: O1 },
    { title: 'پروژهٔ برلین', price: '500', currencyId: eur!.id, officeId: O2 },
    { title: 'بی‌دفتر', price: '100', currencyId: eur!.id },
  ]).returning({ id: projects.id });
  [P1, P2] = [p[0]!.id, p[1]!.id];
  await db.insert(projectClients).values([{ projectId: P1, userId: C1 }, { projectId: P2, userId: C1 }]);
  await db.insert(projectMembers).values([
    // عضوِ تهران روی پروژهٔ برلین هم قرارداد دارد — فیلترِ دفتر عضومحور است.
    { projectId: P1, userId: M1, agreedAmount: '300', currencyId: eur!.id },
    { projectId: P2, userId: M1, agreedAmount: '200', currencyId: eur!.id },
    { projectId: P2, userId: M2, agreedAmount: '50', currencyId: eur!.id },
  ]);
  await db.insert(timelogs).values([
    { projectId: P1, userId: M1, logDate: '2026-06-01', minutes: 60 },
    { projectId: P2, userId: M1, logDate: '2026-06-02', minutes: 10 },
    { projectId: null, userId: M1, logDate: '2026-06-03', minutes: 30 },
    { projectId: P2, userId: M2, logDate: '2026-06-04', minutes: 120 },
  ]);

  const a = await db.insert(accounts).values([
    { name: 'فعال', currencyId: eur!.id, openingBalance: '0' },
    { name: 'بایگانی', currencyId: eur!.id, openingBalance: '0', isActive: false },
  ]).returning({ id: accounts.id });
  const [v] = await db.insert(vendors).values({ name: 'هاست' }).returning({ id: vendors.id });
  await db.insert(ledger).values([
    { accountId: a[0]!.id, createdBy: 1, direction: 'out', amount: '100', amountAccount: '100', currencyId: eur!.id, amountEur: '100', entryDate: '2026-09-01', description: 'سرور', vendorId: v!.id },
    { accountId: a[0]!.id, createdBy: 1, direction: 'out', amount: '50', amountAccount: '50', currencyId: eur!.id, amountEur: '50', entryDate: '2026-08-15', description: 'متفرقه' },
    { accountId: a[0]!.id, createdBy: 1, direction: 'out', amount: '25', amountAccount: '25', currencyId: eur!.id, amountEur: '25', entryDate: '2026-07-01', description: 'قدیمی', vendorId: v!.id },
    { accountId: a[0]!.id, createdBy: 1, direction: 'in', amount: '500', amountAccount: '500', currencyId: eur!.id, amountEur: '500', entryDate: '2026-09-01', description: 'دریافتی' },
  ]);
  await db.insert(unitEntries).values([
    { projectId: P1, userId: M1, entryDate: '2026-06-01', quantity: '1', amount: '10', currencyId: eur!.id, status: 'paid' },
    { projectId: P1, userId: M1, entryDate: '2026-06-02', quantity: '1', amount: '30', currencyId: eur!.id, status: 'unpaid' },
    { projectId: P2, userId: M2, entryDate: '2026-06-03', quantity: '1', amount: '5', currencyId: eur!.id, status: 'paid' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('فیلترِ دفتر (پورتِ office_scope)', () => {
  it('کلی: ارزشِ پروژه‌ها پروژه‌محور، تعهدِ اعضا عضومحور (همهٔ پروژه‌های عضوِ دفتر)', async () => {
    const o = await getOverall(owner(), { officeIds: [O1] });
    expect(Number(o.totalValue)).toBe(1000);
    expect(o.projectCount).toBe(1);
    // عضوِ تهران: ۳۰۰ (تهران) + ۲۰۰ (برلین) — نه فقط قراردادِ پروژهٔ تهران.
    expect(Number(o.memberAgreed)).toBe(500);
    // ساعت با فیلترِ دفتر: فقط پروژه‌های همان دفتر (۶۰)، بدونِ عمومی.
    expect(o.minutes).toBe(60);
  });

  it('اعضا فقط عضوِ دفترهای انتخابی؛ کارفرمایان/پروژه‌ها فقط پروژه‌های همان دفتر', async () => {
    expect((await getMembersReport(owner(), { officeIds: [O1] })).map((r) => r.id)).toEqual([M1]);
    const clients = await getClientsReport(owner(), { officeIds: [O2] });
    expect(clients).toHaveLength(1);
    expect(clients[0]!.projectCount).toBe(1);
    expect(Number(clients[0]!.billed)).toBe(500);
    expect((await getProjectsReport(owner(), { officeIds: [O1] })).map((p) => p.id)).toEqual([P1]);
    // دفترِ بی‌پروژه: فهرستِ خالی، نه «همه».
    expect(await getProjectsReport(owner(), { officeIds: [999] })).toEqual([]);
  });

  it('بی‌فیلتر همه می‌آیند', async () => {
    const o = await getOverall(owner());
    expect(Number(o.totalValue)).toBe(1600);
    expect(o.minutes).toBe(220);
  });
});

describe('هزینه‌ها با بازه (پورتِ expenses_summary)', () => {
  it('جمع/تعداد/میانگین در بازه؛ به تفکیکِ طرف‌حساب (بی‌طرف‌حساب هم) و ماه با نوار', async () => {
    const e = await getExpensesReport(owner(), { from: '2026-08-01', to: '2026-09-30' });
    expect(Number(e.total)).toBe(150);
    expect(e.count).toBe(2);
    expect(e.months).toBe(2);
    expect(Number(e.avg)).toBe(75);
    expect(e.byVendor.map((v) => [v.label, v.count, Number(v.amount)])).toEqual([['هاست', 1, 100], ['', 1, 50]]);
    expect(e.byMonth.map((m) => [m.ym, m.pct])).toEqual([['2026-09', 100], ['2026-08', 50]]);
    // درآمدِ بازه کنارِ هزینه‌ها می‌ماند؛ ردیفِ تیر بیرونِ بازه است.
    expect(Number(e.totalIn)).toBe(500);
    expect(e.rows.some((r) => r.description === 'قدیمی')).toBe(false);
  });

  it('سرِ باز: فقط «از»', async () => {
    const e = await getExpensesReport(owner(), { from: '2026-07-01', to: '' });
    expect(Number(e.total)).toBe(175);
    expect(e.months).toBe(3);
  });
});

describe('ساعت به‌ازای عضو (پورتِ hours_report)', () => {
  it('ساعتِ پروژه + عمومی، پرکاراول؛ فیلترِ دفتر روی پروژه‌ها', async () => {
    const all = await getHoursReport(owner(), { from: '2026-06-01', to: '2026-06-30' });
    expect(all.map((r) => [r.userId, r.project, r.general, r.total])).toEqual([[M2, 120, 0, 120], [M1, 70, 30, 100]]);
    const tehran = await getHoursReport(owner(), { officeIds: [O1], from: '2026-06-01', to: '2026-06-30' });
    expect(tehran.map((r) => [r.userId, r.project, r.general])).toEqual([[M1, 60, 30]]);
    expect(await getHoursReport(owner(), { from: '2027-01-01', to: '2027-12-31' })).toEqual([]);
  });
});

describe('ریزه‌کاری‌های افزونه', () => {
  it('کارکردِ تعدادی پرمبلغ‌اول؛ حسابِ بایگانی در گزارش نیست', async () => {
    const units = await getUnitsReport(owner());
    expect(units.map((u) => [u.userId, Number(u.total)])).toEqual([[M1, 40], [M2, 5]]);
    expect((await getAccountsReport(owner())).map((a) => a.name)).toEqual(['فعال']);
  });

  it('دوره‌های بسته از صفحهٔ گزارش‌ها با مجوزِ گزارش، نه مالی', async () => {
    await expect(closingDates(reportsOnly())).rejects.toBeInstanceOf(ForbiddenError);
    expect(await reportClosingDates(reportsOnly())).toEqual([]);
  });
});
