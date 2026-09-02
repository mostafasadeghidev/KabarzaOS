import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  currencies, exchangeRates, users, accounts, ledger, offices, vendors, tags, tagRelations,
  projects, projectMembers, projectPayments, paymentRequests, unitEntries, recurringExpenses,
} from '../schema';
import * as service from '@/server/finance/service';
import * as payouts from '@/server/finance/payouts';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * قواعدِ حسابداریِ سرور — پورتِ گاردهای `handle()` و `Ledger::add()` ِ افزونه:
 * طرفِ حساب از جهت پیروی می‌کند، گیرندهٔ آزاد فروشنده می‌شود، `amount_office`
 * در ارزِ دفتر است، ارزِ تسویه از تعهد می‌آید، و پرداخت‌های صفحهٔ پرداخت‌ها
 * (درخواست، کارکردِ تعدادی، بی‌پروژه، هزینهٔ دوره‌ای).
 */

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});
const manager = () => actor({ id: 1, permissions: ['finance.manage', 'finance.view'] as Permission[] });
const owner = () => actor({ id: 1, roles: ['owner'] });

const MEMBER = 2;
const NEWBIE = 3;
let eur: number, usd: number, irr: number, gbp: number;
let berlin: number, london: number;
let accA: number, accB: number, accC: number;
let project: number, projectUsd: number, hosting: number;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, project_payments, payment_requests, unit_entries,
    recurring_expenses, fiscal_locks, accounts, exchange_rates, tags, offices, vendors, projects,
    users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'USD', name: 'دلار', symbol: '$' },
    { code: 'IRR', name: 'ریال', symbol: 'ریال', decimals: 0 },
    { code: 'GBP', name: 'پوند', symbol: '£' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id; usd = c[1]!.id; irr = c[2]!.id; gbp = c[3]!.id;

  await db.insert(exchangeRates).values([
    { fromCurrencyId: usd, toCurrencyId: eur, rate: '0.9', effectiveDate: '2026-01-01' },
    { fromCurrencyId: eur, toCurrencyId: usd, rate: '1.1', effectiveDate: '2026-01-01' },
    { fromCurrencyId: eur, toCurrencyId: irr, rate: '50000', effectiveDate: '2026-01-01' },
    { fromCurrencyId: irr, toCurrencyId: eur, rate: '0.00002', effectiveDate: '2026-01-01' },
  ]);

  await db.insert(users).values([
    { email: 'm@t', name: 'مدیرِ مالی' },
    { email: 'a@t', name: 'علی', bankCard: '6037-0000' },
    { email: 'n@t', name: 'نوآمده' },
  ]);

  const o = await db.insert(offices).values([
    { name: 'برلین', defaultCurrencyId: usd },
    // ⚠️ پوند هیچ نرخی ندارد — نبودِ نرخِ دفتر نباید ثبت را بایستاند.
    { name: 'لندن', defaultCurrencyId: gbp },
  ]).returning({ id: offices.id });
  berlin = o[0]!.id; london = o[1]!.id;

  const a = await db.insert(accounts).values([
    { name: 'یورو (برلین)', currencyId: eur, openingBalance: '10000', officeId: berlin },
    { name: 'ریالی', currencyId: irr, openingBalance: '900000000' },
    { name: 'یورو (لندن)', currencyId: eur, openingBalance: '0', officeId: london },
  ]).returning({ id: accounts.id });
  accA = a[0]!.id; accB = a[1]!.id; accC = a[2]!.id;

  const p = await db.insert(projects).values([
    { title: 'وب‌سایت', price: '5000', currencyId: eur },
    { title: 'اپ', price: '8000', currencyId: usd },
  ]).returning({ id: projects.id });
  project = p[0]!.id; projectUsd = p[1]!.id;
  await db.insert(projectMembers).values([
    { projectId: project, userId: MEMBER, agreedAmount: '1000', currencyId: eur },
    { projectId: projectUsd, userId: MEMBER, agreedAmount: '2000', currencyId: eur },
    { projectId: projectUsd, userId: NEWBIE, agreedAmount: '500' },
  ]);

  const t = await db.insert(tags).values({ name: 'هاستینگ', type: 'ledger_category' }).returning({ id: tags.id });
  hosting = t[0]!.id;
});

afterAll(async () => { await sql.end(); });

const entry = (over: Partial<service.EntryInput> = {}): service.EntryInput => ({
  accountId: accA, entryDate: '2026-08-10', direction: 'out', amount: '100',
  currencyId: eur, description: 'ردیف', projectId: null, tagIds: [],
  officeId: null, payerUserId: null, payerLabel: '', receiverUserId: null,
  receiverLabel: '', ...over,
});

const row = async (id: number) => (await db.select().from(ledger).where(eq(ledger.id, id)))[0]!;

