import { notify } from '@/server/notifications/service';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  accounts, auditLog, currencies, ledger, paymentRequests, projects,
  recurringExpenses, unitEntries, userRoles, users, vendors,
} from '@/db/schema';
import { canManageSection, type Actor, isOwner, canViewSection } from '@/domain/access/permissions';
import { assertCanManage, assertCanView, assertOwner } from '@/domain/access/guard';
import { markPaid } from '@/domain/team-money/payments';
import { assertWritable } from '@/domain/ledger/fiscal';
import {
  computeNext, normalizeUnit, planPay, RecurringPayError,
  type ExpenseKind, type IntervalUnit,
} from '@/domain/finance/recurring';
import { accountScope, createEntry, currentLockDate } from './service';

/**
 * پرداخت‌ها و هزینه‌های دوره‌ای.
 *
 * ⚠️ هر دو مسیر در نهایت یک **ردیفِ دفتر** می‌نویسند، پس هر دو از همان
 * گاردهای حسابداری رد می‌شوند — به‌ویژه قفلِ دوره (R-FISCAL-01).
 */

export class PayoutError extends Error {
  constructor(readonly code: 'not_found' | 'rejected' | 'already_paid' | 'no_currency' | 'not_approved') {
    super(`payout refused: ${code}`);
    this.name = 'PayoutError';
  }
}

async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'payout',
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * درخواست‌های پرداخت
 * ------------------------------------------------------------------ */

/**
 * سطحِ دسترسیِ صفحهٔ پرداخت‌ها — پورتِ `Payouts_Page::access_level()`:
 * مالک همه‌چیز؛ حسابدار (مدیرِ مالی یا محدود) فقط **تأییدشده/پرداخت‌شده**.
 * در انتظار و ردشده تصمیمِ مالک است و به حسابدار نشان داده نمی‌شود.
 */
export function payoutLevel(actor: Actor): 'full' | 'accounting' | 'none' {
  if (isOwner(actor)) return 'full';
  if (canViewSection(actor, 'finance')) return 'accounting';
  return 'none';
}

const ACCOUNTING_STATUSES = ['approved', 'paid'] as const;

