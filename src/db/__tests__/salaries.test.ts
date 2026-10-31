import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  accounts, currencies, ledger, memberAccountEntries, memberSalaries, notifications, projectPayments, salaryPayments,
  userRoles, users,
} from '../schema';
import * as finance from '@/server/finance/service';
import * as salaries from '@/server/finance/salaries';
import * as memberAccounts from '@/server/finance/member-accounts';
import { getMyMoney } from '@/server/finance/my-money';
import { SalaryError } from '@/domain/team-money/salary';
import { MemberAccountError } from '@/domain/team-money/member-account';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor, Permission } from '@/domain/access/permissions';

/** حقوقِ ماهانه (۲.۵۰.۰) — دوره‌ها، توقف و ادامه، پرداخت و قسطِ قرض. */

const manager = (): Actor => ({ id: 1, roles: ['owner'], permissions: ['finance.manage', 'finance.view'] as Permission[], privateAccess: false });
const sara = (): Actor => ({ id: 2, roles: ['member'], permissions: [], privateAccess: false });

let eur: number, account: number;

beforeAll(async () => {
  await sql`truncate table salary_payments, member_salaries, member_account_entries, notifications, audit_log,
    project_payments, ledger, accounts, user_roles, users, currencies restart identity cascade`;
  eur = (await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id }))[0]!.id;
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 's@t', name: 'سارا' }, { email: 'c@t', name: 'کارفرما' }]);
  await db.insert(userRoles).values([{ userId: 1, role: 'owner' }, { userId: 2, role: 'member' }, { userId: 3, role: 'client' }]);
  account = (await db.insert(accounts).values({ name: 'حسابِ یورو', currencyId: eur, openingBalance: '10000' })
    .returning({ id: accounts.id }))[0]!.id;
});

afterAll(async () => { await sql.end(); });

const period = (over: Partial<salaries.SalaryInput> = {}): salaries.SalaryInput => ({
  userId: 2, amount: '1000', currencyId: eur, payDay: 1, accountId: account, startMonth: '2026-01', note: '', ...over,
});

const me = async () => (await salaries.listSalaries(manager())).find((p) => p.userId === 2)!;

let first: number;

describe('دوره‌ها', () => {
  it('شروع: از ماهِ شروع تا این ماه همه پرداخت‌نشده‌اند', async () => {
    first = await salaries.startSalary(manager(), period());
    const p = await me();
    expect(p.current?.id).toBe(first);
    expect(p.unpaid[0]!.month).toBe('2026-01-01');
    expect(p.unpaid[0]!.overdue).toBe(true);
  });

  it('دورهٔ بازِ دوم و هم‌پوشانی پذیرفته نیست', async () => {
    await expect(salaries.startSalary(manager(), period({ startMonth: '2026-06' }))).rejects.toThrow(SalaryError);
  });

  it('کارفرما و بی‌مجوز حقوق نمی‌گیرند/نمی‌دهند', async () => {
    await expect(salaries.startSalary(manager(), period({ userId: 3, startMonth: '2020-01' }))).rejects.toThrow(SalaryError);
    await expect(salaries.startSalary(sara(), period({ startMonth: '2020-01' }))).rejects.toThrow(ForbiddenError);
  });

  it('روزِ پرداختِ بیرون از ۱ تا ۲۸ رد می‌شود', async () => {
    await expect(salaries.updateSalary(manager(), first, { ...period(), payDay: 31 })).rejects.toThrow(SalaryError);
  });
});

