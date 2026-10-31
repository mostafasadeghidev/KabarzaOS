import { and, asc, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  accounts, auditLog, currencies, memberAccountEntries, memberSalaries, salaryPayments, userRoles, users,
} from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManage, assertCanView } from '@/domain/access/guard';
import { assertDeletable } from '@/domain/ledger/fiscal';
import { assertWithinBalance, balancesByCurrency, parseAmount } from '@/domain/team-money/member-account';
import {
  addMonths, dueMonths, isOverdue, monthOf, netOf, overlaps, parseOptional, parsePayDay, periodFor, SalaryError,
} from '@/domain/team-money/salary';
import { notify } from '@/server/notifications/service';
import { assertMember, balanceOf, currencyCode, eurOf, tagBySlug } from './member-accounts';
import { createEntry, currentLockDate, deleteEntry } from './service';

/**
 * حقوقِ ماهانه (۲.۵۰.۰) — دوره‌های حقوقِ هر عضو و پرداختِ هر ماه.
 *
 * ⚠️ حقوق هزینهٔ ثابتِ آژانس است، نه دستمزدِ پروژه: ردیفِ دفترش پروژه ندارد و در
 * «پرداخت به عضو» آینه **نمی‌شود** (`skipMirror`)؛ عضو آن را در بخشِ «حقوقِ
 * ماهانه» ِ مالیِ خودش می‌بیند، جدا از دستمزدِ پروژه‌ها.
 * ⚠️ مبلغِ پایهٔ هر پرداخت عکسِ همان لحظه است؛ تغییرِ بعدیِ حقوق ماه‌های
 * پرداخت‌شده را عوض نمی‌کند.
 */

/** دستهٔ «حقوق» ِ دفتر (از ۰۰۱۹). */
const SALARY_TAG = 'ledger-3';
const PAID_NOTICE = 'salary.paid';

async function audit(actor: Actor, action: string, objectId: number, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'salary', objectId,
    before: null, after: after ?? null,
  });
}

function thisMonth(): string {
  return monthOf(new Date().toISOString().slice(0, 10));
}

async function loadPeriod(id: number) {
  const [row] = await db.select().from(memberSalaries).where(eq(memberSalaries.id, id));
  if (!row) throw new SalaryError('not_found');
  return row;
}

/**
 * گاردِ بازه: با دوره‌های دیگرِ همین عضو هم‌پوشانی نداشته باشد و پرداخت‌های
 * خودِ این دوره بیرونش نیفتند.
 */
async function assertRange(userId: number, range: { startMonth: string; endMonth: string | null }, selfId: number | null) {
  if (range.endMonth !== null && range.endMonth < range.startMonth) throw new SalaryError('invalid_month');
  const others = await db.select({ startMonth: memberSalaries.startMonth, endMonth: memberSalaries.endMonth })
    .from(memberSalaries)
    .where(and(eq(memberSalaries.userId, userId), selfId ? ne(memberSalaries.id, selfId) : undefined));
  if (others.some((o) => overlaps(o, range))) throw new SalaryError('overlap');
  if (selfId) {
    const paid = await db.select({ month: salaryPayments.month }).from(salaryPayments).where(eq(salaryPayments.salaryId, selfId));
    if (paid.some((p) => p.month < range.startMonth || (range.endMonth !== null && p.month > range.endMonth))) {
      throw new SalaryError('paid_outside');
    }
  }
}

/* ------------------------------------------------------------------ *
 * دوره‌ها
 * ------------------------------------------------------------------ */

export interface SalaryInput {
  userId: number;
  amount: string;
  currencyId: number;
  payDay: string | number;
  accountId: number | null;
  startMonth: string;
  /** خالی = ادامه دارد. */
  endMonth?: string | null;
  note: string;
}

