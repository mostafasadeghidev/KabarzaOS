import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, exchangeRates, users, accounts, accountUsers, ledger, fiscalLocks, projects,
  projectMembers, projectPayments,
} from '../schema';
import * as service from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import { FiscalPeriodLockedError } from '@/domain/ledger/fiscal';
import { LedgerValidationError, TransferValidationError } from '@/domain/ledger/amounts';
import type { Actor, Permission } from '@/domain/access/permissions';

/** حسابداری از انتها تا انتها — سه گاردِ حیاتی. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const manager = () => actor({ id: 1, permissions: ['finance.manage', 'finance.view'] as Permission[] });
const viewer = () => actor({ id: 2, permissions: ['finance.view'] as Permission[] });
const owner = () => actor({ id: 1, roles: ['owner'] });

let eur: number, usd: number, eurAccount: number, usdAccount: number;
let privateAccount: number, projectId: number;

beforeAll(async () => {
  await sql`truncate table audit_log, project_payments, project_members, ledger, fiscal_locks,
    accounts, exchange_rates, projects, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'USD', name: 'دلار', symbol: '$' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id; usd = c[1]!.id;

  // ۱ دلار = ۰٫۹ یورو.
  await db.insert(exchangeRates).values({
    fromCurrencyId: usd, toCurrencyId: eur, rate: '0.9', effectiveDate: '2026-01-01',
  });

  await db.insert(users).values([
    { email: 'a@t', name: 'مدیر' },
    { email: 'b@t', name: 'حسابدارِ محدود' },
  ]);

  const a = await db.insert(accounts).values([
    { name: 'حسابِ یورو', currencyId: eur, openingBalance: '1000' },
    { name: 'حسابِ دلار', currencyId: usd, openingBalance: '0' },
    { name: 'حسابِ شخصی', currencyId: eur, scope: 'private' },
  ]).returning({ id: accounts.id });
  eurAccount = a[0]!.id; usdAccount = a[1]!.id; privateAccount = a[2]!.id;

  const p = await db.insert(projects).values({ title: 'پروژه', price: '0', currencyId: eur })
    .returning({ id: projects.id });
  projectId = p[0]!.id;

  // R-ACC-02 — حسابدارِ محدود فقط به حسابِ یورو تخصیص یافته است.
  await db.insert(accountUsers).values({ accountId: eurAccount, userId: 2 });
});

afterAll(async () => { await sql.end(); });

const entry = (over: Partial<service.EntryInput> = {}): service.EntryInput => ({
  accountId: eurAccount, entryDate: '2026-06-15', direction: 'in', amount: '500',
  currencyId: eur, description: '', projectId: null, categoryTagId: null,
  officeId: null, payerUserId: null, payerLabel: '', receiverUserId: null,
  receiverLabel: '', ...over,
});

describe('گاردِ ۱ — مجوزِ مالی', () => {
  it('بدونِ مجوز دفتر دیده نمی‌شود', async () => {
    await expect(service.getLedger(actor(), { accountId: eurAccount }))
      .rejects.toThrow(ForbiddenError);
  });

  it('کاربرِ خواندنی حسابِ تخصیص‌یافته را می‌بیند ولی نمی‌نویسد', async () => {
    const data = await service.getLedger(viewer(), { accountId: eurAccount });
    expect(data.canManage).toBe(false);
    await expect(service.createEntry(viewer(), entry())).rejects.toThrow(ForbiddenError);
  });

  it('⚠️ R-ACC-02 — حسابدارِ محدود حسابِ تخصیص‌نیافته را اصلاً نمی‌بیند', async () => {
    // بدونِ این، هر کسی با مجوزِ خواندنِ مالی مانده و تراکنشِ همهٔ حساب‌ها را می‌دید.
    await expect(service.getLedger(viewer(), { accountId: usdAccount }))
      .rejects.toThrow(service.LedgerNotFoundError);

    const list = await service.listAccounts(viewer());
    expect(list.map((a) => a.id)).toEqual([eurAccount]);
  });

  it('مدیرِ مالی همهٔ حساب‌ها را می‌بیند', async () => {
    const list = await service.listAccounts(manager());
    expect(list.length).toBeGreaterThan(1);
  });

  it('⚠️ حسابِ شخصی برای کاربرِ بی‌دسترسی «یافت نشد» است', async () => {
    await expect(service.getLedger(manager(), { accountId: privateAccount }))
      .rejects.toThrow(service.LedgerNotFoundError);
    await expect(service.getLedger(owner(), { accountId: privateAccount })).resolves.toBeDefined();
  });
});

describe('گاردِ ۳ — اعتبارسنجیِ ردیف', () => {
  it('⚠️ ردیفِ پروژه‌ای بدونِ توضیحات ثبت نمی‌شود', async () => {
    await expect(service.createEntry(manager(), entry({ projectId })))
      .rejects.toThrow(LedgerValidationError);
  });

  it('با توضیحات ثبت می‌شود', async () => {
    const id = await service.createEntry(manager(), entry({
      projectId, description: 'پیش‌پرداختِ کارفرما',
    }));
    expect(id).toBeGreaterThan(0);
  });

  it('مبلغِ صفر رد می‌شود', async () => {
    await expect(service.createEntry(manager(), entry({ amount: '0' })))
      .rejects.toThrow(LedgerValidationError);
  });
});

describe('R-LEDGER-02/03 — مانده و مبلغِ واقعی', () => {
  it('ردیفِ ارزِ دیگر با نرخ به ارزِ حساب تبدیل می‌شود', async () => {
    const id = await service.createEntry(manager(), entry({
      amount: '100', currencyId: usd, description: 'درآمدِ دلاری',
    }));
    const row = (await db.select().from(ledger).where(eq(ledger.id, id)))[0]!;
    expect(Number(row.amountAccount)).toBeCloseTo(90, 2);
  });

  it('⚠️ مبلغِ واقعاً رسیده بر نرخِ بازار مقدم است', async () => {
    // کارمزدِ انتقال این‌طور طبیعی ثبت می‌شود.
    const id = await service.createEntry(manager(), entry({
      amount: '100', currencyId: usd, amountAccountOverride: '85',
      description: 'با کارمزد',
    }));
    const row = (await db.select().from(ledger).where(eq(ledger.id, id)))[0]!;
    expect(Number(row.amountAccount)).toBe(85);
    expect(Number(row.exchangeRate)).toBeCloseTo(0.85, 4);
  });

  it('مانده از amount_account جمع می‌شود، نه amount', async () => {
    const data = await service.getLedger(manager(), { accountId: eurAccount });
    const expected = 1000 + Number(data.totals.in) - Number(data.totals.out);
    expect(Number(data.totals.balance)).toBeCloseTo(expected, 2);
    // ۵۰۰ + ۹۰ + ۸۵ = ۶۷۵ ورودی.
    expect(Number(data.totals.in)).toBeCloseTo(675, 2);
  });
});

describe('گاردِ ۲ — ⚠️ قفلِ دورهٔ مالی', () => {
  beforeAll(async () => {
    await db.insert(fiscalLocks).values({ lockDate: '2026-06-30', setBy: 1 });
  });

  it('ثبت در دورهٔ بسته ممنوع است', async () => {
    await expect(service.createEntry(manager(), entry({ entryDate: '2026-06-20' })))
      .rejects.toThrow(FiscalPeriodLockedError);
  });

  it('ثبت پس از تاریخِ قفل آزاد است', async () => {
    await expect(service.createEntry(manager(), entry({ entryDate: '2026-07-01' })))
      .resolves.toBeGreaterThan(0);
  });

  it('⚠️ حذفِ ردیفِ دورهٔ بسته هم ممنوع است', async () => {
    const locked = (await db.select().from(ledger).where(eq(ledger.entryDate, '2026-06-15')))[0]!;
    await expect(service.deleteEntry(manager(), locked.id)).rejects.toThrow(FiscalPeriodLockedError);
  });

  it('⚠️ ردیف را نمی‌شود از دورهٔ بسته «بیرون کشید»', async () => {
    // هم تاریخِ فعلی و هم تاریخِ جدید باید نوشتنی باشند.
    const locked = (await db.select().from(ledger).where(eq(ledger.entryDate, '2026-06-15')))[0]!;
    await expect(service.updateEntry(manager(), locked.id, entry({ entryDate: '2026-07-05' })))
      .rejects.toThrow(FiscalPeriodLockedError);
  });

  it('ردیفِ بازِ پس از قفل ویرایش می‌شود', async () => {
    const open = (await db.select().from(ledger).where(eq(ledger.entryDate, '2026-07-01')))[0]!;
    await service.updateEntry(manager(), open.id, entry({
      entryDate: '2026-07-02', amount: '77', description: 'ویرایش‌شده',
    }));
    const after = (await db.select().from(ledger).where(eq(ledger.id, open.id)))[0]!;
    expect(after.description).toBe('ویرایش‌شده');
  });
});

describe('R-LEDGER-04 — انتقالِ داخلی', () => {
  it('دو لِگِ جفت با گروهِ مشترک می‌سازد', async () => {
    const [outId, inId] = await service.transfer(manager(), {
      fromAccountId: eurAccount, toAccountId: usdAccount,
      fromAmount: '100', toAmount: '110', entryDate: '2026-07-10',
    });

    const outRow = (await db.select().from(ledger).where(eq(ledger.id, outId)))[0]!;
    const rows = await db.select().from(ledger)
      .where(eq(ledger.transferGroup, outRow.transferGroup!));
    expect(rows).toHaveLength(2);

    const inn = rows.find((r) => r.id === inId)!;
    expect(outRow.direction).toBe('out');
    expect(inn.direction).toBe('in');
    // ⚠️ هر لِگ در ارزِ حسابِ خودش.
    expect(outRow.currencyId).toBe(eur);
    expect(inn.currencyId).toBe(usd);
    expect(Number(inn.amountAccount)).toBe(110);
  });

  it('انتقال به خودِ حساب رد می‌شود', async () => {
    await expect(service.transfer(manager(), {
      fromAccountId: eurAccount, toAccountId: eurAccount,
      fromAmount: '10', toAmount: '10', entryDate: '2026-07-10',
    })).rejects.toThrow(TransferValidationError);
  });

  it('انتقال در دورهٔ بسته ممنوع است', async () => {
    await expect(service.transfer(manager(), {
      fromAccountId: eurAccount, toAccountId: usdAccount,
      fromAmount: '10', toAmount: '11', entryDate: '2026-06-10',
    })).rejects.toThrow(FiscalPeriodLockedError);
  });
});

/**
 * آینهٔ «پرداخت‌های پروژه».
 *
 * ⚠️ این تست‌ها یک شکافِ واقعی را پوشش می‌دهند: پیش از این، `createEntry`
 * فقط ردیفِ دفتر را می‌نوشت و هیچ‌چیز در `project_payments` نمی‌آمد — یعنی
 * مالیِ پروژه، فاکتور، تسویهٔ عضو و گزارش‌ها همه خالی می‌ماندند.
 */
