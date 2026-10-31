import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditLog, currencies, ledger, memberAccountEntries, projectMembers, projectPayments, projects,
  recurringExpenses, tags, userRoles, users,
} from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { assertCanManage, assertCanView } from '@/domain/access/guard';
import { assertWritable, assertDeletable } from '@/domain/ledger/fiscal';
import { paymentNote } from '@/domain/ledger/mirror';
import { convert } from '@/domain/currency/rates';
import {
  assertWithinBalance, balancesByCurrency, giftsByCurrency, MemberAccountError, parseAmount, parseShare, shareOf,
  type MemberAccountKind,
} from '@/domain/team-money/member-account';
import { notify } from '@/server/notifications/service';
import { createEntry, currentLockDate, deleteEntry, rateSource } from './service';

/**
 * حسابِ اعضا (۲.۴۹.۰) — قرض، هدیه، هزینه‌ای که شرکت برای عضو داد، و تسویه‌شان.
 *
 * ⚠️ هر چه پولِ نقد دارد (قرض، هدیه، هزینه، بازپرداخت) یک **ردیفِ دفتر** می‌نویسد
 * و از همان گاردهای حسابداری رد می‌شود (قفلِ دوره، مجوزِ حساب، نرخِ ارز). کسر از
 * دستمزد و بخشش پولِ نقد ندارند؛ فقط قفلِ دوره را می‌گذرانند.
 * ⚠️ قرض، هدیه و بازپرداخت در «پرداخت به عضو» آینه **نمی‌شوند**: دستمزد نیستند و
 * وگرنه جمعِ دریافتیِ عضو بی‌جهت بالا می‌رفت.
 */

async function audit(actor: Actor, action: string, objectId: number, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action, objectType: 'member_account', objectId,
    before: null, after: after ?? null,
  });
}

/** عضوِ فعالِ تیم — قرض و هدیه فقط برای اعضاست، نه کارفرما. */
export async function assertMember(userId: number): Promise<string> {
  const rows = await db.select({ name: users.name }).from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.id, userId), eq(userRoles.role, 'member'), isNull(users.deletedAt)))
    .limit(1);
  if (!rows[0]) throw new MemberAccountError('not_member');
  return rows[0].name;
}

export async function tagBySlug(slug: string): Promise<number[]> {
  const rows = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
  return rows.map((r) => r.id);
}

export async function currencyCode(id: number): Promise<string> {
  return (await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.id, id)))[0]?.code ?? '';
}

export async function eurOf(amount: string, currencyId: number): Promise<string> {
  const { source, baseCurrencyId } = await rateSource();
  return convert(source, amount, currencyId, baseCurrencyId) ?? '0';
}

/** ماندهٔ بدهیِ یک عضو در یک ارز. */
export async function balanceOf(userId: number, currencyId: number): Promise<number> {
  const rows = await db.select({
    kind: memberAccountEntries.kind, amount: memberAccountEntries.amount, currencyId: memberAccountEntries.currencyId,
  }).from(memberAccountEntries).where(and(
    eq(memberAccountEntries.userId, userId), eq(memberAccountEntries.currencyId, currencyId),
  ));
  return balancesByCurrency(rows).get(currencyId) ?? 0;
}

/* ------------------------------------------------------------------ *
 * اعلان به خودِ عضو
 * ------------------------------------------------------------------ */

const NOTICE: Record<MemberAccountKind, { type: string; title: string }> = {
  loan: { type: 'member_account.debt', title: 'قرضِ {amount} به حسابِ شما ثبت شد' },
  charge: { type: 'member_account.debt', title: '{amount} بابتِ «{title}» به حسابِ شما اضافه شد' },
  gift: { type: 'member_account.gift', title: 'هدیه‌ای به مبلغِ {amount} برای شما ثبت شد' },
  repayment: { type: 'member_account.settled', title: 'بازپرداختِ {amount} از بدهیِ شما ثبت شد' },
  offset: { type: 'member_account.settled', title: '{amount} از بدهیِ شما بابتِ پروژهٔ «{title}» کسر شد' },
  forgive: { type: 'member_account.settled', title: '{amount} از بدهیِ شما بخشیده شد' },
};