export async function listRequests(actor: Actor, status?: string) {
  assertCanView(actor, 'finance');
  const level = payoutLevel(actor);
  const lockDate = await currentLockDate();

  const conditions = [];
  if (status === 'archived') {
    // تصمیم‌گرفته‌شده‌های پیش از قفل — بیرون از تب‌های فعال (پورتِ `is_archived`).
    if (!lockDate) return [];
    conditions.push(inArray(paymentRequests.status, ['paid', 'rejected']));
    conditions.push(sql`${paymentRequests.decidedAt} is not null and ${paymentRequests.decidedAt}::date <= ${lockDate}`);
  } else {
    if (status && status !== 'all') conditions.push(eq(paymentRequests.status, status as 'pending'));
    if (lockDate) {
      conditions.push(sql`not (${paymentRequests.status} in ('paid', 'rejected')
        and ${paymentRequests.decidedAt} is not null and ${paymentRequests.decidedAt}::date <= ${lockDate})`);
    }
  }
  // حسابدار: «همه» یعنی فقط تأییدشده + پرداخت‌شده — هرگز در انتظار/ردشده.
  if (level !== 'full') conditions.push(inArray(paymentRequests.status, [...ACCOUNTING_STATUSES]));

  return db
    .select({
      id: paymentRequests.id,
      amount: paymentRequests.amount,
      currencyId: paymentRequests.currencyId,
      currencyCode: currencies.code,
      note: paymentRequests.note,
      status: paymentRequests.status,
      decisionNote: paymentRequests.decisionNote,
      ledgerId: paymentRequests.ledgerId,
      createdAt: paymentRequests.createdAt,
      userId: paymentRequests.userId,
      userName: users.name,
      projectId: paymentRequests.projectId,
      projectTitle: projects.title,
    })
    .from(paymentRequests)
    .leftJoin(users, eq(users.id, paymentRequests.userId))
    .leftJoin(projects, eq(projects.id, paymentRequests.projectId))
    .leftJoin(currencies, eq(currencies.id, paymentRequests.currencyId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    // در انتظارها اول (نیازمندِ اقدام)، بعد تازه‌ترین — پورتِ `all()`.
    .orderBy(sql`case when ${paymentRequests.status} = 'pending' then 0 else 1 end`, desc(paymentRequests.id));
}

/** تأیید یا ردِ درخواست. */
export async function decideRequest(
  actor: Actor,
  requestId: number,
  decision: 'approved' | 'rejected',
  note: string,
) {
  // ⚠️ تأیید/رد تصمیمِ **مالک** است (`manage_options`)؛ حسابدار فقط پرداخت می‌کند.
  assertOwner(actor);

  const rows = await db.select().from(paymentRequests).where(eq(paymentRequests.id, requestId));
  const request = rows[0];
  if (!request) throw new PayoutError('not_found');

  await db.update(paymentRequests).set({
    status: decision,
    decisionNote: note,
    decidedBy: actor.id,
    decidedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(paymentRequests.id, requestId));

  await audit(actor, `request.${decision}`, requestId, request.status, decision);

  /**
   * پورتِ `payment_decided` — به **خودِ** درخواست‌دهنده.
   *
   * ⚠️ توضیحِ تصمیم داخلِ متن می‌آید: «رد شد» بدونِ دلیل، کاربر را به یک
   * پیامِ دیگر وامی‌دارد.
   */
  if (request.userId !== actor.id) {
    await notify([request.userId], {
      type: 'payment.decided',
      title: decision === 'approved' ? 'درخواست پرداخت شما تأیید شد' : 'درخواست پرداخت شما رد شد',
      body: note.trim() === '' ? '' : 'توضیح: {note}',
      params: { note: note.trim() },
      url: '/finance',
    });
  }
}

/**
 * ثبتِ پرداختِ یک درخواست در حسابداری.
 *
 * ⚠️ R-TEAM-10 — وضعیتِ `paid` **همیشه** باید ردیفِ بانکی داشته باشد؛ در
 * دیتابیس هم check constraint دارد. پس ترتیب مهم است: اول ردیفِ دفتر نوشته
 * می‌شود، بعد وضعیت به `paid` می‌رود — نه برعکس.
 */
export async function payRequest(
  actor: Actor,
  requestId: number,
  input: { accountId: number; entryDate: string },
) {
  assertCanManage(actor, 'finance');

  const rows = await db.select().from(paymentRequests).where(eq(paymentRequests.id, requestId));
  const request = rows[0];
  if (!request) throw new PayoutError('not_found');

  /**
   * ⚠️ ترتیب مهم است: این گاردها **پیش از** نوشتنِ ردیفِ دفتر می‌آیند.
   * اگر بعد می‌آمدند، یک درخواستِ ردشده اول یک ردیفِ خرجِ واقعی می‌ساخت و بعد
   * رد می‌شد — یعنی پول از حساب می‌رفت بی‌آنکه درخواستی پرداخت شده باشد.
   */
  if (request.status === 'rejected') throw new PayoutError('rejected');   // R-TEAM-07
  if (request.status === 'paid') throw new PayoutError('already_paid');   // ضدِ پرداختِ دوباره
  // حسابدار فقط درخواستِ **تأییدشده** را می‌پردازد؛ مالک می‌تواند در انتظار را هم یک‌جا بپردازد.
  if (request.status === 'pending' && !isOwner(actor)) throw new PayoutError('not_approved');
  if (request.currencyId === null) throw new PayoutError('no_currency');

  const project = (await db.select({ title: projects.title })
    .from(projects).where(eq(projects.id, request.projectId)))[0];
  const member = (await db.select({ name: users.name })
    .from(users).where(eq(users.id, request.userId)))[0];

  // ردیفِ دفتر — همان گاردهای حسابداری (قفلِ دوره، اعتبارسنجی) اعمال می‌شوند.
  const ledgerId = await createEntry(actor, {
    accountId: input.accountId,
    entryDate: input.entryDate,
    direction: 'out',
    amount: request.amount,
    currencyId: request.currencyId,
    description: `پرداخت به ${member?.name ?? 'عضو'} — ${project?.title ?? 'پروژه'}`,
    projectId: request.projectId,
    tagIds: [],
    officeId: null,
    payerUserId: null,
    payerLabel: '',
    receiverUserId: request.userId,
    receiverLabel: member?.name ?? '',
  });

  // دامنه تصمیم می‌گیرد که چه چیزی بسته شود (درخواست و شاید ردیفِ کارِ تعدادی).
  const result = markPaid(
    { id: request.id, amount: request.amount, status: request.status, unitEntryId: request.unitEntryId },
    ledgerId,
  );

  await db.update(paymentRequests).set({
    status: 'paid',
    ledgerId,
    // مهرِ تصمیم — بایگانیِ پس از قفل روی همین تاریخ حساب می‌شود.
    decidedBy: request.decidedBy ?? actor.id,
    decidedAt: request.decidedAt ?? new Date(),
    updatedAt: new Date(),
  }).where(eq(paymentRequests.id, requestId));

  /**
   * ⚠️ ردیفِ کارِ تعدادی که این درخواست می‌بندد، باید **واقعاً** بسته شود —
   * پورتِ `Unit_Entries::mark_paid()`. `markPaid` شناسه‌اش را برمی‌گرداند ولی
   * تا پیش از این هیچ‌کس آن را نمی‌نوشت: ردیف تا ابد «درخواست‌شده» می‌ماند،
   * گزارش‌ها پرداخت‌نشده حسابش می‌کردند، عضو «قابلِ درخواست» می‌ماند و
   * گاردِ پرداختِ دوباره (R-TEAM-08) عملاً از کار افتاده بود.
   */
  if (result?.closesUnitEntryId) {
    await db.update(unitEntries).set({
      status: 'paid',
      ledgerId,
      updatedAt: new Date(),
    }).where(eq(unitEntries.id, result.closesUnitEntryId));
  }

  await audit(actor, 'request.paid', requestId, request.status, { ledgerId, result });

  // پورتِ شاخهٔ `paid` ِ `payment_decided` — عضو باید بداند پولش رفته.
  if (request.userId !== actor.id) {
    await notify([request.userId], {
      type: 'payment.decided',
      title: 'پرداختِ شما ثبت شد',
      body: '{amount} — «{project}»',
      params: { amount: request.amount, project: project?.title ?? '' },
      url: '/finance',
    });
  }

  return { ledgerId, closedUnitEntryId: result?.closesUnitEntryId ?? null };
}

/* ------------------------------------------------------------------ *
 * هزینه‌های دوره‌ای
 * ------------------------------------------------------------------ */

export async function listRecurring(actor: Actor) {
  assertCanView(actor, 'finance');
  return db
    .select({
      id: recurringExpenses.id,
      title: recurringExpenses.title,
      amount: recurringExpenses.amount,
      currencyId: recurringExpenses.currencyId,
      currencyCode: currencies.code,
      kind: recurringExpenses.kind,
      intervalUnit: recurringExpenses.intervalUnit,
      intervalCount: recurringExpenses.intervalCount,
      nextDueDate: recurringExpenses.nextDueDate,
      accountId: recurringExpenses.accountId,
      accountName: accounts.name,
      vendorId: recurringExpenses.vendorId,
      vendorName: vendors.name,
      isActive: recurringExpenses.isActive,
      categoryTagId: recurringExpenses.categoryTagId,
      note: recurringExpenses.note,
    })
    .from(recurringExpenses)
    .leftJoin(currencies, eq(currencies.id, recurringExpenses.currencyId))
    .leftJoin(accounts, eq(accounts.id, recurringExpenses.accountId))
    .leftJoin(vendors, eq(vendors.id, recurringExpenses.vendorId))
    .orderBy(recurringExpenses.nextDueDate);
}

export interface RecurringInput {
  id: number | null;
  title: string;
  amount: string;
  currencyId: number;
  kind: ExpenseKind;
  intervalUnit: string;
  intervalCount: number;
  startDate: string;
  nextDueDate: string;
  accountId: number | null;
  vendorId: number | null;
  /** دستهٔ هزینه، یادداشت و فعال/غیرفعال — پیش از این ذخیره نمی‌شدند. */
  categoryTagId?: number | null;
  note?: string;
  isActive?: boolean;
}

export async function saveRecurring(actor: Actor, input: RecurringInput) {
  assertCanManage(actor, 'finance');

  const values = {
    categoryTagId: input.categoryTagId ?? null,
    note: (input.note ?? '').trim(),
    isActive: input.isActive ?? true,
    title: input.title.trim(),
    amount: input.amount,
    currencyId: input.currencyId,
    kind: input.kind,
    intervalUnit: normalizeUnit(input.intervalUnit) as IntervalUnit,
    intervalCount: Math.max(1, input.intervalCount),
    startDate: input.startDate,
    nextDueDate: input.nextDueDate || input.startDate,
    accountId: input.accountId,
    vendorId: input.vendorId,
  };

  if (input.id) {
    await db.update(recurringExpenses)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, input.id));
    await audit(actor, 'recurring.update', input.id, null, values);
    return input.id;
  }

  const rows = await db.insert(recurringExpenses).values(values)
    .returning({ id: recurringExpenses.id });
  await audit(actor, 'recurring.create', rows[0]!.id, null, values);
  return rows[0]!.id;
}

export async function deleteRecurring(actor: Actor, id: number) {
  assertCanManage(actor, 'finance');
  await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id));
  await audit(actor, 'recurring.delete', id);
}

