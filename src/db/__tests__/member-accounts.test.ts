import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  accounts, currencies, exchangeRates, ledger, memberAccountEntries, notifications, projectMembers, projectPayments,
  projects, recurringExpenses, userRoles, users,
} from '../schema';
import * as finance from '@/server/finance/service';
import * as accountsService from '@/server/finance/member-accounts';
import { payRecurring, saveRecurring } from '@/server/finance/payouts';
import { getMyMoney } from '@/server/finance/my-money';
import { MemberAccountError } from '@/domain/team-money/member-account';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/** حسابِ اعضا (۲.۴۹.۰) — قرض، هدیه، هزینه برای عضو و سه راهِ تسویه. */

const manager = (): Actor => ({ id: 1, roles: ['owner'], permissions: ['finance.manage', 'finance.view'] as Permission[], privateAccess: false });
const sara = (): Actor => ({ id: 2, roles: ['member'], permissions: [], privateAccess: false });

let eur: number, irr: number, account: number, projectId: number;

beforeAll(async () => {
  await sql`truncate table member_account_entries, notifications, audit_log, project_payments, project_members, ledger,
    recurring_expenses, accounts, exchange_rates, projects, user_roles, users, currencies restart identity cascade`;
  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id; irr = c[1]!.id;
  await db.insert(exchangeRates).values({ fromCurrencyId: irr, toCurrencyId: eur, rate: '0.00001', effectiveDate: '2026-01-01' });
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 's@t', name: 'سارا' },
    { email: 'c@t', name: 'کارفرما' },
  ]);
  await db.insert(userRoles).values([
    { userId: 1, role: 'owner' }, { userId: 2, role: 'member' }, { userId: 3, role: 'client' },
  ]);
  account = (await db.insert(accounts).values({ name: 'حسابِ یورو', currencyId: eur, openingBalance: '1000' })
    .returning({ id: accounts.id }))[0]!.id;
  projectId = (await db.insert(projects).values({ title: 'سایتِ آئورا', price: '1000', currencyId: eur })
    .returning({ id: projects.id }))[0]!.id;
  await db.insert(projectMembers).values({ projectId, userId: 2, agreedAmount: '400', currencyId: eur });
});

afterAll(async () => { await sql.end(); });

const cash = (over: Partial<accountsService.CashInput> = {}): accountsService.CashInput => ({
  userId: 2, kind: 'loan', accountId: account, entryDate: '2026-06-01', amount: '500', currencyId: eur, note: '', ...over,
});

const balance = async (currencyId = eur) =>
  (await accountsService.listMemberAccounts(manager())).find((p) => p.userId === 2)!.balances
    .find((b) => b.currencyId === currencyId)?.amount ?? '0';

