import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  accounts, currencies, exchangeRates, ledger, projectClients, projectMembers, projectPayments,
  projects, unitEntries, userRoles, users,
} from '../schema';
import * as reports from '@/server/reports/service';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * گزارش‌ها روی دادهٔ **چندارزی** و پروژهٔ **چندکارفرمایی**.
 *
 * ⚠️ این فایل وجود نداشت؛ سه باگِ پولی که ممیزی پیدا کرد (جمعِ خامِ ارزها،
 * شمارشِ دوبارهٔ پروژهٔ مشترک، حقوقِ اعضا در هزینه‌ها) دقیقاً همین‌جا
 * می‌افتادند.
 */
const owner = (): Actor => ({
  id: 1, roles: ['owner'], permissions: ['reports.view'] as Permission[], privateAccess: true,
});

let eur: number, irr: number, clientA: number, clientB: number, member: number, project: number;

beforeAll(async () => {
  await sql`truncate table audit_log, unit_entries, project_payments, ledger, accounts,
    project_clients, project_members, projects, exchange_rates, user_roles, users, currencies
    restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال' },
  ]).returning({ id: currencies.id });
  [eur, irr] = c.map((r) => r.id) as [number, number];
  // ۱ ریال = ۰٫۰۰۰۰۲ یورو → ۱٬۰۰۰٬۰۰۰ ریال = ۲۰ یورو
  await db.insert(exchangeRates).values({
    fromCurrencyId: irr, toCurrencyId: eur, rate: '0.00002', effectiveDate: '2026-01-01',
  });

  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'a@t', name: 'کارفرمای اول' },
    { email: 'b@t', name: 'کارفرمای دوم' },
    { email: 'm@t', name: 'عضو' },
  ]).returning({ id: users.id });
  [, clientA, clientB, member] = u.map((r) => r.id) as [number, number, number, number];
  await db.insert(userRoles).values([
    { userId: u[0]!.id, role: 'owner' },
    { userId: clientA, role: 'client' },
    { userId: clientB, role: 'client' },
    { userId: member, role: 'member' },
  ]);

  const p = await db.insert(projects)
    .values({ title: 'پروژهٔ ریالی', price: '1000000', currencyId: irr })
    .returning({ id: projects.id });
  project = p[0]!.id;
  // ترتیبِ انتساب مهم است: اول A، بعد B → A کارفرمای اصلی است.
  await db.insert(projectClients).values({ projectId: project, userId: clientA });
  await db.insert(projectClients).values({ projectId: project, userId: clientB });
  await db.insert(projectMembers).values({
    projectId: project, userId: member, agreedAmount: '5000000', currencyId: irr,
  });

  const a = await db.insert(accounts)
    .values({ name: 'حساب', currencyId: eur, openingBalance: '0' })
    .returning({ id: accounts.id });
  const account = a[0]!.id;

  // دریافتی از کارفرما: ۵ یورو (ستونِ منجمدِ amount_eur).
  await db.insert(projectPayments).values({
    projectId: project, userId: clientA, direction: 'incoming', paidAt: '2026-08-01',
    amount: '5', currencyId: eur, amountEur: '5',
  });

  // یک پرداخت به عضو (۳۰) و یک هزینهٔ واقعی (۱۲) — هر دو ردیفِ دفتر.
  const l = await db.insert(ledger).values([
    {
      accountId: account, createdBy: 1, entryDate: '2026-06-01', direction: 'out', description: 'حقوق',
      amount: '30', currencyId: eur, amountAccount: '30', amountOffice: '30', amountEur: '30', exchangeRate: '1',
    },
    {
      accountId: account, createdBy: 1, entryDate: '2026-06-02', direction: 'out', description: 'هاستینگ',
      amount: '12', currencyId: eur, amountAccount: '12', amountOffice: '12', amountEur: '12', exchangeRate: '1',
    },
  ]).returning({ id: ledger.id });
  await db.insert(projectPayments).values({
    projectId: project, userId: member, ledgerId: l[0]!.id, direction: 'member_payout', paidAt: '2026-08-01',
    amount: '30', currencyId: eur, amountEur: '30',
  });

  // کارکردِ تعدادی به ریال — باید تبدیل شود، نه خام جمع زده شود.
  await db.insert(unitEntries).values({
    projectId: project, userId: member, entryDate: '2026-06-03', quantity: '1',
    amount: '500000', currencyId: irr, status: 'unpaid',
  });
});

afterAll(async () => { await sql.end(); });

describe('ارزهای مخلوط به ارزِ پایه تبدیل می‌شوند', () => {
  it('گزارشِ کلی: قیمتِ ریالی ۲۰ یورو است، نه یک میلیون', async () => {
    const r = await reports.getOverall(owner());
    expect(r.totalValue).toBe('20.00');
    expect(r.memberAgreed).toBe('100.00');
    expect(r.clientPaid).toBe('5.00');
    expect(r.rateMissing).toBe(0);
  });

  it('گزارشِ اعضا: توافقیِ ریالی به یورو', async () => {
    const rows = await reports.getMembersReport(owner());
    const row = rows.find((r) => Number(r.id) === member)!;
    expect(row.agreed).toBe('100.00');
    expect(row.paid).toBe('30.00');
    // ⚠️ پورتِ افزونه (member_rows): بدهی به‌ازای هر ارز کف‌بندی می‌شود — پرداختِ یورویی
    // بدهیِ ریالی را نمی‌کاهد؛ ۵٬۰۰۰٬۰۰۰ ریال بدهی (= ۱۰۰ یورو) می‌ماند و یورو اضافه‌پرداخت است.
    expect(row.remaining).toBe('100.00');
    expect(row.byCurrency.map((l) => [l.code, Number(l.debt)])).toEqual([['EUR', 0], ['IRR', 5_000_000]]);
  });

  it('کارکردِ تعدادی: ریال به یورو', async () => {
    const rows = await reports.getUnitsReport(owner());
    expect(rows.find((r) => r.userId === member)!.unpaid).toBe('10.00');
  });
});

describe('پروژهٔ چندکارفرمایی فقط به کارفرمای اصلی صورتحساب می‌شود', () => {
  it('گزارشِ مطالبات: A بدهکار است، B صفر — و جمع دو برابر نمی‌شود', async () => {
    const rows = await reports.getClientsReport(owner());
    const a = rows.find((r) => r.id === clientA)!;
    const b = rows.find((r) => r.id === clientB)!;
    expect(a.price).toBe('20.00');
    expect(a.paid).toBe('5.00');
    expect(a.due).toBe('15.00');
    expect(b.projectCount).toBe(1);
    expect(b.price).toBe('0.00');
    expect(b.due).toBe('0.00');
  });

  it('صفحهٔ کارفرمای دوم پروژه را «مشترک» و با صفر نشان می‌دهد', async () => {
    const detail = await reports.getClientDetail(owner(), clientB);
    expect(detail!.projects[0]!.shared).toBe(true);
    expect(detail!.projects[0]!.remaining).toBe('0.00');
    const primary = await reports.getClientDetail(owner(), clientA);
    expect(primary!.projects[0]!.shared).toBe(false);
    // پورتِ افزونه: ردیفِ ریزِ کارفرما در ارزِ **خودِ پروژه** است (ریال)، نه یورو.
    expect(primary!.projects[0]!.price).toBe('1000000.00');
    expect(primary!.projects[0]!.currencyCode).toBe('IRR');
  });
});

describe('هزینه‌ها حقوقِ اعضا را نمی‌شمارند', () => {
  it('پرداخت به عضو در هزینه‌ها نیست — جایش تبِ بدهی به اعضاست', async () => {
    const r = await reports.getExpensesReport(owner());
    expect(Number(r.totalOut)).toBe(12);
    expect(r.rows.map((x) => x.description)).toEqual(['هاستینگ']);
  });
});