async function tellMember(actor: Actor, userId: number, kind: MemberAccountKind, amount: string, currencyId: number, title: string, note: string) {
  if (userId === actor.id) return;
  const n = NOTICE[kind];
  await notify([userId], {
    type: n.type,
    title: n.title,
    body: note ? '{note}' : undefined,
    params: { amount: `${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${await currencyCode(currencyId)}`, title, note },
    url: '/my-money#account',
  });
}

/* ------------------------------------------------------------------ *
 * ثبت
 * ------------------------------------------------------------------ */

export interface CashInput {
  userId: number;
  kind: 'loan' | 'gift' | 'charge' | 'repayment';
  accountId: number;
  entryDate: string;
  amount: string;
  currencyId: number;
  note: string;
  /** موعدِ برگشتِ قرض — اختیاری. */
  dueDate?: string | null;
  /** هزینه: به چه کسی پرداخت شد (مثلاً «Google Cloud»). */
  vendorLabel?: string;
  /** هزینه: سهمِ عضو، درصد (پیش‌فرض ۱۰۰). */
  sharePct?: string | null;
}

const CASH_TEXT: Record<CashInput['kind'], string> = {
  loan: 'قرض به {name}',
  gift: 'هدیه به {name}',
  charge: 'هزینه برای {name}',
  repayment: 'بازپرداختِ قرضِ {name}',
};

/**
 * قرض، هدیه، هزینه یا بازپرداخت — یک ردیفِ دفتر + یک ردیفِ حسابِ عضو.
 * ⚠️ بازپرداخت از بدهی بیشتر نمی‌شود؛ گارد پیش از نوشتنِ ردیفِ دفتر است.
 */
export async function recordCash(actor: Actor, raw: CashInput): Promise<number> {
  assertCanManage(actor, 'finance');
  if (!raw.accountId) throw new MemberAccountError('no_account');
  const amount = parseAmount(raw.amount);
  const sharePct = raw.kind === 'charge' ? parseShare(raw.sharePct) : '100';
  const name = await assertMember(raw.userId);
  if (raw.kind === 'repayment') assertWithinBalance(await balanceOf(raw.userId, raw.currencyId), amount);

  const note = raw.note.trim();
  const head = CASH_TEXT[raw.kind].replace('{name}', name);
  const vendor = (raw.vendorLabel ?? '').trim();
  const description = [head, raw.kind === 'charge' && vendor ? vendor : '', note].filter(Boolean).join(' — ');
  const tagIds = raw.kind === 'loan' || raw.kind === 'repayment'
    ? await tagBySlug('ledger-4')
    : raw.kind === 'gift' ? await tagBySlug('ledger-gift') : [];

  const ledgerId = await createEntry(actor, {
    accountId: raw.accountId,
    entryDate: raw.entryDate,
    direction: raw.kind === 'repayment' ? 'in' : 'out',
    amount,
    currencyId: raw.currencyId,
    description,
    projectId: null,
    tagIds,
    officeId: null,
    payerUserId: raw.kind === 'repayment' ? raw.userId : null,
    payerLabel: '',
    // هزینه به فروشنده پرداخت شده، نه به عضو — عضو فقط بدهکارِ آن است.
    receiverUserId: raw.kind === 'loan' || raw.kind === 'gift' ? raw.userId : null,
    receiverLabel: raw.kind === 'charge' ? vendor : '',
    skipMirror: true,
  });

  const [ledgerRow] = await db.select({ amountEur: ledger.amountEur }).from(ledger).where(eq(ledger.id, ledgerId));
  const share = shareOf(amount, sharePct);
  const [row] = await db.insert(memberAccountEntries).values({
    userId: raw.userId,
    kind: raw.kind,
    amount: share,
    currencyId: raw.currencyId,
    amountEur: shareOf(ledgerRow?.amountEur ?? '0', sharePct),
    sharePct,
    entryDate: raw.entryDate,
    dueDate: raw.kind === 'loan' && raw.dueDate ? raw.dueDate : null,
    note,
    ledgerId,
    createdBy: actor.id,
  }).returning({ id: memberAccountEntries.id });

  await audit(actor, `member_account.${raw.kind}`, row!.id, { userId: raw.userId, amount: share, currencyId: raw.currencyId, ledgerId });
  await tellMember(actor, raw.userId, raw.kind, share, raw.currencyId, vendor || note, note);
  return row!.id;
}