describe('آینهٔ پرداختِ پروژه', () => {
  let memberUser: number, vendorUser: number, clientUser: number;

  const entry = (over: Partial<Parameters<typeof service.createEntry>[1]> = {}) => ({
    accountId: eurAccount,
    entryDate: '2026-05-10',
    direction: 'out' as const,
    amount: '100',
    currencyId: eur,
    amountAccountOverride: null,
    description: 'پرداختِ آزمون',
    projectId,
    categoryTagId: null,
    officeId: null,
    payerUserId: null,
    payerLabel: '',
    receiverUserId: null,
    receiverLabel: '',
    ...over,
  });

  const mirrorOf = async (ledgerId: number) =>
    (await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, ledgerId)))[0];

  beforeAll(async () => {
    // ⚠️ تست‌های بالاتر دوره را قفل کرده‌اند؛ این دسته به تاریخِ آزاد نیاز دارد.
    await db.delete(fiscalLocks);

    const u = await db.insert(users).values([
      { email: 'm@t', name: 'عضو' },
      { email: 'v@t', name: 'فروشنده' },
      { email: 'cl@t', name: 'کارفرما' },
    ]).returning({ id: users.id });
    [memberUser, vendorUser, clientUser] = u.map((r) => r.id) as [number, number, number];

    await db.insert(projectMembers).values({
      projectId, userId: memberUser, agreedAmount: '500', currencyId: eur,
    });
  });

  it('دریافتی از کارفرما آینه می‌شود', async () => {
    const id = await service.createEntry(manager(), entry({
      direction: 'in', payerUserId: clientUser, description: 'پیش‌پرداخت',
    }));
    const row = await mirrorOf(id);
    expect(row?.direction).toBe('incoming');
    expect(row?.userId).toBe(clientUser);
    expect(row?.projectId).toBe(projectId);
    // ⚠️ نامِ پروژه در یادداشت منجمد می‌شود.
    expect(row?.note).toContain('بابت پروژه: پروژه');
  });

  it('⚠️ پرداخت به عضوِ پروژه دستمزد است، نه هزینه', async () => {
    const id = await service.createEntry(manager(), entry({ receiverUserId: memberUser }));
    expect((await mirrorOf(id))?.direction).toBe('member_payout');
  });

  it('پرداخت به غیرِعضو: تیکِ بازپرداخت جهت را تعیین می‌کند', async () => {
    const billed = await service.createEntry(manager(), entry({
      receiverUserId: vendorUser, billable: true,
    }));
    expect((await mirrorOf(billed))?.direction).toBe('project_expense');

    const absorbed = await service.createEntry(manager(), entry({
      receiverUserId: vendorUser, billable: false,
    }));
    expect((await mirrorOf(absorbed))?.direction).toBe('project_cost');
  });

  it('⚠️ ردیفِ بی‌پروژه و بی‌طرف اصلاً آینه نمی‌شود', async () => {
    const id = await service.createEntry(manager(), entry({
      projectId: null, description: 'کارمزدِ بانک',
    }));
    expect(await mirrorOf(id)).toBeUndefined();
  });

  it('ردیفِ بی‌پروژه ولی منسوب به فرد، بدونِ پروژه آینه می‌شود', async () => {
    const id = await service.createEntry(manager(), entry({
      projectId: null, receiverUserId: memberUser, description: 'مساعده',
    }));
    const row = await mirrorOf(id);
    expect(row?.direction).toBe('member_payout');
    expect(row?.projectId).toBeNull();
    // بدونِ پروژه، برچسبِ پروژه هم نمی‌خورد.
    expect(row?.note).toBe('مساعده');
  });

  it('⚠️ مبلغِ تسویه بر مبلغِ اسمی مقدم است', async () => {
    const id = await service.createEntry(manager(), entry({
      currencyId: usd, amount: '100', amountSettled: '80', settledCurrencyId: eur,
      receiverUserId: memberUser,
    }));
    const row = await mirrorOf(id);
    expect(row?.amountSettled).toBe('80.0000');
    // ۸۰ یورو تسویه شده ← رقمِ گزارش هم ۸۰ است، نه ۹۰ ِ حاصل از نرخِ بازار.
    expect(Number(row?.amountEur)).toBe(80);
  });

  it('⚠️ ویرایش آینه را از نو می‌سازد، نه اینکه ردیفِ کهنه بماند', async () => {
    const id = await service.createEntry(manager(), entry({ receiverUserId: memberUser }));
    expect((await mirrorOf(id))?.direction).toBe('member_payout');

    await service.updateEntry(manager(), id, entry({
      receiverUserId: vendorUser, billable: true,
    }));
    const rows = await db.select().from(projectPayments)
      .where(eq(projectPayments.ledgerId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.direction).toBe('project_expense');
  });

  it('حذفِ ردیفِ دفتر، آینه‌اش را هم می‌برد', async () => {
    const id = await service.createEntry(manager(), entry({ receiverUserId: memberUser }));
    await service.deleteEntry(manager(), id);
    expect(await mirrorOf(id)).toBeUndefined();
  });
});
