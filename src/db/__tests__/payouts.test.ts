import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, users, accounts, projects, ledger, paymentRequests,
  recurringExpenses, fiscalLocks, vendors, unitEntries,
} from '../schema';
import * as payouts from '@/server/finance/payouts';
import { ForbiddenError } from '@/domain/access/guard';
import { FiscalPeriodLockedError } from '@/domain/ledger/fiscal';
import { RecurringPayError } from '@/domain/finance/recurring';
import type { Actor, Permission } from '@/domain/access/permissions';

/** پرداخت‌ها و هزینه‌های دوره‌ای — مسیرهایی که پول جابه‌جا می‌کنند. */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const manager = () => actor({ id: 1, permissions: ['finance.manage', 'finance.view'] as Permission[] });
const viewer = () => actor({ id: 2, permissions: ['finance.view'] as Permission[] });
const owner = () => actor({ id: 1, roles: ['owner'] });

let eur: number, account: number, project: number, member: number;
let pending: number, rejected: number, monthly: number, oneOff: number;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, payment_requests, recurring_expenses,
    fiscal_locks, accounts, vendors, projects, users, currencies restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = c[0]!.id;

  const u = await db.insert(users).values([
    { email: 'm@t', name: 'مدیر' },
    { email: 'd@t', name: 'سارا' },
  ]).returning({ id: users.id });
  member = u[1]!.id;

  const a = await db.insert(accounts)
    .values({ name: 'حساب', currencyId: eur, openingBalance: '10000' })
    .returning({ id: accounts.id });
  account = a[0]!.id;

  const p = await db.insert(projects).values({ title: 'پروژه', price: '5000', currencyId: eur })
    .returning({ id: projects.id });
  project = p[0]!.id;

  const r = await db.insert(paymentRequests).values([
    { projectId: project, userId: member, amount: '500', currencyId: eur, status: 'approved' },
    { projectId: project, userId: member, amount: '300', currencyId: eur, status: 'rejected' },
  ]).returning({ id: paymentRequests.id });
  pending = r[0]!.id; rejected = r[1]!.id;

  await db.insert(vendors).values({ name: 'میزبانی' });

  const e = await db.insert(recurringExpenses).values([
    {
      title: 'اجارهٔ دفتر', amount: '800', currencyId: eur, accountId: account,
      kind: 'recurring', intervalUnit: 'month', intervalCount: 1,
      startDate: '2026-08-01', nextDueDate: '2026-08-01',
    },
    {
      title: 'خریدِ لپ‌تاپ', amount: '1200', currencyId: eur, accountId: account,
      kind: 'once', intervalUnit: 'month', intervalCount: 1,
      startDate: '2026-08-05', nextDueDate: '2026-08-05',
    },
  ]).returning({ id: recurringExpenses.id });
  monthly = e[0]!.id; oneOff = e[1]!.id;
});

afterAll(async () => { await sql.end(); });

describe('گاردِ دسترسی', () => {
  it('بدونِ مجوز فهرست دیده نمی‌شود', async () => {
    await expect(payouts.listRequests(actor())).rejects.toThrow(ForbiddenError);
  });

  it('حسابدار فقط تأییدشده/پرداخت‌شده را می‌بیند و تصمیم نمی‌گیرد', async () => {
    // پورتِ `status_tabs()`: ردشده و در انتظار فقط برای مالک است.
    expect(await payouts.listRequests(viewer())).toHaveLength(1);
    expect(await payouts.listRequests(manager())).toHaveLength(1);
    expect(await payouts.listRequests(owner())).toHaveLength(2);
    await expect(payouts.decideRequest(viewer(), pending, 'approved', ''))
      .rejects.toThrow(ForbiddenError);
  });
});

describe('⚠️ R-TEAM-07/10 — پرداختِ درخواست', () => {
  it('درخواستِ ردشده هرگز پرداخت نمی‌شود — و ردیفِ دفتری هم نمی‌سازد', async () => {
    // اگر گارد بعد از نوشتنِ ردیف بود، پول از حساب می‌رفت و بعد رد می‌شد.
    const before = await db.select().from(ledger);
    await expect(payouts.payRequest(manager(), rejected, {
      accountId: account, entryDate: '2026-08-20',
    })).rejects.toThrow(payouts.PayoutError);
    expect(await db.select().from(ledger)).toHaveLength(before.length);
  });

  it('پرداختِ درخواستِ تأییدشده ردیفِ خرج می‌نویسد و وضعیت را می‌بندد', async () => {
    const result = await payouts.payRequest(manager(), pending, {
      accountId: account, entryDate: '2026-08-20',
    });
    expect(result.ledgerId).toBeGreaterThan(0);

    const row = (await db.select().from(paymentRequests).where(eq(paymentRequests.id, pending)))[0]!;
    expect(row.status).toBe('paid');
    // R-TEAM-10 — وضعیتِ paid حتماً ردیفِ بانکی دارد (در دیتابیس هم check دارد).
    expect(row.ledgerId).toBe(result.ledgerId);

    const entry = (await db.select().from(ledger).where(eq(ledger.id, result.ledgerId)))[0]!;
    expect(entry.direction).toBe('out');
    expect(Number(entry.amount)).toBe(500);
    expect(entry.projectId).toBe(project);
  });

  it('⚠️ پرداختِ دوباره رد می‌شود', async () => {
    await expect(payouts.payRequest(manager(), pending, {
      accountId: account, entryDate: '2026-08-21',
    })).rejects.toThrow(payouts.PayoutError);
  });
});

