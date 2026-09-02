import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, exchangeRates, users, accounts, accountUsers, ledger, fiscalLocks,
  paymentRequests, tags, tagRelations, projects,
} from '../schema';
import * as service from '@/server/finance/service';
import * as payouts from '@/server/finance/payouts';
import * as settings from '@/server/settings/service';
import { capsForUser, tagPermissionsFor, userIdsWithCaps } from '@/server/people/tag-caps';
import { FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP } from '@/domain/access/project-scope';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * دسترسیِ مالی — پورتِ سه سطحِ نسخهٔ قبلی:
 *   مالک (`manage_options`) → همه‌چیز؛ مدیرِ مالی (`kteam_manage_finance`) →
 *   همهٔ حساب‌ها؛ حسابدارِ محدود (`kteam_finance`) → فقط حساب‌های تخصیص‌یافته،
 *   ولی روی همان‌ها **می‌نویسد** (پیش از این فقط می‌خواند).
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const owner = () => actor({ id: 1, roles: ['owner'] });
const finMgr = () => actor({ id: 2, permissions: ['finance.manage', 'finance.view'] as Permission[] });
const accountant = () => actor({ id: 3, permissions: ['finance.view'] as Permission[] });
const pm = () => actor({ id: 4, permissions: ['projects.manage', 'projects.view'] as Permission[] });

let eur: number, usd: number, accA: number, accB: number, project: number, category: number;
const MEMBER = 5;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, payment_requests, recurring_expenses,
    fiscal_locks, accounts, exchange_rates, tags, projects, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'USD', name: 'دلار', symbol: '$' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id; usd = c[1]!.id;

  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'f@t', name: 'مدیرِ مالی' },
    { email: 'a@t', name: 'حسابدار' },
    { email: 'p@t', name: 'مدیرِ پروژه' },
    { email: 'm@t', name: 'عضو', phone: '0913' },
  ]);

  // تگِ نقش با `grants_cap` — همان سازوکارِ «حسابدار»/«مدیر حسابداری» ِ نسخهٔ قبلی.
  const t = await db.insert(tags).values([
    { name: 'حسابدار', type: 'member_role', grantsCap: FINANCE_SCOPED_CAP },
    { name: 'مدیر حسابداری', type: 'member_role', grantsCap: MANAGE_FINANCE_CAP },
    { name: 'هاستینگ', type: 'ledger_category' },
  ]).returning({ id: tags.id });
  category = t[2]!.id;
  await db.insert(tagRelations).values([
    { tagId: t[0]!.id, objectId: 3, objectType: 'user' },
    { tagId: t[1]!.id, objectId: 2, objectType: 'user' },
  ]);

  const a = await db.insert(accounts).values([
    { name: 'حسابِ اصلی', currencyId: eur, openingBalance: '1000' },
    { name: 'حسابِ دوم', currencyId: eur, openingBalance: '0' },
  ]).returning({ id: accounts.id });
  accA = a[0]!.id; accB = a[1]!.id;
  // حسابدارِ محدود فقط به حسابِ اصلی تخصیص یافته است.
  await db.insert(accountUsers).values({ accountId: accA, userId: 3 });

  const p = await db.insert(projects).values({ title: 'پروژه', price: '0', currencyId: eur })
    .returning({ id: projects.id });
  project = p[0]!.id;
});

afterAll(async () => { await sql.end(); });

const entry = (over: Partial<service.EntryInput> = {}): service.EntryInput => ({
  accountId: accA, entryDate: '2026-08-10', direction: 'in', amount: '200',
  currencyId: eur, description: '', projectId: null, tagIds: [],
  officeId: null, payerUserId: null, payerLabel: '', receiverUserId: null,
  receiverLabel: '', ...over,
});