/** شروعِ حقوق — یا ادامهٔ آن پس از توقف (دورهٔ تازه). */
export async function startSalary(actor: Actor, raw: SalaryInput): Promise<number> {
  assertCanManage(actor, 'finance');
  await assertMember(raw.userId).catch(() => { throw new SalaryError('not_member'); });
  const range = { startMonth: monthOf(raw.startMonth), endMonth: raw.endMonth ? monthOf(raw.endMonth) : null };
  const amount = parseSalaryAmount(raw.amount);
  const payDay = parsePayDay(raw.payDay);
  await assertRange(raw.userId, range, null);
  const [row] = await db.insert(memberSalaries).values({
    userId: raw.userId,
    amount,
    currencyId: raw.currencyId,
    payDay,
    accountId: raw.accountId || null,
    ...range,
    note: raw.note.trim(),
    createdBy: actor.id,
  }).returning({ id: memberSalaries.id });
  await audit(actor, 'salary.start', row!.id, { userId: raw.userId, amount, currencyId: raw.currencyId, ...range });
  return row!.id;
}

/** ویرایشِ یک دوره — مبلغِ تازه فقط روی ماه‌های پرداخت‌نشده اثر دارد. */
export async function updateSalary(actor: Actor, id: number, raw: Omit<SalaryInput, 'userId'>): Promise<void> {
  assertCanManage(actor, 'finance');
  const row = await loadPeriod(id);
  const range = { startMonth: monthOf(raw.startMonth), endMonth: raw.endMonth ? monthOf(raw.endMonth) : null };
  const amount = parseSalaryAmount(raw.amount);
  const payDay = parsePayDay(raw.payDay);
  if (raw.currencyId !== row.currencyId && await hasPayments(id)) throw new SalaryError('currency_locked');
  await assertRange(row.userId, range, id);
  await db.update(memberSalaries).set({
    amount, currencyId: raw.currencyId, payDay, accountId: raw.accountId || null, ...range,
    note: raw.note.trim(), updatedAt: new Date(),
  }).where(eq(memberSalaries.id, id));
  await audit(actor, 'salary.update', id, { amount, currencyId: raw.currencyId, payDay, ...range });
}

/** توقف — `lastMonth` آخرین ماهی است که حقوق دارد. */
export async function stopSalary(actor: Actor, id: number, lastMonth: string): Promise<void> {
  assertCanManage(actor, 'finance');
  const row = await loadPeriod(id);
  const endMonth = monthOf(lastMonth);
  await assertRange(row.userId, { startMonth: row.startMonth, endMonth }, id);
  await db.update(memberSalaries).set({ endMonth, updatedAt: new Date() }).where(eq(memberSalaries.id, id));
  await audit(actor, 'salary.stop', id, { userId: row.userId, endMonth });
}

/**
 * تغییرِ مبلغ از یک ماه به بعد — دوره در ماهِ قبل بسته و دورهٔ تازه با مبلغِ نو
 * باز می‌شود؛ پرداخت‌های همان ماه به بعد به دورهٔ تازه می‌روند (مبلغِ پرداخت‌شده‌شان
 * دست نمی‌خورد). از ماهِ شروعِ خودِ دوره یعنی همان دوره ویرایش شود.
 */
export async function changeSalaryAmount(actor: Actor, id: number, fromMonth: string, rawAmount: string): Promise<number> {
  assertCanManage(actor, 'finance');
  const row = await loadPeriod(id);
  const from = monthOf(fromMonth);
  const amount = parseSalaryAmount(rawAmount);
  if (from < row.startMonth || (row.endMonth !== null && from > row.endMonth)) throw new SalaryError('invalid_month');
  if (from === row.startMonth) {
    await db.update(memberSalaries).set({ amount, updatedAt: new Date() }).where(eq(memberSalaries.id, id));
    await audit(actor, 'salary.update', id, { amount });
    return id;
  }
  await db.update(memberSalaries).set({ endMonth: addMonths(from, -1), updatedAt: new Date() }).where(eq(memberSalaries.id, id));
  const [next] = await db.insert(memberSalaries).values({
    userId: row.userId,
    amount,
    currencyId: row.currencyId,
    payDay: row.payDay,
    accountId: row.accountId,
    startMonth: from,
    endMonth: row.endMonth,
    note: row.note,
    createdBy: actor.id,
  }).returning({ id: memberSalaries.id });
  await db.update(salaryPayments).set({ salaryId: next!.id })
    .where(and(eq(salaryPayments.salaryId, id), gte(salaryPayments.month, from)));
  await audit(actor, 'salary.change', next!.id, { previous: id, fromMonth: from, amount });
  return next!.id;
}