describe('طرفِ حساب از جهت پیروی می‌کند (پورتِ handle)', () => {
  it('برداشت با پرداخت‌کننده‌ی جامانده → گیرنده می‌شود؛ خانهٔ پنهان پاک', async () => {
    const id = await service.createEntry(manager(), entry({
      direction: 'out', payerUserId: MEMBER, payerLabel: 'علی', receiverUserId: null, receiverLabel: '',
    }));
    const r = await row(id);
    expect(r.receiverUserId).toBe(MEMBER);
    expect(r.receiverLabel).toBe('علی');
    expect(r.payerUserId).toBeNull();
    expect(r.payerLabel).toBe('');
  });

  it('واریز با گیرندهٔ جامانده → پرداخت‌کننده می‌شود', async () => {
    const id = await service.createEntry(manager(), entry({
      direction: 'in', receiverUserId: MEMBER, receiverLabel: 'علی',
    }));
    const r = await row(id);
    expect(r.payerUserId).toBe(MEMBER);
    expect(r.receiverUserId).toBeNull();
    expect(r.receiverLabel).toBe('');
  });

  it('⚠️ ویرایش هم قاعده را اعمال می‌کند — پرداخت‌کنندهٔ کهنه روی برداشت نمی‌ماند', async () => {
    const id = await service.createEntry(manager(), entry({ direction: 'in', payerLabel: 'کارفرما' }));
    await service.updateEntry(manager(), id, entry({ direction: 'out', payerLabel: 'کارفرما', receiverLabel: '' }));
    const r = await row(id);
    expect(r.receiverLabel).toBe('کارفرما');
    expect(r.payerLabel).toBe('');
  });
});

describe('گیرندهٔ آزادِ برداشت = فروشنده (پورتِ Vendors::find_or_create)', () => {
  it('فروشنده ساخته و روی ردیف نشانده می‌شود؛ نامِ تکراری (بی‌حساسیت به حروف) یکی می‌ماند', async () => {
    const first = await service.createEntry(manager(), entry({ receiverLabel: 'Hetzner' }));
    const second = await service.createEntry(manager(), entry({ receiverLabel: 'hetzner' }));
    const found = (await db.select().from(vendors)).filter((v) => v.name.toLowerCase() === 'hetzner');
    expect(found).toHaveLength(1);
    expect((await row(first)).vendorId).toBe(found[0]!.id);
    expect((await row(second)).vendorId).toBe(found[0]!.id);
  });

  it('گیرندهٔ عضو فروشنده نیست؛ واریز هم', async () => {
    const toMember = await service.createEntry(manager(), entry({ receiverUserId: MEMBER, receiverLabel: 'علی' }));
    expect((await row(toMember)).vendorId).toBeNull();
    const deposit = await service.createEntry(manager(), entry({ direction: 'in', payerLabel: 'Stripe' }));
    expect((await row(deposit)).vendorId).toBeNull();
  });
});

describe('دفتر و amount_office (پورتِ add / compute_amounts)', () => {
  it('دفترِ ردیف از حساب می‌آید و amount_office در ارزِ دفتر است', async () => {
    const id = await service.createEntry(manager(), entry({ amount: '100', officeId: null }));
    const r = await row(id);
    expect(r.officeId).toBe(berlin);
    // ۱۰۰ یورو × ۱٫۱ = ۱۱۰ دلار (ارزِ دفترِ برلین)، نه ۱۰۰ (ارزِ حساب).
    expect(Number(r.amountOffice)).toBeCloseTo(110, 2);
    expect(Number(r.amountAccount)).toBe(100);
  });

  it('⚠️ نبودِ نرخِ ارزِ دفتر ثبت را نمی‌ایستاند — فقط رقمِ منطقه‌ای صفر می‌ماند', async () => {
    const id = await service.createEntry(manager(), entry({ accountId: accC, amount: '40' }));
    const r = await row(id);
    expect(r.officeId).toBe(london);
    expect(Number(r.amountOffice)).toBe(0);
    expect(Number(r.amountEur)).toBe(40);
  });
});

describe('ارزِ تسویه از تعهد می‌آید (پورتِ maybe_link_payment)', () => {
  it('پرداخت به عضو: ارزِ قراردادِ عضو؛ عضوِ بی‌ارز: ارزِ پروژه', async () => {
    const a = await service.createEntry(manager(), entry({
      projectId: projectUsd, receiverUserId: MEMBER, receiverLabel: 'علی',
      amountSettled: '80', settledCurrencyId: null, description: 'دستمزد',
    }));
    const b = await service.createEntry(manager(), entry({
      projectId: projectUsd, receiverUserId: NEWBIE, receiverLabel: 'نوآمده',
      amountSettled: '50', settledCurrencyId: null, description: 'دستمزد',
    }));
    const mirrors = await db.select().from(projectPayments).where(eq(projectPayments.projectId, projectUsd));
    expect(mirrors.find((m) => m.ledgerId === a)!.settledCurrencyId).toBe(eur);
    expect(mirrors.find((m) => m.ledgerId === b)!.settledCurrencyId).toBe(usd);
  });
});