describe('تگِ نقش → مجوزِ مالی (پورتِ sync_caps_from_tags)', () => {
  it('حسابدار: فقط دیدن؛ مدیرِ حسابداری: دیدن و مدیریت؛ بی‌تگ: هیچ', async () => {
    expect(await capsForUser(3)).toEqual([FINANCE_SCOPED_CAP]);
    expect(await tagPermissionsFor(3)).toEqual(['finance.view']);
    expect((await tagPermissionsFor(2)).sort()).toEqual(['finance.manage', 'finance.view']);
    expect(await capsForUser(1)).toEqual([]);
  });

  it('کاندیدای تخصیص به حساب: دارندگانِ یکی از دو تگِ مالی', async () => {
    expect((await userIdsWithCaps([FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP])).sort()).toEqual([2, 3]);
  });
});

describe('حسابدارِ محدود روی حسابِ خودش می‌نویسد', () => {
  it('canBookOn: مدیرِ مالی همه، حسابدار فقط تخصیص‌یافته، مدیرِ پروژه هیچ', async () => {
    expect(await service.canBookOn(finMgr(), accB)).toBe(true);
    expect(await service.canBookOn(accountant(), accA)).toBe(true);
    expect(await service.canBookOn(accountant(), accB)).toBe(false);
    expect(await service.canBookOn(pm(), accA)).toBe(false);
  });

  it('ثبت روی حسابِ تخصیص‌یافته می‌گذرد؛ حسابِ دیگر «یافت نشد»؛ مدیرِ پروژه ممنوع', async () => {
    const id = await service.createEntry(accountant(), entry());
    expect(id).toBeGreaterThan(0);
    await expect(service.createEntry(accountant(), entry({ accountId: accB })))
      .rejects.toThrow(service.LedgerNotFoundError);
    await expect(service.createEntry(pm(), entry())).rejects.toThrow(ForbiddenError);
  });

  it('⚠️ ویرایش نمی‌تواند ردیف را به حسابِ دیگری ببرد', async () => {
    const [row] = await db.select().from(ledger).where(eq(ledger.accountId, accA));
    await expect(service.updateEntry(finMgr(), row!.id, entry({ accountId: accB })))
      .rejects.toThrow(ForbiddenError);
  });

  it('مدیرِ پروژه‌ای که حسابدار هم هست همهٔ حساب‌ها را می‌بیند (user_sees_all)؛ حسابدارِ تنها فقط مالِ خودش — با ماندهٔ فعلی', async () => {
    // پورتِ `user_sees_all()`: پس از گاردِ مالی، مدیرِ سراسریِ پروژه‌ها دامنهٔ کامل دارد.
    await expect(service.listAccounts(pm())).rejects.toThrow(ForbiddenError);
    const pmAccountant = actor({ id: 4, permissions: ['projects.manage', 'finance.view'] as Permission[] });
    expect((await service.accountScope(pmAccountant)).seesAll).toBe(true);
    const all = await service.listAccounts(pmAccountant);
    expect(all.map((a) => a.id).sort()).toEqual([accA, accB].sort());

    const mine = await service.listAccounts(accountant());
    expect(mine.map((a) => a.id)).toEqual([accA]);
    // ۱۰۰۰ اولیه + ۲۰۰ واریزِ حسابدار.
    expect(Number(mine[0]!.balance)).toBe(1200);
  });
});