/**
 * سهمِ عضو از یک نوبتِ پرداختِ اشتراک — از `payRecurring`.
 * ⚠️ بی‌حساب هم ثبت می‌شود (`ledgerId` خالی): اشتراک ممکن است با کارتِ شخصی
 * پرداخت شده باشد، ولی بدهیِ عضو همچنان واقعی است.
 */
export async function chargeFromRecurring(
  actor: Actor,
  expense: { id: number; title: string; amount: string; currencyId: number; chargeUserId: number; chargePct: string; nextDueDate: string },
  ledgerId: number | null,
): Promise<number | null> {
  if (!(Number(expense.amount) > 0)) return null;
  const share = shareOf(expense.amount, expense.chargePct);
  const ledgerEur = ledgerId
    ? (await db.select({ amountEur: ledger.amountEur }).from(ledger).where(eq(ledger.id, ledgerId)))[0]?.amountEur ?? null
    : null;
  const [row] = await db.insert(memberAccountEntries).values({
    userId: expense.chargeUserId,
    kind: 'charge',
    amount: share,
    currencyId: expense.currencyId,
    amountEur: ledgerEur ? shareOf(ledgerEur, expense.chargePct) : await eurOf(share, expense.currencyId),
    sharePct: expense.chargePct,
    entryDate: expense.nextDueDate,
    note: expense.title,
    ledgerId,
    recurringExpenseId: expense.id,
    createdBy: actor.id,
  }).returning({ id: memberAccountEntries.id });
  await audit(actor, 'member_account.charge', row!.id, { userId: expense.chargeUserId, amount: share, recurringExpenseId: expense.id, ledgerId });
  await tellMember(actor, expense.chargeUserId, 'charge', share, expense.currencyId, expense.title, '');
  return row!.id;
}

/** نوعِ ردیفِ پرداختِ پروژه‌ای که از بدهی کسر شده — نه پولِ نقد. */
const OFFSET_PAYMENT_TYPE = 'debt_offset';

export interface OffsetInput {
  userId: number;
  projectId: number;
  entryDate: string;
  /** مبلغی که از بدهی کم می‌شود، به ارزِ همان بدهی. */
  amount: string;
  currencyId: number;
  /** معادلش در ارزِ قراردادِ پروژه — اختیاری؛ خالی یعنی با نرخِ روز. */
  counted?: string | null;
  note: string;
}

/**
 * کسر از دستمزدِ یک پروژه — بدهی به همان اندازه کم می‌شود و طلبِ عضو از پروژه هم.
 * ⚠️ پولِ نقدی جابه‌جا نمی‌شود: ردیفِ پرداختِ پروژه **بی‌ردیفِ دفتر** است، پس
 * ماندهٔ هیچ حسابی و هیچ بستنِ دوره‌ای آن را نمی‌بیند (بستن از ledger می‌خواند).
 */
export async function recordOffset(actor: Actor, raw: OffsetInput): Promise<number> {
  assertCanManage(actor, 'finance');
  assertWritable(await currentLockDate(), raw.entryDate);
  const amount = parseAmount(raw.amount);
  await assertMember(raw.userId);
  assertWithinBalance(await balanceOf(raw.userId, raw.currencyId), amount);

  const [membership] = await db.select({ currencyId: projectMembers.currencyId, title: projects.title, projectCurrency: projects.currencyId })
    .from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.projectId, raw.projectId), eq(projectMembers.userId, raw.userId))).limit(1);
  if (!membership) throw new MemberAccountError('not_project_member');

  const contractCurrency = membership.currencyId ?? membership.projectCurrency ?? null;
  const counted = raw.counted?.trim() ? parseAmount(raw.counted) : null;
  const note = raw.note.trim();
  const eur = await eurOf(amount, raw.currencyId);

  const [payment] = await db.insert(projectPayments).values({
    projectId: raw.projectId,
    userId: raw.userId,
    ledgerId: null,
    accountId: null,
    direction: 'member_payout',
    type: OFFSET_PAYMENT_TYPE,
    amount,
    currencyId: raw.currencyId,
    amountSettled: counted && contractCurrency && contractCurrency !== raw.currencyId ? counted : null,
    settledCurrencyId: counted && contractCurrency && contractCurrency !== raw.currencyId ? contractCurrency : null,
    amountEur: counted && contractCurrency && contractCurrency !== raw.currencyId
      ? await eurOf(counted, contractCurrency) : eur,
    paidAt: raw.entryDate,
    note: paymentNote(['کسر از بدهی', note].filter(Boolean).join(' — '), membership.title),
  }).returning({ id: projectPayments.id });

  const [row] = await db.insert(memberAccountEntries).values({
    userId: raw.userId,
    kind: 'offset',
    amount,
    currencyId: raw.currencyId,
    amountEur: eur,
    entryDate: raw.entryDate,
    note,
    paymentId: payment!.id,
    projectId: raw.projectId,
    createdBy: actor.id,
  }).returning({ id: memberAccountEntries.id });

  await audit(actor, 'member_account.offset', row!.id, { userId: raw.userId, amount, projectId: raw.projectId, paymentId: payment!.id });
  await tellMember(actor, raw.userId, 'offset', amount, raw.currencyId, membership.title, note);
  return row!.id;
}