/**
 * پرداختِ یک نوبت از هزینهٔ دوره‌ای.
 *
 * ⚠️ ترتیبِ گاردها عمدی است:
 *  ۱. **قفلِ دوره** — پیش از هر چیز، و اگر بسته باشد سررسید هم **جلو نمی‌رود**
 *     تا نوبت بی‌صدا گم نشود.
 *  ۲. **بی‌اثریِ کلیکِ دوباره** — با تاریخِ سررسیدی که کاربر دیده.
 */
export async function payRecurring(actor: Actor, id: number, expectedDue: string | null) {
  assertCanManage(actor, 'finance');

  const rows = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id));
  const expense = rows[0];
  if (!expense) throw new RecurringPayError('not_found');

  // گاردِ ۱ — قفلِ دوره. اگر بسته باشد اینجا می‌ایستد و چیزی تغییر نمی‌کند.
  assertWritable(await currentLockDate(), expense.nextDueDate);

  // گاردِ ۲ — تکرار.
  const plan = planPay(
    {
      kind: expense.kind as ExpenseKind,
      nextDueDate: expense.nextDueDate,
      intervalUnit: normalizeUnit(expense.intervalUnit),
      intervalCount: expense.intervalCount,
      accountId: expense.accountId,
    },
    expectedDue,
  );

  let ledgerId: number | null = null;
  // بدونِ ارز نمی‌شود ردیفِ دفتر نوشت؛ سررسید هم جلو نمی‌رود تا نوبت گم نشود.
  if (plan.bookLedger && expense.currencyId === null) throw new PayoutError('no_currency');

  if (plan.bookLedger) {
    const vendorName = expense.vendorId
      ? (await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, expense.vendorId)))[0]?.name
      : null;

    ledgerId = await createEntry(actor, {
      accountId: expense.accountId!,
      entryDate: expense.nextDueDate,
      direction: 'out',
      amount: expense.amount,
      currencyId: expense.currencyId!,
      description: expense.title,
      projectId: null,
      tagIds: [],
      officeId: null,
      payerUserId: null,
      payerLabel: '',
      receiverUserId: null,
      receiverLabel: vendorName ?? '',
    });
  }

  if (plan.after.type === 'deactivate') {
    await db.update(recurringExpenses)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, id));
  } else {
    await db.update(recurringExpenses)
      .set({ nextDueDate: plan.after.nextDueDate, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, id));
  }

  await audit(actor, 'recurring.pay', id, expense.nextDueDate, { ledgerId, after: plan.after });
  return { ledgerId, after: plan.after };
}