describe('درخواست‌های پرداخت — مبلغِ بانکی و ستون‌های جدول', () => {
  let request: number;

  it('مبلغِ واقعی در ارزِ حساب؛ مبلغِ درخواست معادلِ تعهد (پورتِ record_payment_url)', async () => {
    const r = await db.insert(paymentRequests).values({
      projectId: project, userId: MEMBER, amount: '100', currencyId: eur, status: 'approved',
    }).returning({ id: paymentRequests.id });
    const { ledgerId } = await payouts.payRequest(manager(), r[0]!.id, {
      accountId: accB, entryDate: '2026-08-12', amount: '5200000',
    });
    const l = await row(ledgerId);
    expect(l.currencyId).toBe(irr);
    expect(Number(l.amount)).toBe(5200000);
    const mirror = (await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, ledgerId)))[0]!;
    expect(mirror.direction).toBe('member_payout');
    expect(Number(mirror.amountSettled)).toBe(100);
    expect(mirror.settledCurrencyId).toBe(eur);
  });

  it('بدونِ مبلغِ بانکی: مبلغِ درخواست با نرخِ **آموخته** از پرداختِ قبلی به ارزِ حساب تبدیل می‌شود', async () => {
    // پرداختِ قبلی (۵٬۲۰۰٬۰۰۰ ریال = ۱۰۰ یورو) نرخِ ۵۲٬۰۰۰ را در تنظیمات آموخت — پورتِ «نرخِ آموخته در تراکنش».
    const learned = await db.select().from(exchangeRates).where(eq(exchangeRates.effectiveDate, '2026-08-12'));
    expect(learned.length).toBeGreaterThan(0);

    const r = await db.insert(paymentRequests).values({
      projectId: project, userId: MEMBER, amount: '100', currencyId: eur, status: 'approved',
    }).returning({ id: paymentRequests.id });
    const { ledgerId } = await payouts.payRequest(manager(), r[0]!.id, { accountId: accB, entryDate: '2026-08-13' });
    const l = await row(ledgerId);
    expect(l.currencyId).toBe(eur);
    expect(Number(l.amountAccount)).toBe(5200000);
  });

  it('ستون‌ها: ماندهٔ قرارداد (توافق − پرداخت‌شده در ارزِ قرارداد) و خانهٔ بانکی', async () => {
    const r = await db.insert(paymentRequests).values({
      projectId: project, userId: MEMBER, amount: '300', currencyId: eur, status: 'pending', note: 'مرحلهٔ دوم',
    }).returning({ id: paymentRequests.id });
    request = r[0]!.id;
    const rows = await payouts.listRequests(owner());
    const mine = rows.find((x) => x.id === request)!;
    // ۱۰۰۰ توافق − (۱۰۰ + ۱۰۰) پرداخت‌شده.
    expect(Number(mine.remaining)).toBe(800);
    expect(mine.remainingCurrencyCode).toBe('EUR');
    expect(mine.bankCard).toBe('6037-0000');
    expect(mine.note).toBe('مرحلهٔ دوم');
  });
});

describe('کارکردهای تعدادی — Flow 1 (پورتِ from_unit)', () => {
  let free: number, claimed: number;

  beforeAll(async () => {
    const u = await db.insert(unitEntries).values([
      { projectId: project, userId: MEMBER, entryDate: '2026-08-01', quantity: '3', amount: '300', currencyId: eur, status: 'unpaid' },
      { projectId: project, userId: MEMBER, entryDate: '2026-08-02', quantity: '1', amount: '100', currencyId: eur, status: 'unpaid' },
      { projectId: project, userId: MEMBER, entryDate: '2026-08-03', quantity: '1', amount: '100', currencyId: eur, status: 'paid' },
    ]).returning({ id: unitEntries.id });
    free = u[0]!.id; claimed = u[1]!.id;
    await db.insert(paymentRequests).values({
      projectId: project, userId: MEMBER, amount: '100', currencyId: eur, status: 'pending', unitEntryId: claimed,
    });
  });

  it('فهرست: فقط پرداخت‌نشده‌های بدونِ درخواستِ باز', async () => {
    const rows = await payouts.listUnpaidUnits(manager());
    expect(rows.map((r) => r.id)).toEqual([free]);
    expect(rows[0]!.userName).toBe('علی');
  });

  it('⚠️ ردیفی که درخواستِ باز دارد مستقیم پرداخت نمی‌شود — ریسکِ پرداختِ دوباره', async () => {
    await expect(payouts.payUnit(manager(), claimed, { accountId: accA, entryDate: '2026-08-14' }))
      .rejects.toMatchObject({ code: 'has_request' });
  });

  it('پرداختِ مستقیم: ردیفِ برداشت به عضو با معادلِ تعهد؛ کارکرد «پرداخت‌شده» و وصل', async () => {
    const { ledgerId } = await payouts.payUnit(manager(), free, { accountId: accA, entryDate: '2026-08-14' });
    const l = await row(ledgerId);
    expect(l.direction).toBe('out');
    expect(l.receiverUserId).toBe(MEMBER);
    expect(l.projectId).toBe(project);
    const unit = (await db.select().from(unitEntries).where(eq(unitEntries.id, free)))[0]!;
    expect(unit.status).toBe('paid');
    expect(unit.ledgerId).toBe(ledgerId);
    await expect(payouts.payUnit(manager(), free, { accountId: accA, entryDate: '2026-08-15' }))
      .rejects.toMatchObject({ code: 'already_paid' });
    expect(await payouts.listUnpaidUnits(manager())).toHaveLength(0);
  });
});