/** بخشیدنِ بخشی از بدهی — از بدهی کم و در جمعِ «هدیه و بخشیده» شمرده می‌شود. */
export async function recordForgive(
  actor: Actor,
  raw: { userId: number; entryDate: string; amount: string; currencyId: number; note: string },
): Promise<number> {
  assertCanManage(actor, 'finance');
  assertWritable(await currentLockDate(), raw.entryDate);
  const amount = parseAmount(raw.amount);
  await assertMember(raw.userId);
  assertWithinBalance(await balanceOf(raw.userId, raw.currencyId), amount);
  const note = raw.note.trim();
  const [row] = await db.insert(memberAccountEntries).values({
    userId: raw.userId,
    kind: 'forgive',
    amount,
    currencyId: raw.currencyId,
    amountEur: await eurOf(amount, raw.currencyId),
    entryDate: raw.entryDate,
    note,
    createdBy: actor.id,
  }).returning({ id: memberAccountEntries.id });
  await audit(actor, 'member_account.forgive', row!.id, { userId: raw.userId, amount });
  await tellMember(actor, raw.userId, 'forgive', amount, raw.currencyId, '', note);
  return row!.id;
}

/**
 * حذف.
 * ⚠️ قرض/هدیه/بازپرداخت با **ردیفِ دفترشان** حذف می‌شوند (همان قفلِ دوره و مجوزِ
 * حساب)؛ آن ردیف فقط به خاطرِ همین ثبت ساخته شده بود. ولی «هزینه» فقط بدهی را
 * برمی‌دارد: ردیفِ دفترش پرداختِ واقعی به فروشنده است و باید بماند.
 * ⚠️ حذفِ بدهی‌ای که با تسویه‌اش منفی شود ممنوع است.
 */
export async function deleteMemberEntry(actor: Actor, id: number): Promise<void> {
  assertCanManage(actor, 'finance');
  const [row] = await db.select().from(memberAccountEntries).where(eq(memberAccountEntries.id, id));
  if (!row) throw new MemberAccountError('not_found');
  // قسطی که از حقوق کم شد، با پرداختِ همان ماه می‌رود — جدا حذفش خالصِ حقوق را به هم می‌زد.
  if (row.salaryPaymentId) throw new MemberAccountError('linked_salary');

  if (row.kind === 'loan' || row.kind === 'charge') {
    const balance = await balanceOf(row.userId, row.currencyId);
    if (balance - Number(row.amount) < -0.005) throw new MemberAccountError('over_balance');
  }

  if (row.ledgerId && row.kind !== 'charge') {
    await deleteEntry(actor, row.ledgerId); // cascade همین ردیف را هم می‌برد.
  } else if (row.paymentId) {
    assertDeletable(await currentLockDate(), row.entryDate);
    await db.delete(projectPayments).where(eq(projectPayments.id, row.paymentId));
  } else {
    assertDeletable(await currentLockDate(), row.entryDate);
    await db.delete(memberAccountEntries).where(eq(memberAccountEntries.id, id));
  }
  await audit(actor, 'member_account.delete', id, { kind: row.kind, userId: row.userId, amount: row.amount });
}

/* ------------------------------------------------------------------ *
 * خواندن
 * ------------------------------------------------------------------ */

export interface AccountLine {
  id: number;
  userId: number;
  kind: MemberAccountKind;
  amount: string;
  currencyId: number;
  currencyCode: string;
  sharePct: string;
  entryDate: string;
  dueDate: string | null;
  note: string;
  ledgerId: number | null;
  projectTitle: string | null;
  recurringTitle: string | null;
}