export { computeNext, inArray, isNull, ledger, canManageSection };

/**
 * دفترچهٔ بانکیِ اعضا.
 *
 * ⚠️ عضوِ سابقی که **تسویه شده** دیده نمی‌شود. دفترچه برای **پرداختن** است؛
 * وقتی چیزی به کسی بدهکار نیستیم، شمارهٔ حسابش دلیلی ندارد جلوی چشم باشد.
 * دادهٔ خودش پاک نمی‌شود — فقط از این فهرست کنار می‌رود.
 *
 * ⚠️ شمارهٔ تماس فقط برای دسترسیِ کامل: تلفن PII است و برای پرداخت لازم
 * نیست، پس حسابدارِ دامنه‌دار آن را نمی‌بیند. نسخهٔ قبلی هم همین تفکیک را دارد.
 */
export async function bankDirectory(actor: Actor) {
  assertCanView(actor, 'finance');

  // ⚠️ تلفن PII است و برای پرداخت لازم نیست — فقط مالک (پورتِ `ACCESS_FULL`).
  await accountScope(actor);
  const showPhone = isOwner(actor);

  const [members, debtors, openRequests, unpaidUnits] = await Promise.all([
    db.selectDistinct({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      bankAccount: users.bankAccount,
      bankIban: users.bankIban,
      bankCard: users.bankCard,
      memberState: users.memberState,
      deletedAt: users.deletedAt,
    })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt)))
      .orderBy(users.name),

    // قراردادی که هنوز مانده دارد.
    db.execute(sql`
      select pm.user_id as id
      from project_members pm
      group by pm.user_id
      having sum(pm.agreed_amount::numeric) > 0
    `),

    db.select({ id: paymentRequests.userId })
      .from(paymentRequests)
      .where(inArray(paymentRequests.status, ['pending', 'approved'])),

    db.select({ id: unitEntries.userId })
      .from(unitEntries)
      .where(inArray(unitEntries.status, ['unpaid', 'requested'])),
  ]);

  const payable = new Set<number>([
    ...(debtors as unknown as Array<{ id: number }>).map((r) => Number(r.id)),
    ...openRequests.map((r) => r.id),
    ...unpaidUnits.map((r) => r.id),
  ]);

  return {
    showPhone,
    rows: members
      // عضوِ فعال همیشه می‌ماند؛ سابق فقط اگر هنوز طلبی هست.
      .filter((m) => m.memberState === 'active' || payable.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        isFormer: m.memberState !== 'active',
        phone: showPhone ? (m.phone || '') : '',
        account: m.bankAccount || '',
        iban: m.bankIban || '',
        card: m.bankCard || '',
      })),
  };
}
