import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  accounts, currencies, exchangeRates, ledger, paymentRequests, projectClients, projectMembers,
  projectPayments, projects, unitEntries, userRoles, users,
} from '../schema';
import { getMyMoney, hasPersonalMoney, myMoneyTotals } from '@/server/finance/my-money';
import type { Actor } from '@/domain/access/permissions';

/**
 * «مالیِ من» — پورتِ `view_finance()`: صورت‌حسابِ کارفرما و دریافتی‌های عضو
 * روی همهٔ پروژه‌ها، پرداخت‌های بی‌پروژه، و ردیف‌های کارکردِ تعدادی.
 */

const OWNER = 1, MEMBER = 2, CLIENT = 3;
const actor = (id: number, roles: Actor['roles']): Actor =>
  ({ id, roles, permissions: [], privateAccess: false });

let eur: number, usd: number;
let normal: number, unitBased: number, clientProject: number;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, project_payments, payment_requests, unit_entries,
    project_members, project_clients, accounts, exchange_rates, projects, user_roles, users,
    currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'USD', name: 'دلار', symbol: '$' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id; usd = c[1]!.id;
  // ۱ دلار = ۰٫۵ یورو — برای ستونِ «معادل (محاسبه)».
  await db.insert(exchangeRates).values({
    fromCurrencyId: usd, toCurrencyId: eur, rate: '0.5', effectiveDate: '2026-01-01',
  });

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm@t', name: 'عضو' }, { email: 'c@t', name: 'کارفرما' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: MEMBER, role: 'member' }, { userId: CLIENT, role: 'client' },
  ]);

  const p = await db.insert(projects).values([
    { title: 'قراردادی', price: '1000', currencyId: eur },
    { title: 'تعدادی', price: '0', currencyId: eur, isUnitBased: true },
    { title: 'پروژهٔ کارفرما', price: '2000', currencyId: eur },
  ]).returning({ id: projects.id });
  normal = p[0]!.id; unitBased = p[1]!.id; clientProject = p[2]!.id;

  await db.insert(projectMembers).values([
    { projectId: normal, userId: MEMBER, agreedAmount: '600', currencyId: eur },
    { projectId: unitBased, userId: MEMBER, agreedAmount: '0', unitRate: '10', currencyId: eur },
  ]);
  await db.insert(projectClients).values({ projectId: clientProject, userId: CLIENT });

  const [acc] = await db.insert(accounts).values({
    name: 'بانک', type: 'business', currencyId: eur,
  }).returning({ id: accounts.id });

  // ردیفِ دفتر با رسید — پرداختِ ۲۰۰ یورو به عضو.
  const [row] = await db.insert(ledger).values({
    accountId: acc!.id, entryDate: '2026-03-01', direction: 'out', description: 'علی‌الحساب',
    amount: '200', currencyId: eur, amountAccount: '200', receiptIds: [7], createdBy: OWNER,
  }).returning({ id: ledger.id });

  await db.insert(projectPayments).values([
    {
      projectId: normal, userId: MEMBER, ledgerId: row!.id, direction: 'member_payout',
      amount: '200', currencyId: eur, paidAt: '2026-03-01', note: 'علی‌الحساب',
    },
    // پرداختِ بی‌پروژه (پروژه‌اش جدا شده) — باید در بخشِ خودش بیاید.
    {
      projectId: null, userId: MEMBER, direction: 'member_payout',
      amount: '50', currencyId: eur, paidAt: '2026-02-01', note: 'تسویهٔ متفرقه',
    },
    // کارفرما: یک دریافتیِ دلاری (۳۰۰ دلار = ۱۵۰ یورو) و یک هزینهٔ قابلِ صورت‌حساب.
    {
      projectId: clientProject, userId: CLIENT, direction: 'incoming',
      amount: '300', currencyId: usd, paidAt: '2026-03-02', note: 'پیش‌پرداخت',
    },
    {
      projectId: clientProject, userId: OWNER, direction: 'project_expense',
      amount: '100', currencyId: eur, paidAt: '2026-03-03', note: 'هاست',
    },
    // ⚠️ پرداختِ عضو روی پروژهٔ کارفرما نباید در صورت‌حسابِ کارفرما دیده شود.
    {
      projectId: clientProject, userId: MEMBER, direction: 'member_payout',
      amount: '400', currencyId: eur, paidAt: '2026-03-04', note: 'حقوق',
    },
  ]);

  await db.insert(paymentRequests).values({
    projectId: normal, userId: MEMBER, amount: '100', currencyId: eur, status: 'pending',
  });

  await db.insert(unitEntries).values([
    { projectId: unitBased, userId: MEMBER, entryDate: '2026-03-05', quantity: '3', amount: '30', currencyId: eur, status: 'paid' },
    { projectId: unitBased, userId: MEMBER, entryDate: '2026-03-06', quantity: '2', amount: '20', currencyId: eur, status: 'unpaid' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('مالیِ من — عضو', () => {
  it('هر پروژه یک ردیف: قرارداد، پرداختی، مانده، وضعیت و ردیف‌های پرداخت با رسید', async () => {
    const data = await getMyMoney(actor(MEMBER, ['member']));

    expect(data.isMember).toBe(true);
    expect(data.clientProjects).toEqual([]);

    const row = data.memberProjects.find((p) => p.projectId === normal)!;
    expect(row.agreed).toBe('600.00');
    expect(row.paid).toBe('200.00');
    expect(row.remaining).toBe('400.00');
    expect(row.status).toBe('partial');
    expect(row.currencyCode).toBe('EUR');
    expect(row.payouts).toHaveLength(1);
    expect(row.payouts[0]!.receiptId).toBe(7);
    expect(row.requests.map((r) => [r.amount, r.status])).toEqual([['100.0000', 'pending']]);

    // پروژهٔ تعدادی: جمعِ پرداخت‌شده و پرداخت‌نشدهٔ ردیف‌های کارکرد.
    const units = data.memberProjects.find((p) => p.projectId === unitBased)!;
    expect(units.isUnitBased).toBe(true);
    expect(units.unitPaid).toBe('30.00');
    expect(units.unitUnpaid).toBe('20.00');
    expect(units.units).toHaveLength(2);
  });

  it('پرداختِ بی‌پروژه جدا فهرست می‌شود و در هیچ پروژه‌ای دوباره نمی‌آید', async () => {
    const data = await getMyMoney(actor(MEMBER, ['member']));
    expect(data.noProjectPayouts.map((p) => p.amount)).toEqual(['50.0000']);
    expect(data.memberProjects.flatMap((p) => p.payouts)).toHaveLength(1);
  });

  it('ماندهٔ کارتِ داشبورد به تفکیکِ ارز جمع می‌شود', async () => {
    const totals = await myMoneyTotals(actor(MEMBER, ['member']));
    // ۴۰۰ ماندهٔ قرارداد + ۲۰ کارکردِ پرداخت‌نشده.
    expect(totals.member).toEqual([{ currencyCode: 'EUR', total: '420.00' }]);
    expect(totals.client).toEqual([]);
  });
});

describe('مالیِ من — کارفرما', () => {
  it('بدهی = قیمت + هزینهٔ قابلِ صورت‌حساب؛ معادلِ ردیفِ ارزی محاسبه می‌شود', async () => {
    const data = await getMyMoney(actor(CLIENT, ['client']));

    expect(data.memberProjects).toEqual([]);
    const row = data.clientProjects[0]!;
    expect(row.price).toBe('2000.0000');
    expect(row.billableExpenses).toBe('100.00');
    expect(row.totalDue).toBe('2100.00');
    // ۳۰۰ دلار در ارزِ پروژه (یورو) = ۱۵۰ — جمعِ خام نیست.
    expect(row.paid).toBe('150.00');
    expect(row.remaining).toBe('1950.00');
    expect(row.status).toBe('partial');

    // ⚠️ پرداختِ عضو در صورت‌حسابِ کارفرما نیست.
    expect(row.payments).toHaveLength(1);
    expect(row.expenses).toHaveLength(1);
    // ۳۰۰ دلار در ارزِ پروژه (یورو) = ۱۵۰.
    expect(Number(row.payments[0]!.counted)).toBe(150);
  });
});

describe('گاردِ صفحه', () => {
  it('مالکِ بدونِ نقشِ عضو/کارفرما چیزی برای دیدن ندارد', async () => {
    expect(hasPersonalMoney(actor(OWNER, ['owner']))).toBe(false);
    const data = await getMyMoney(actor(OWNER, ['owner']));
    expect(data).toMatchObject({ memberProjects: [], clientProjects: [] });
  });
});