describe('هزینه‌های دوره‌ای', () => {
  it('پرداخت ردیفِ خرج می‌نویسد و سررسید را جلو می‌برد', async () => {
    const result = await payouts.payRecurring(manager(), monthly, '2026-08-01');
    expect(result.ledgerId).toBeGreaterThan(0);

    const row = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, monthly)))[0]!;
    expect(row.nextDueDate).toBe('2026-09-01');
    expect(row.isActive).toBe(true);
  });

  it('⚠️ کلیکِ دوباره ردیفِ تکراری نمی‌سازد', async () => {
    // تاریخِ سررسیدی که کاربر دیده دیگر با زمان‌بندی نمی‌خواند.
    const before = await db.select().from(ledger);
    await expect(payouts.payRecurring(manager(), monthly, '2026-08-01'))
      .rejects.toThrow(RecurringPayError);
    expect(await db.select().from(ledger)).toHaveLength(before.length);
  });

  it('⚠️ هزینهٔ یک‌بار پس از پرداخت بسته می‌شود', async () => {
    await payouts.payRecurring(manager(), oneOff, '2026-08-05');
    const row = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, oneOff)))[0]!;
    expect(row.isActive).toBe(false);
    // سررسیدش جلو نرفته.
    expect(row.nextDueDate).toBe('2026-08-05');
  });

  it('⚠️ قفلِ دوره پرداخت را می‌ایستاند و سررسید هم جلو نمی‌رود', async () => {
    // وگرنه نوبت بی‌صدا گم می‌شد: نه ردیفی نوشته، نه سررسیدی مانده.
    await db.insert(fiscalLocks).values({ lockDate: '2026-09-30', setBy: 1 });
    const before = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, monthly)))[0]!;

    await expect(payouts.payRecurring(manager(), monthly, '2026-09-01'))
      .rejects.toThrow(FiscalPeriodLockedError);

    const after = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, monthly)))[0]!;
    expect(after.nextDueDate).toBe(before.nextDueDate);
  });
});

describe('ساخت و ویرایشِ هزینه', () => {
  it('هزینهٔ نو ساخته می‌شود و سررسیدش از تاریخِ شروع می‌آید', async () => {
    const id = await payouts.saveRecurring(manager(), {
      id: null, title: 'دامنه', amount: '20', currencyId: eur,
      kind: 'recurring', intervalUnit: 'year', intervalCount: 1,
      startDate: '2026-10-01', nextDueDate: '', accountId: account, vendorId: null,
    });
    const row = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)))[0]!;
    expect(row.nextDueDate).toBe('2026-10-01');
    expect(row.intervalUnit).toBe('year');
  });

  it('واحدِ ناشناخته به «ماهانه» می‌افتد، نه خطا', async () => {
    const id = await payouts.saveRecurring(manager(), {
      id: null, title: 'تست', amount: '10', currencyId: eur,
      kind: 'recurring', intervalUnit: 'bogus', intervalCount: 0,
      startDate: '2026-10-01', nextDueDate: '', accountId: null, vendorId: null,
    });
    const row = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)))[0]!;
    expect(row.intervalUnit).toBe('month');
    expect(row.intervalCount).toBe(1);
  });
});

describe('R-TEAM-08 — پرداختِ درخواست، ردیفِ کارِ تعدادی‌اش را هم می‌بندد', () => {
  it('ردیفِ تعدادی بعد از پرداخت «پرداخت‌شده» و به ردیفِ دفتر وصل می‌شود', async () => {
    // ⚠️ پیش از این شناسهٔ ردیف محاسبه می‌شد ولی هرگز نوشته نمی‌شد — ردیف تا ابد
    // «درخواست‌شده» می‌ماند و در گزارش‌ها پرداخت‌نشده حساب می‌شد.
    const [ue] = await db.insert(unitEntries).values({
      projectId: project, userId: member, entryDate: '2026-08-01',
      quantity: '2', amount: '300', currencyId: eur, status: 'requested',
    }).returning({ id: unitEntries.id });
    const [req] = await db.insert(paymentRequests).values({
      projectId: project, userId: member, amount: '300', currencyId: eur,
      status: 'pending', unitEntryId: ue!.id,
    }).returning({ id: paymentRequests.id });

    // ⚠️ درخواستِ در انتظار را فقط مالک یک‌ضرب پرداخت می‌کند؛ حسابدار «تأییدنشده» می‌گیرد.
    await expect(payouts.payRequest(manager(), req!.id, { accountId: account, entryDate: '2026-10-05' }))
      .rejects.toThrow(payouts.PayoutError);
    const result = await payouts.payRequest(owner(), req!.id, {
      // ⚠️ بعد از قفلِ دورهٔ مالیِ آزمونِ قبلی (تا ۲۰۲۶-۰۹-۳۰).
      accountId: account, entryDate: '2026-10-05',
    });
    expect(result.closedUnitEntryId).toBe(ue!.id);

    const row = (await db.select().from(unitEntries).where(eq(unitEntries.id, ue!.id)))[0]!;
    expect(row.status).toBe('paid');
    expect(row.ledgerId).toBe(result.ledgerId);
  });
});