describe('دفترِ دوره‌ای — ردیف‌های دورهٔ بسته پنهان و مانده منتقل می‌شود', () => {
  it('پیش از قفل همه دیده می‌شود؛ پس از قفل فقط دورهٔ باز + «مانده از سال قبل»', async () => {
    await service.createEntry(finMgr(), entry({ accountId: accB, entryDate: '2026-03-01', amount: '500' }));
    await service.createEntry(finMgr(), entry({ accountId: accB, entryDate: '2026-03-15', direction: 'out', amount: '100' }));
    await service.createEntry(finMgr(), entry({ accountId: accB, entryDate: '2026-08-01', amount: '50' }));

    const open = await service.getLedger(finMgr(), { accountId: accB });
    expect(open.periodScoped).toBe(false);
    expect(open.entries).toHaveLength(3);
    expect(Number(open.totals.balance)).toBe(450);

    await db.insert(fiscalLocks).values({ lockDate: '2026-06-30', setBy: 1 });

    // پورتِ `for_account($since)`: دفتر از فردای قفل شروع می‌شود.
    const scoped = await service.getLedger(finMgr(), { accountId: accB });
    expect(scoped.periodScoped).toBe(true);
    expect(scoped.entries).toHaveLength(1);
    expect(scoped.totals.carried).toBe(true);
    expect(Number(scoped.totals.opening)).toBe(400);
    // ⚠️ ماندهٔ حساب با پنهان‌شدنِ ردیف‌ها عوض نمی‌شود.
    expect(Number(scoped.totals.balance)).toBe(450);

    const full = await service.getLedger(finMgr(), { accountId: accB, includeLocked: true });
    expect(full.periodScoped).toBe(false);
    expect(full.entries).toHaveLength(3);
    expect(Number(full.totals.balance)).toBe(450);
  });
});

describe('انتقال بین دو حساب', () => {
  it('هر دو لِگ شرح، گروه و معادلِ یورو دارند؛ حذفِ یکی هر دو را حذف می‌کند', async () => {
    const [from, to] = await service.transfer(finMgr(), {
      fromAccountId: accA, toAccountId: accB, fromAmount: '100', toAmount: '100',
      entryDate: '2026-08-20', description: 'شارژِ حسابِ دوم',
    });
    const legs = await db.select().from(ledger).where(inArray(ledger.id, [from, to]));
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((l) => l.transferGroup)).size).toBe(1);
    expect(legs.every((l) => l.description.includes('شارژِ حسابِ دوم'))).toBe(true);
    expect(legs.every((l) => l.amountEur !== null)).toBe(true);

    // ⚠️ پیش از این فقط یک لِگ پاک می‌شد و پول در یک حساب «گم» می‌ماند.
    await service.deleteEntry(finMgr(), from);
    expect(await db.select().from(ledger).where(inArray(ledger.id, [from, to]))).toHaveLength(0);
  });
});