/** حذفِ دوره‌ای که هنوز پرداختی ندارد — مثلاً اشتباه ثبت شده. */
export async function deleteSalary(actor: Actor, id: number): Promise<void> {
  assertCanManage(actor, 'finance');
  const row = await loadPeriod(id);
  if (await hasPayments(id)) throw new SalaryError('has_payments');
  await db.delete(memberSalaries).where(eq(memberSalaries.id, id));
  await audit(actor, 'salary.delete', id, { userId: row.userId, amount: row.amount, startMonth: row.startMonth, endMonth: row.endMonth });
}

async function hasPayments(salaryId: number): Promise<boolean> {
  return (await db.select({ id: salaryPayments.id }).from(salaryPayments).where(eq(salaryPayments.salaryId, salaryId)).limit(1)).length > 0;
}

function parseSalaryAmount(raw: string): string {
  try {
    return parseAmount(raw);
  } catch {
    throw new SalaryError('invalid_amount');
  }
}

/* ------------------------------------------------------------------ *
 * پرداخت
 * ------------------------------------------------------------------ */

export interface PayInput {
  salaryId: number;
  month: string;
  accountId: number;
  paidAt: string;
  bonus?: string | null;
  deduction?: string | null;
  /** قسطِ قرض که از همین حقوق کم می‌شود — به ارزِ حقوق. */
  installment?: string | null;
  note: string;
}

/**
 * پرداختِ حقوقِ یک ماه — ردیفِ دفتر (خالص) + ردیفِ پرداخت + اگر قسط دارد،
 * یک «کسر» در حسابِ اعضا.
 * ⚠️ هر ماه یک بار (`salary_payment_month_ux`)؛ قسط از بدهی بیشتر نمی‌شود.
 */
export async function paySalary(actor: Actor, raw: PayInput): Promise<number> {
  assertCanManage(actor, 'finance');
  if (!raw.accountId) throw new SalaryError('no_account');
  const period = await loadPeriod(raw.salaryId);
  const month = monthOf(raw.month);
  if (!periodFor([period], month)) throw new SalaryError('not_due');
  const [paid] = await db.select({ id: salaryPayments.id }).from(salaryPayments)
    .where(and(eq(salaryPayments.userId, period.userId), eq(salaryPayments.month, month))).limit(1);
  if (paid) throw new SalaryError('already_paid');

  const bonus = parseOptional(raw.bonus);
  const deduction = parseOptional(raw.deduction);
  const installment = parseOptional(raw.installment);
  const net = netOf(period.amount, bonus, deduction, installment);
  if (!(Number(net) > 0)) throw new SalaryError('net_not_positive');
  const name = await assertMember(period.userId).catch(() => { throw new SalaryError('not_member'); });
  if (Number(installment) > 0) assertWithinBalance(await balanceOf(period.userId, period.currencyId), installment);

  const note = raw.note.trim();
  const label = month.slice(0, 7);
  const ledgerId = await createEntry(actor, {
    accountId: raw.accountId,
    entryDate: raw.paidAt,
    direction: 'out',
    amount: net,
    currencyId: period.currencyId,
    description: [`حقوقِ ${name} — ${label}`, note].filter(Boolean).join(' — '),
    projectId: null,
    tagIds: await tagBySlug(SALARY_TAG),
    officeId: null,
    payerUserId: null,
    payerLabel: '',
    receiverUserId: period.userId,
    receiverLabel: '',
    skipMirror: true,
  });

  const [row] = await db.insert(salaryPayments).values({
    salaryId: period.id,
    userId: period.userId,
    month,
    baseAmount: period.amount,
    bonus,
    deduction,
    installment,
    netAmount: net,
    currencyId: period.currencyId,
    paidAt: raw.paidAt,
    ledgerId,
    note,
    createdBy: actor.id,
  }).returning({ id: salaryPayments.id });

  if (Number(installment) > 0) {
    await db.insert(memberAccountEntries).values({
      userId: period.userId,
      kind: 'offset',
      amount: installment,
      currencyId: period.currencyId,
      amountEur: await eurOf(installment, period.currencyId),
      entryDate: raw.paidAt,
      note: `حقوقِ ${label}`,
      salaryPaymentId: row!.id,
      createdBy: actor.id,
    });
  }

  await audit(actor, 'salary.pay', row!.id, { userId: period.userId, month, net, bonus, deduction, installment, ledgerId });
  if (period.userId !== actor.id) {
    await notify([period.userId], {
      type: PAID_NOTICE,
      title: 'حقوقِ {month} به مبلغِ {amount} پرداخت شد',
      params: {
        month: label,
        amount: `${Number(net).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${await currencyCode(period.currencyId)}`,
      },
      url: '/my-money#salary',
    });
  }
  return row!.id;
}