describe('قرض و هدیه', () => {
  it('قرض: ردیفِ برداشت در دفتر + بدهی، ولی «پرداخت به عضو» نیست', async () => {
    const id = await accountsService.recordCash(manager(), cash({ dueDate: '2026-09-01', note: 'خرید لپ‌تاپ' }));
    const [row] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
    expect(row!.ledgerId).not.toBeNull();
    const [l] = await db.select().from(ledger).where(eq(ledger.id, row!.ledgerId!));
    expect(l!.direction).toBe('out');
    expect(l!.receiverUserId).toBe(2);
    expect(l!.description).toContain('قرض به سارا');
    // ⚠️ دستمزد نیست — آینه نمی‌شود.
    expect(await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, l!.id))).toHaveLength(0);
    expect(await balance()).toBe('500.00');
    const notes = await db.select().from(notifications).where(eq(notifications.userId, 2));
    expect(notes.some((n) => n.type === 'member_account.debt')).toBe(true);
  });

  it('هدیه بدهی نمی‌سازد و در جمعِ هدیه‌ها می‌آید', async () => {
    await accountsService.recordCash(manager(), cash({ kind: 'gift', amount: '100', note: 'کادوی عروسی' }));
    const me = (await accountsService.listMemberAccounts(manager())).find((p) => p.userId === 2)!;
    expect(me.balances.find((b) => b.currencyId === eur)?.amount).toBe('500.00');
    expect(me.gifts.find((g) => g.currencyId === eur)?.amount).toBe('100.00');
  });

  it('عضو هدیه و قرضش را در «مالیِ من» می‌بیند، ولی جزوِ دریافتی‌های بی‌پروژه نیست', async () => {
    const mine = await accountsService.myAccount(sara());
    expect(mine!.lines.map((l) => l.kind).sort()).toEqual(['gift', 'loan']);
    const money = await getMyMoney(sara());
    expect(money.noProjectPayouts).toHaveLength(0);
  });

  it('کارفرما عضو نیست — قرض نمی‌گیرد', async () => {
    await expect(accountsService.recordCash(manager(), cash({ userId: 3 })))
      .rejects.toThrow(MemberAccountError);
  });

  it('بی‌مجوزِ مالی نه می‌بیند نه ثبت می‌کند', async () => {
    await expect(accountsService.listMemberAccounts(sara())).rejects.toThrow(ForbiddenError);
    await expect(accountsService.recordCash(sara(), cash())).rejects.toThrow(ForbiddenError);
  });

  it('ویرایشِ مبلغِ قرض در دفترکل بدهی را هم عوض می‌کند و آینه نمی‌سازد', async () => {
    const id = await accountsService.recordCash(manager(), cash({ amount: '50' }));
    const [row] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
    const [l] = await db.select().from(ledger).where(eq(ledger.id, row!.ledgerId!));
    await finance.updateEntry(manager(), l!.id, {
      accountId: account, entryDate: l!.entryDate, direction: 'out', amount: '80', currencyId: eur,
      description: l!.description, projectId: null, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: 2, receiverLabel: '',
    });
    const [after] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
    expect(after!.amount).toBe('80.0000');
    expect(await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, l!.id))).toHaveLength(0);
    await accountsService.deleteMemberEntry(manager(), id);
    // ردیفِ دفترش هم رفت.
    expect(await db.select().from(ledger).where(eq(ledger.id, l!.id))).toHaveLength(0);
    expect(await balance()).toBe('500.00');
  });
});