describe('درخواست‌های پرداخت — سه سطحِ دسترسی', () => {
  let pendingA: number, pendingB: number, approved: number;

  beforeAll(async () => {
    const r = await db.insert(paymentRequests).values([
      { projectId: project, userId: MEMBER, amount: '500', currencyId: eur, status: 'pending' },
      { projectId: project, userId: MEMBER, amount: '400', currencyId: eur, status: 'pending' },
      { projectId: project, userId: MEMBER, amount: '300', currencyId: eur, status: 'approved' },
      { projectId: project, userId: MEMBER, amount: '100', currencyId: eur, status: 'rejected' },
    ]).returning({ id: paymentRequests.id });
    pendingA = r[0]!.id; pendingB = r[1]!.id; approved = r[2]!.id;
  });

  it('سطح: مالک full، حسابدار accounting، بقیه none', () => {
    expect(payouts.payoutLevel(owner())).toBe('full');
    expect(payouts.payoutLevel(finMgr())).toBe('accounting');
    expect(payouts.payoutLevel(pm())).toBe('none');
  });

  it('حسابدار فقط تأییدشده/پرداخت‌شده را می‌بیند؛ مالک همه را، در انتظارها اول', async () => {
    expect((await payouts.listRequests(finMgr())).map((r) => r.status)).toEqual(['approved']);
    const all = await payouts.listRequests(owner());
    expect(all).toHaveLength(4);
    expect(all.slice(0, 2).every((r) => r.status === 'pending')).toBe(true);
  });

  it('⚠️ تأیید/رد فقط مالک — و تصمیم‌گیرنده و دلیل ثبت می‌شود', async () => {
    await expect(payouts.decideRequest(finMgr(), pendingB, 'approved', '')).rejects.toThrow(ForbiddenError);

    await payouts.decideRequest(owner(), pendingB, 'rejected', 'مبلغ با قرارداد نمی‌خواند');
    const [row] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, pendingB));
    expect(row!.status).toBe('rejected');
    expect(row!.decidedBy).toBe(1);
    expect(row!.decidedAt).not.toBeNull();
    expect(row!.decisionNote).toBe('مبلغ با قرارداد نمی‌خواند');
  });

  it('⚠️ در انتظار را حسابدار نمی‌پردازد؛ مالک یک‌ضرب می‌پردازد و تصمیم هم ثبت می‌شود', async () => {
    await expect(payouts.payRequest(finMgr(), pendingA, { accountId: accA, entryDate: '2026-08-25' }))
      .rejects.toMatchObject({ code: 'not_approved' });

    const result = await payouts.payRequest(owner(), pendingA, { accountId: accA, entryDate: '2026-08-25' });
    const [row] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, pendingA));
    expect(row!.status).toBe('paid');
    expect(row!.ledgerId).toBe(result.ledgerId);
    expect(row!.decidedBy).toBe(1);
    expect(row!.decidedAt).not.toBeNull();
  });

  it('حسابدار تأییدشده را می‌پردازد', async () => {
    const result = await payouts.payRequest(finMgr(), approved, { accountId: accA, entryDate: '2026-08-26' });
    expect(result.ledgerId).toBeGreaterThan(0);
  });

  it('تلفنِ اعضا فقط برای مالک', async () => {
    expect((await payouts.bankDirectory(owner())).showPhone).toBe(true);
    expect((await payouts.bankDirectory(finMgr())).showPhone).toBe(false);
  });
});

describe('هزینه‌های دوره‌ای — فیلدهای فراموش‌شده ذخیره می‌شوند', () => {
  it('دسته، یادداشت و فعال/غیرفعال از ورودی تا فهرست', async () => {
    await payouts.saveRecurring(finMgr(), {
      id: null, title: 'میزبانی', amount: '30', currencyId: eur, kind: 'recurring',
      intervalUnit: 'month', intervalCount: 3, startDate: '2026-09-01', nextDueDate: '2026-09-01',
      accountId: accA, vendorId: null, categoryTagId: category, note: 'سالانه تمدید شود', isActive: false,
    });
    const row = (await payouts.listRecurring(finMgr())).find((r) => r.title === 'میزبانی');
    expect(row).toMatchObject({
      categoryTagId: category, note: 'سالانه تمدید شود', isActive: false, intervalCount: 3,
    });
  });
});

describe('تنظیماتِ ارز و نرخ', () => {
  it('ارزِ غیرپیش‌فرض غیرفعال می‌شود؛ پیش‌فرض همیشه فعال می‌ماند', async () => {
    await settings.saveCurrency(owner(), { id: usd, code: 'USD', name: 'دلار', symbol: '$', decimals: 2, isActive: false });
    await settings.saveCurrency(owner(), { id: eur, code: 'EUR', name: 'یورو', symbol: '€', decimals: 2, isActive: false });
    const rows = await db.select().from(currencies);
    expect(rows.find((c) => c.id === usd)!.isActive).toBe(false);
    expect(rows.find((c) => c.id === eur)!.isActive).toBe(true);
  });

  it('⚠️ نرخِ همان جفت در همان روز به‌روز می‌شود، نه خطای یکتایی', async () => {
    const input = { fromCurrencyId: usd, toCurrencyId: eur, effectiveDate: '2026-08-01' };
    await settings.saveRate(owner(), { ...input, rate: '0.90' });
    await settings.saveRate(owner(), { ...input, rate: '0.92' });
    const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.effectiveDate, '2026-08-01'));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.rate)).toBe(0.92);
  });
});