/** برگرداندنِ پرداختِ یک ماه — ردیفِ دفتر و قسطِ قرض هم با آن می‌روند (cascade). */
export async function unpaySalary(actor: Actor, paymentId: number): Promise<void> {
  assertCanManage(actor, 'finance');
  const [row] = await db.select().from(salaryPayments).where(eq(salaryPayments.id, paymentId));
  if (!row) throw new SalaryError('not_found');
  if (row.ledgerId) {
    await deleteEntry(actor, row.ledgerId);
  } else {
    assertDeletable(await currentLockDate(), row.paidAt);
    await db.delete(salaryPayments).where(eq(salaryPayments.id, paymentId));
  }
  await audit(actor, 'salary.unpay', paymentId, { userId: row.userId, month: row.month, net: row.netAmount });
}

/**
 * پس از ویرایشِ ردیفِ دفترِ حقوق در دفترکل — تاریخ و خالص هم‌گام می‌شوند و
 * اختلافِ مبلغ به پاداش (بیشتر) یا کسر (کمتر) می‌رود تا جمعِ ریز درست بماند.
 */
export async function syncSalaryPayment(ledgerId: number, entry: { amount: string; entryDate: string }): Promise<void> {
  const [row] = await db.select().from(salaryPayments).where(eq(salaryPayments.ledgerId, ledgerId));
  if (!row) return;
  const diff = Math.round((Number(entry.amount) - Number(row.netAmount)) * 10000) / 10000;
  await db.update(salaryPayments).set({
    netAmount: Number(entry.amount).toFixed(4),
    paidAt: entry.entryDate,
    ...(diff > 0 ? { bonus: (Number(row.bonus) + diff).toFixed(4) } : {}),
    ...(diff < 0 ? { deduction: (Number(row.deduction) - diff).toFixed(4) } : {}),
    updatedAt: new Date(),
  }).where(eq(salaryPayments.id, row.id));
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

const periodColumns = {
  id: memberSalaries.id,
  userId: memberSalaries.userId,
  amount: memberSalaries.amount,
  currencyId: memberSalaries.currencyId,
  currencyCode: currencies.code,
  payDay: memberSalaries.payDay,
  accountId: memberSalaries.accountId,
  accountName: accounts.name,
  startMonth: memberSalaries.startMonth,
  endMonth: memberSalaries.endMonth,
  note: memberSalaries.note,
};

const paymentColumns = {
  id: salaryPayments.id,
  salaryId: salaryPayments.salaryId,
  userId: salaryPayments.userId,
  month: salaryPayments.month,
  baseAmount: salaryPayments.baseAmount,
  bonus: salaryPayments.bonus,
  deduction: salaryPayments.deduction,
  installment: salaryPayments.installment,
  netAmount: salaryPayments.netAmount,
  currencyId: salaryPayments.currencyId,
  currencyCode: currencies.code,
  paidAt: salaryPayments.paidAt,
  ledgerId: salaryPayments.ledgerId,
  note: salaryPayments.note,
};

async function loadPeriods(userId?: number) {
  const rows = await db.select(periodColumns).from(memberSalaries)
    .leftJoin(currencies, eq(currencies.id, memberSalaries.currencyId))
    .leftJoin(accounts, eq(accounts.id, memberSalaries.accountId))
    .where(userId ? eq(memberSalaries.userId, userId) : undefined)
    .orderBy(desc(memberSalaries.startMonth));
  return rows.map((r) => ({ ...r, currencyCode: r.currencyCode ?? '' }));
}

async function loadPayments(userId?: number) {
  const rows = await db.select(paymentColumns).from(salaryPayments)
    .leftJoin(currencies, eq(currencies.id, salaryPayments.currencyId))
    .where(userId ? eq(salaryPayments.userId, userId) : undefined)
    .orderBy(desc(salaryPayments.month));
  return rows.map((r) => ({ ...r, currencyCode: r.currencyCode ?? '' }));
}

export type SalaryPeriodRow = Awaited<ReturnType<typeof loadPeriods>>[number];
export type SalaryPaymentRow = Awaited<ReturnType<typeof loadPayments>>[number];

/** ماه‌های پرداخت‌نشده تا ماهِ جاری، با پرچمِ «عقب‌افتاده». */
function unpaid(periods: SalaryPeriodRow[], payments: SalaryPaymentRow[], today: string) {
  const paid = new Set(payments.map((p) => p.month));
  return dueMonths(periods, monthOf(today))
    .filter((d) => !paid.has(d.month))
    .map((d) => ({
      month: d.month,
      salaryId: d.period.id,
      amount: d.period.amount,
      currencyId: d.period.currencyId,
      currencyCode: d.period.currencyCode,
      accountId: d.period.accountId,
      payDay: d.period.payDay,
      overdue: isOverdue(d.month, d.period.payDay, today),
    }));
}

/** تبِ «حقوق‌ها» ِ مالی — هر عضو با دوره‌ها، پرداخت‌ها و ماه‌های مانده. */
export async function listSalaries(actor: Actor) {
  assertCanView(actor, 'finance');
  const [periods, payments, members, debts] = await Promise.all([
    loadPeriods(),
    loadPayments(),
    db.selectDistinct({ id: users.id, name: users.name }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt)))
      .orderBy(asc(users.name)),
    db.select({ userId: memberAccountEntries.userId, kind: memberAccountEntries.kind, amount: memberAccountEntries.amount, currencyId: memberAccountEntries.currencyId })
      .from(memberAccountEntries),
  ]);
  const known = new Set(members.map((m) => m.id));
  const missing = [...new Set(periods.map((p) => p.userId))].filter((id) => !known.has(id));
  const former = missing.length === 0 ? [] : await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, missing));
  const today = new Date().toISOString().slice(0, 10);

  return [...members, ...former].map((m) => {
    const own = periods.filter((p) => p.userId === m.id);
    const paid = payments.filter((p) => p.userId === m.id);
    const debt = balancesByCurrency(debts.filter((d) => d.userId === m.id));
    return {
      userId: m.id,
      name: m.name,
      active: known.has(m.id),
      current: own.find((p) => p.endMonth === null || p.endMonth >= thisMonth()) ?? null,
      periods: own,
      payments: paid,
      unpaid: unpaid(own, paid, today),
      /** بدهیِ باز به تفکیکِ ارز — سقفِ قسطی که از حقوق کم می‌شود. */
      debt: Object.fromEntries([...debt].filter(([, v]) => v > 0.005).map(([c, v]) => [c, v.toFixed(2)])) as Record<number, string>,
    };
  });
}

export type SalaryPerson = Awaited<ReturnType<typeof listSalaries>>[number];

/** «مالیِ من» — دوره‌ها و پرداخت‌های حقوقِ خودِ عضو؛ بی‌دوره null. */
export async function mySalary(actor: Actor) {
  if (!actor.roles.includes('member')) return null;
  const [periods, payments] = await Promise.all([loadPeriods(actor.id), loadPayments(actor.id)]);
  if (periods.length === 0 && payments.length === 0) return null;
  const month = thisMonth();
  return {
    current: periods.find((p) => p.startMonth <= month && (p.endMonth === null || p.endMonth >= month)) ?? null,
    periods: periods.map(({ accountId: _a, accountName: _n, note: _note, ...p }) => p),
    payments: payments.map(({ ledgerId: _l, ...p }) => p),
  };
}

export type MySalary = NonNullable<Awaited<ReturnType<typeof mySalary>>>;