export interface Balance { currencyId: number; currencyCode: string; amount: string }

const lineColumns = {
  id: memberAccountEntries.id,
  userId: memberAccountEntries.userId,
  kind: memberAccountEntries.kind,
  amount: memberAccountEntries.amount,
  currencyId: memberAccountEntries.currencyId,
  currencyCode: currencies.code,
  sharePct: memberAccountEntries.sharePct,
  entryDate: memberAccountEntries.entryDate,
  dueDate: memberAccountEntries.dueDate,
  note: memberAccountEntries.note,
  ledgerId: memberAccountEntries.ledgerId,
  projectTitle: projects.title,
  recurringTitle: recurringExpenses.title,
};

async function loadLines(userId?: number): Promise<AccountLine[]> {
  const rows = await db.select(lineColumns).from(memberAccountEntries)
    .leftJoin(currencies, eq(currencies.id, memberAccountEntries.currencyId))
    .leftJoin(projects, eq(projects.id, memberAccountEntries.projectId))
    .leftJoin(recurringExpenses, eq(recurringExpenses.id, memberAccountEntries.recurringExpenseId))
    .where(userId ? eq(memberAccountEntries.userId, userId) : undefined)
    .orderBy(desc(memberAccountEntries.entryDate), desc(memberAccountEntries.id));
  return rows.map((r) => ({ ...r, currencyCode: r.currencyCode ?? '' }));
}

function summarize(lines: AccountLine[]) {
  const codes = new Map(lines.map((l) => [l.currencyId, l.currencyCode]));
  const toList = (m: Map<number, number>, keepZero: boolean): Balance[] => [...m]
    .filter(([, v]) => keepZero || Math.abs(v) > 0.005)
    .map(([currencyId, v]) => ({ currencyId, currencyCode: codes.get(currencyId) ?? '', amount: v.toFixed(2) }));
  return {
    balances: toList(balancesByCurrency(lines), false),
    gifts: toList(giftsByCurrency(lines), false),
  };
}

/** تبِ «حسابِ اعضا» ِ مالی — همهٔ اعضا، ماندهٔ هر نفر و تاریخچهٔ کامل. */
export async function listMemberAccounts(actor: Actor) {
  assertCanView(actor, 'finance');
  const [lines, members, memberships] = await Promise.all([
    loadLines(),
    db.selectDistinct({ id: users.id, name: users.name }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt)))
      .orderBy(asc(users.name)),
    db.selectDistinct({ userId: projectMembers.userId, projectId: projects.id, title: projects.title })
      .from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .orderBy(desc(projects.id)),
  ]);

  const byUser = new Map<number, AccountLine[]>();
  for (const l of lines) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), l]);
  // عضوِ رفته‌ای که هنوز ردیف دارد هم باید بماند — بدهی‌اش با رفتن پاک نمی‌شود.
  const known = new Set(members.map((m) => m.id));
  const missing = [...byUser.keys()].filter((id) => !known.has(id));
  const former = missing.length === 0 ? [] : await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, missing));

  const today = new Date().toISOString().slice(0, 10);
  const people = [...members, ...former].map((m) => {
    const own = byUser.get(m.id) ?? [];
    const { balances, gifts } = summarize(own);
    return {
      userId: m.id,
      name: m.name,
      active: known.has(m.id),
      balances,
      gifts,
      lines: own,
      // قرضِ سررسیدگذشته وقتی هنوز بدهی هست — فقط یادآوری.
      overdue: balances.length > 0 && own.some((l) => l.kind === 'loan' && l.dueDate !== null && l.dueDate < today),
      projects: memberships.filter((p) => p.userId === m.id).map((p) => ({ id: p.projectId, title: p.title })),
    };
  });
  return people;
}

export type MemberAccountRow = Awaited<ReturnType<typeof listMemberAccounts>>[number];

/** «مالیِ من» — حسابِ خودِ عضو با شرکت (هدیه‌ها هم دیده می‌شوند). */
export async function myAccount(actor: Actor) {
  if (!actor.roles.includes('member')) return null;
  const lines = await loadLines(actor.id);
  if (lines.length === 0) return null;
  return { ...summarize(lines), lines };
}

export type MyAccount = NonNullable<Awaited<ReturnType<typeof myAccount>>>;