describe('پرداخت', () => {
  it('ردیفِ دفترِ «حقوق» بی‌پروژه، بی‌آینه در پرداختِ عضو؛ عضو اعلان می‌گیرد', async () => {
    const id = await salaries.paySalary(manager(), {
      salaryId: first, month: '2026-01-01', accountId: account, paidAt: '2026-01-02', bonus: '100', note: '',
    });
    const [row] = await db.select().from(salaryPayments).where(eq(salaryPayments.id, id));
    expect(row!.netAmount).toBe('1100.0000');
    const [l] = await db.select().from(ledger).where(eq(ledger.id, row!.ledgerId!));
    expect(l!.direction).toBe('out');
    expect(l!.receiverUserId).toBe(2);
    expect(l!.projectId).toBeNull();
    expect(await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, l!.id))).toHaveLength(0);
    expect((await getMyMoney(sara())).noProjectPayouts).toHaveLength(0);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, 2));
    expect(notes.some((n) => n.type === 'salary.paid')).toBe(true);
    expect((await me()).unpaid.some((d) => d.month === '2026-01-01')).toBe(false);
  });

  it('یک ماه دو بار پرداخت نمی‌شود؛ ماهِ بیرونِ دوره هم نه', async () => {
    const pay = (month: string) => salaries.paySalary(manager(), { salaryId: first, month, accountId: account, paidAt: '2026-02-02', note: '' });
    await expect(pay('2026-01-01')).rejects.toThrow(SalaryError);
    await expect(pay('2025-12-01')).rejects.toThrow(SalaryError);
  });

  it('قسطِ قرض: خالص کم و بدهی کم می‌شود؛ قسطِ بیشتر از بدهی رد می‌شود', async () => {
    await memberAccounts.recordCash(manager(), {
      userId: 2, kind: 'loan', accountId: account, entryDate: '2026-01-10', amount: '300', currencyId: eur, note: '',
    });
    const pay = (installment: string) => salaries.paySalary(manager(), {
      salaryId: first, month: '2026-02-01', accountId: account, paidAt: '2026-02-01', installment, note: '',
    });
    await expect(pay('500')).rejects.toThrow(MemberAccountError);
    const id = await pay('200');
    const [row] = await db.select().from(salaryPayments).where(eq(salaryPayments.id, id));
    expect(row!.netAmount).toBe('800.0000');
    expect((await me()).debt[eur]).toBe('100.00');
    // قسط جدا حذف نمی‌شود — با پرداختِ همان ماه می‌رود.
    const [offset] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.salaryPaymentId, id));
    await expect(memberAccounts.deleteMemberEntry(manager(), offset!.id)).rejects.toThrow(MemberAccountError);
  });

  it('خالصِ صفر یا منفی پذیرفته نیست', async () => {
    await expect(salaries.paySalary(manager(), {
      salaryId: first, month: '2026-03-01', accountId: account, paidAt: '2026-03-01', deduction: '1000', note: '',
    })).rejects.toThrow(SalaryError);
  });

  it('برگرداندنِ پرداخت ردیفِ دفتر و قسط را هم برمی‌دارد', async () => {
    const [feb] = await db.select().from(salaryPayments).where(eq(salaryPayments.month, '2026-02-01'));
    await salaries.unpaySalary(manager(), feb!.id);
    expect(await db.select().from(ledger).where(eq(ledger.id, feb!.ledgerId!))).toHaveLength(0);
    expect(await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.salaryPaymentId, feb!.id))).toHaveLength(0);
    expect((await me()).debt[eur]).toBe('300.00');
  });

  it('ویرایشِ مبلغ در دفترکل خالص را هم‌گام می‌کند و اختلاف به پاداش می‌رود', async () => {
    const [jan] = await db.select().from(salaryPayments).where(eq(salaryPayments.month, '2026-01-01'));
    const [l] = await db.select().from(ledger).where(eq(ledger.id, jan!.ledgerId!));
    await finance.updateEntry(manager(), l!.id, {
      accountId: account, entryDate: '2026-01-03', direction: 'out', amount: '1150', currencyId: eur,
      description: l!.description, projectId: null, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: 2, receiverLabel: '',
    });
    const [after] = await db.select().from(salaryPayments).where(eq(salaryPayments.id, jan!.id));
    expect(after!.netAmount).toBe('1150.0000');
    expect(after!.bonus).toBe('150.0000');
    expect(after!.paidAt).toBe('2026-01-03');
    // هنوز آینه نمی‌شود.
    expect(await db.select().from(projectPayments).where(eq(projectPayments.ledgerId, l!.id))).toHaveLength(0);
  });
});

describe('توقف، ادامه و تغییرِ مبلغ', () => {
  it('توقف: ماه‌های بعد از آن پرداخت‌نشده حساب نمی‌شوند', async () => {
    await salaries.stopSalary(manager(), first, '2026-04');
    const p = await me();
    expect(p.unpaid.map((d) => d.month)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('توقف پیش از ماهِ پرداخت‌شده رد می‌شود', async () => {
    await expect(salaries.stopSalary(manager(), first, '2025-12')).rejects.toThrow(SalaryError);
  });

  it('ادامه: دورهٔ تازه بعد از وقفه؛ ماه‌های وقفه حقوق ندارند', async () => {
    const second = await salaries.startSalary(manager(), period({ startMonth: '2026-10', amount: '1200' }));
    const p = await me();
    expect(p.periods.map((x) => x.id)).toEqual([second, first]);
    const months = p.unpaid.map((d) => d.month);
    expect(months).not.toContain('2026-05-01');
    expect(months).not.toContain('2026-09-01');
  });

  it('تغییرِ مبلغ از یک ماه: دوره در ماهِ قبل بسته و پرداختِ آن ماه به دورهٔ تازه می‌رود', async () => {
    const [open] = await db.select().from(memberSalaries).where(eq(memberSalaries.startMonth, '2026-10-01'));
    await salaries.paySalary(manager(), { salaryId: open!.id, month: '2026-11-01', accountId: account, paidAt: '2026-11-01', note: '' });
    const next = await salaries.changeSalaryAmount(manager(), open!.id, '2026-11', '1500');
    const [old] = await db.select().from(memberSalaries).where(eq(memberSalaries.id, open!.id));
    expect(old!.endMonth).toBe('2026-10-01');
    const [nov] = await db.select().from(salaryPayments).where(eq(salaryPayments.month, '2026-11-01'));
    expect(nov!.salaryId).toBe(next);
    // مبلغِ پرداخت‌شده عکسِ همان لحظه است.
    expect(nov!.baseAmount).toBe('1200.0000');
  });

  it('دورهٔ با پرداخت حذف نمی‌شود', async () => {
    await expect(salaries.deleteSalary(manager(), first)).rejects.toThrow(SalaryError);
  });
});

describe('مالیِ من', () => {
  it('عضو دوره‌ها و پرداخت‌هایش را می‌بیند، بی‌شمارهٔ ردیفِ دفتر', async () => {
    const mine = await salaries.mySalary(sara());
    expect(mine!.periods.length).toBe(3);
    expect(mine!.payments.map((x) => x.month)).toEqual(['2026-11-01', '2026-01-01']);
    expect('ledgerId' in mine!.payments[0]!).toBe(false);
    expect(await salaries.mySalary(manager())).toBeNull();
  });
});
