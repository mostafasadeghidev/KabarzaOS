import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  currencies, exchangeRates, users, userRoles, projects, projectMembers, projectClients, projectPayments,
  accounts, absences,
} from '../schema';
import {
  getAccountsReport, getAttendanceReport, getClientsReport, getMembersReport, getOverall,
} from '@/server/reports/service';
import type { Actor } from '@/domain/access/permissions';

/** گزارش‌های چندارزی — پورتِ member_rows / client_rows / rate_banner. */

const OWNER = 1, M1 = 2, M2 = 3, C1 = 4;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });

beforeAll(async () => {
  await sql`truncate table audit_log, absences, ledger, accounts, project_payments, project_members,
    project_clients, projects, exchange_rates, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال', decimals: 0 },
    // ⚠️ فعال ولی بی‌نرخ — باید در نوار «غایب» بیاید.
    { code: 'USD', name: 'دلار', symbol: '$' },
  ]).returning({ id: currencies.id });
  const [eur, irr] = [c[0]!.id, c[1]!.id];
  // نرخِ کهنه (بیش از ۷ روز).
  await db.insert(exchangeRates).values([
    { fromCurrencyId: eur, toCurrencyId: irr, rate: '50000', effectiveDate: '2026-08-01' },
    { fromCurrencyId: irr, toCurrencyId: eur, rate: '0.00002', effectiveDate: '2026-08-01' },
  ]);

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'm1@t', name: 'عضوِ فعال' },
    { email: 'm2@t', name: 'عضوِ سابقِ تسویه‌شده', memberState: 'finance' },
    { email: 'c1@t', name: 'کارفرما' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }, { userId: M2, role: 'member' }, { userId: C1, role: 'client' },
  ]);

  const p = await db.insert(projects).values([
    { title: 'یورویی', price: '2000', currencyId: eur },
    { title: 'ریالی', price: '10000000', currencyId: irr },
  ]).returning({ id: projects.id });
  const [p1, p2] = [p[0]!.id, p[1]!.id];
  await db.insert(projectClients).values([{ projectId: p1, userId: C1 }, { projectId: p2, userId: C1 }]);
  await db.insert(projectMembers).values([
    { projectId: p1, userId: M1, agreedAmount: '1000', currencyId: eur },
    { projectId: p2, userId: M1, agreedAmount: '5000000', currencyId: irr },
    { projectId: p1, userId: M2, agreedAmount: '100', currencyId: eur },
  ]);
  await db.insert(projectPayments).values([
    // ⚠️ اضافه‌پرداختِ یورویی — نباید بدهیِ ریالی را بخورد.
    { projectId: p1, userId: M1, direction: 'member_payout', amount: '1200', currencyId: eur, amountEur: '1200' },
    { projectId: p1, userId: M2, direction: 'member_payout', amount: '100', currencyId: eur, amountEur: '100' },
    { projectId: p1, direction: 'incoming', amount: '300', currencyId: eur, amountEur: '300' },
    { projectId: p2, direction: 'project_expense', amount: '1000000', currencyId: irr, amountEur: '20' },
    { projectId: p2, direction: 'incoming', amount: '2000000', currencyId: irr, amountEur: '40' },
  ]);
  await db.insert(accounts).values([
    { name: 'یورو', currencyId: eur, openingBalance: '100' },
    { name: 'ریال', currencyId: irr, openingBalance: '1000000' },
  ]);
  await db.insert(absences).values([
    { userId: M1, fromDate: '2026-01-01', toDate: '2026-01-05', note: 'گذشته' },
    { userId: M1, fromDate: '2099-01-01', toDate: '2099-01-05', note: 'آینده' },
    { userId: C1, fromDate: '2099-02-01', toDate: '2099-02-05', note: 'کارفرما' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('اعضا — بدهی به‌ازای هر ارز (پورتِ member_rows)', () => {
  it('⚠️ اضافه‌پرداختِ یورویی بدهیِ ریالی را نمی‌خورد؛ سابقِ تسویه‌شده پنهان است', async () => {
    const rows = await getMembersReport(owner());
    expect(rows.map((r) => r.id)).toEqual([M1]);
    const m1 = rows[0]!;
    expect(Number(m1.remaining)).toBe(100);
    expect(Number(m1.agreed)).toBe(1100);
    expect(Number(m1.paid)).toBe(1200);
    expect(m1.projects).toBe(2);
    expect(m1.byCurrency.map((l) => [l.code, Number(l.debt)])).toEqual([['EUR', 0], ['IRR', 5_000_000]]);
  });
});

describe('گزارشِ کلی — سود و نوارِ نرخ', () => {
  it('سود = ارزشِ پروژه‌ها − تعهدِ همهٔ اعضا (سابق هم)؛ بدهی از کف‌های خطی', async () => {
    const o = await getOverall(owner());
    expect(Number(o.totalValue)).toBe(2200);
    expect(Number(o.memberAgreed)).toBe(1200);
    expect(Number(o.memberDebt)).toBe(100);
    expect(Number(o.profit)).toBe(1000);
  });

  it('نوارِ نرخ: مستقیم، کهنه و غایب', async () => {
    const o = await getOverall(owner());
    expect(o.rates.visible).toBe(true);
    expect(o.rates.shown).toEqual(['1 EUR = 50000 IRR']);
    expect(o.rates.stale).toEqual(['IRR']);
    expect(o.rates.missing).toEqual(['USD']);
  });
});

describe('کارفرمایان — طلب به‌ازای هر ارز (پورتِ client_rows)', () => {
  it('صورتحساب = قیمت + هزینه‌ها در ارزِ پروژه؛ طلب کف‌بندی و جمعِ یورو', async () => {
    const rows = await getClientsReport(owner());
    expect(rows).toHaveLength(1);
    const c = rows[0]!;
    expect(c.projectCount).toBe(2);
    // یورو: ۲۰۰۰ − ۳۰۰ = ۱۷۰۰؛ ریال: (۱۰٬۰۰۰٬۰۰۰ + ۱٬۰۰۰٬۰۰۰) − ۲٬۰۰۰٬۰۰۰ = ۹٬۰۰۰٬۰۰۰ → ۱۸۰ یورو.
    expect(Number(c.due)).toBeCloseTo(1880, 6);
    expect(Number(c.billed)).toBeCloseTo(2220, 6);
    expect(c.byCurrency.map((l) => [l.code, Number(l.due)])).toEqual([['EUR', 1700], ['IRR', 9_000_000]]);
    expect(c.isFormer).toBe(false);
  });
});

describe('حساب‌ها و حضور', () => {
  it('معادلِ یوروی مانده برای نقدینگیِ کل', async () => {
    const rows = await getAccountsReport(owner());
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(Number(byName.get('یورو')!.balanceEur)).toBe(100);
    expect(Number(byName.get('ریال')!.balanceEur)).toBe(20);
  });

  it('مرخصی‌ها: فقط اعضا و فقط آینده، صعودی', async () => {
    const a = await getAttendanceReport(owner());
    expect(a.leaves.map((l) => l.note)).toEqual(['آینده']);
  });
});