describe('سه راهِ تسویه', () => {
  it('بازپرداخت: ردیفِ واریز + کم شدنِ بدهی؛ بیش از بدهی رد می‌شود', async () => {
    await expect(accountsService.recordCash(manager(), cash({ kind: 'repayment', amount: '501' })))
      .rejects.toThrow(MemberAccountError);
    const id = await accountsService.recordCash(manager(), cash({ kind: 'repayment', amount: '200' }));
    const [row] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
    const [l] = await db.select().from(ledger).where(eq(ledger.id, row!.ledgerId!));
    expect(l!.direction).toBe('in');
    expect(l!.payerUserId).toBe(2);
    expect(await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, l!.id))).toHaveLength(0);
    expect(await balance()).toBe('300.00');
  });

  it('کسر از دستمزد: پروژه به همان اندازه پرداخت‌شده حساب می‌شود، بی‌ردیفِ دفتر', async () => {
    const ledgerBefore = (await db.select().from(ledger)).length;
    const id = await accountsService.recordOffset(manager(), {
      userId: 2, projectId, entryDate: '2026-06-10', amount: '100', currencyId: eur, note: 'قسطِ اول',
    });
    expect((await db.select().from(ledger)).length).toBe(ledgerBefore);
    const [row] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
    const [pay] = await db.select().from(projectPayments).where(eq(projectPayments.id, row!.paymentId!));
    expect(pay!.direction).toBe('member_payout');
    expect(pay!.ledgerId).toBeNull();
    expect(pay!.projectId).toBe(projectId);
    expect(await balance()).toBe('200.00');
    // طلبِ سارا از پروژه ۴۰۰ بود؛ حالا ۱۰۰ پرداخت‌شده دارد.
    const project = (await getMyMoney(sara())).memberProjects.find((p) => p.projectId === projectId)!;
    expect(Number(project.paid)).toBe(100);
    expect(Number(project.remaining)).toBe(300);
  });

  it('کسر برای پروژه‌ای که عضوش نیست رد می‌شود', async () => {
    const other = (await db.insert(projects).values({ title: 'دیگری', price: '0', currencyId: eur })
      .returning({ id: projects.id }))[0]!.id;
    await expect(accountsService.recordOffset(manager(), {
      userId: 2, projectId: other, entryDate: '2026-06-10', amount: '10', currencyId: eur, note: '',
    })).rejects.toThrow(MemberAccountError);
  });

  it('بخشیدن: بدهی کم و جمعِ «هدیه و بخشیده» زیاد می‌شود', async () => {
    await accountsService.recordForgive(manager(), { userId: 2, entryDate: '2026-06-11', amount: '50', currencyId: eur, note: '' });
    const me = (await accountsService.listMemberAccounts(manager())).find((p) => p.userId === 2)!;
    expect(me.balances.find((b) => b.currencyId === eur)?.amount).toBe('150.00');
    expect(me.gifts.find((g) => g.currencyId === eur)?.amount).toBe('150.00');
  });

  it('⚠️ بدهی به تفکیکِ ارز: تسویهٔ ریالی بدهیِ یورویی را صاف نمی‌کند', async () => {
    await expect(accountsService.recordForgive(manager(), { userId: 2, entryDate: '2026-06-11', amount: '1', currencyId: irr, note: '' }))
      .rejects.toThrow(MemberAccountError);
  });

  it('حذفِ قرضی که تسویه‌اش از خودش بیشتر شود رد می‌شود', async () => {
    const [loan] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.kind, 'loan'));
    await expect(accountsService.deleteMemberEntry(manager(), loan!.id)).rejects.toThrow(MemberAccountError);
  });

  it('حذفِ کسر، ردیفِ پرداختِ پروژه را هم برمی‌دارد', async () => {
    const [offset] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.kind, 'offset'));
    await accountsService.deleteMemberEntry(manager(), offset!.id);
    expect(await db.select().from(projectPayments).where(eq(projectPayments.id, offset!.paymentId!))).toHaveLength(0);
    expect(await balance()).toBe('250.00');
  });
});

describe('هزینه برای عضو', () => {
  it('هزینهٔ یک‌باره: پول به فروشنده، سهمِ عضو بدهی می‌شود؛ حذفش ردیفِ دفتر را نگه می‌دارد', async () => {
    const id = await accountsService.recordCash(manager(), cash({ kind: 'charge', amount: '40', vendorLabel: 'Google Cloud', sharePct: '50' }));
    const [row] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
    expect(row!.amount).toBe('20.0000');
    const [l] = await db.select().from(ledger).where(eq(ledger.id, row!.ledgerId!));
    expect(l!.receiverUserId).toBeNull();
    expect(l!.receiverLabel).toBe('Google Cloud');
    expect(await balance()).toBe('270.00');
    await accountsService.deleteMemberEntry(manager(), id);
    expect(await db.select().from(ledger).where(eq(ledger.id, l!.id))).toHaveLength(1);
    expect(await balance()).toBe('250.00');
  });

  it('اشتراکِ دوره‌ای: هر «ثبت پرداخت» سهمِ عضو را بدهکار می‌کند', async () => {
    const id = await saveRecurring(manager(), {
      id: null, title: 'Cloud سارا', amount: '30', currencyId: eur, kind: 'recurring',
      intervalUnit: 'month', intervalCount: 1, startDate: '2026-06-01', nextDueDate: '2026-06-01',
      accountId: account, vendorId: null, chargeUserId: 2, chargePct: '100',
    });
    await payRecurring(manager(), id, '2026-06-01');
    await payRecurring(manager(), id, '2026-07-01');
    const charges = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.recurringExpenseId, id));
    expect(charges).toHaveLength(2);
    expect(charges.every((c) => c.ledgerId !== null && c.amount === '30.0000')).toBe(true);
    expect(await balance()).toBe('310.00');
    const [exp] = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id));
    expect(exp!.nextDueDate).toBe('2026-08-01');
  });
});