describe('پرداخت‌های بی‌پروژه (پورتِ no_project_html)', () => {
  it('ردیف‌های بی‌پروژه با طرف، نوع و یادداشت فهرست می‌شوند', async () => {
    await db.insert(projectPayments).values({
      projectId: null, userId: MEMBER, direction: 'member_payout', amount: '50', currencyId: eur,
      note: 'پروژهٔ حذف‌شده: لندینگ', paidAt: new Date('2026-07-01T00:00:00Z'),
    });
    // ردیف‌های بی‌پروژهٔ آزمون‌های قبلی (پرداخت به عضو بدونِ پروژه) هم اینجا می‌آیند — مثلِ `project_id = 0` ِ افزونه.
    const rows = await payouts.listDetachedPayments(manager());
    const detached = rows.find((r) => r.note === 'پروژهٔ حذف‌شده: لندینگ');
    expect(detached).toMatchObject({ userName: 'علی', direction: 'member_payout', paidAt: '2026-07-01' });
    expect(rows.every((r) => r.userName !== null)).toBe(true);
  });
});

describe('هزینهٔ دوره‌ای — فروشنده به نام، فروشنده و دسته روی ردیف، قالب از ردیف', () => {
  it('vendorName فروشنده می‌سازد؛ پرداخت، فروشنده و دسته را روی ردیفِ دفتر می‌نشاند (پورتِ pay)', async () => {
    const id = await payouts.saveRecurring(manager(), {
      id: null, title: 'CDN', amount: '20', currencyId: eur, kind: 'recurring',
      intervalUnit: 'month', intervalCount: 1, startDate: '2026-08-05', nextDueDate: '2026-08-05',
      accountId: accA, vendorId: null, vendorName: 'Cloudflare', categoryTagId: hosting,
    });
    const saved = (await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)))[0]!;
    const vendor = (await db.select().from(vendors).where(eq(vendors.name, 'Cloudflare')))[0]!;
    expect(saved.vendorId).toBe(vendor.id);

    const { ledgerId } = await payouts.payRecurring(manager(), id, '2026-08-05');
    const l = await row(ledgerId!);
    expect(l.vendorId).toBe(vendor.id);
    expect(l.receiverLabel).toBe('Cloudflare');
    const rel = await db.select().from(tagRelations)
      .where(and(eq(tagRelations.objectType, 'ledger'), eq(tagRelations.objectId, ledgerId!)));
    expect(rel.map((r) => r.tagId)).toEqual([hosting]);
  });

  it('قالب از ردیف (پورتِ maybe_create_recurring): هر ۲ ماه → سررسیدِ بعدی دو ماه بعد؛ «یک‌بار» همان تاریخ', async () => {
    const base = entry({ entryDate: '2026-08-01', amount: '40', receiverLabel: 'Adobe', description: 'اشتراکِ ادوبی', tagIds: [hosting] });
    const every2 = await payouts.makeRecurringFromEntry(manager(), base, { kind: 'recurring', unit: 'month', count: 2 });
    const once = await payouts.makeRecurringFromEntry(manager(), base, { kind: 'once', unit: 'month', count: 1 });
    const rows = await db.select().from(recurringExpenses);
    const a = rows.find((r) => r.id === every2)!;
    const b = rows.find((r) => r.id === once)!;
    const adobe = (await db.select().from(vendors).where(eq(vendors.name, 'Adobe')))[0]!;
    expect(a).toMatchObject({ title: 'اشتراکِ ادوبی', intervalCount: 2, nextDueDate: '2026-10-01', vendorId: adobe.id, categoryTagId: hosting, accountId: accA });
    expect(b).toMatchObject({ kind: 'once', nextDueDate: '2026-08-01' });
  });
});
