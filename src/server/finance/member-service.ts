import { rateSource } from '@/server/finance/service';
import { isFrozenProject } from '@/domain/projects/lifecycle';
import { notify } from '@/server/notifications/service';
import { managerIds } from '@/server/notifications/audience';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  auditLog, currencies, paymentRequests, projectMembers, projectPayments, projects, tags, unitEntries, users, ledger,
} from '@/db/schema';
import { canManageSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  availableToRequest, canCancelRequest, canDeleteUnit, isValidQuantity,
  OPEN_STATUSES, unitAmount, validateRequest, type RequestRejection,
} from '@/domain/finance/member-money';
import { contractBalance, paymentStatus } from '@/domain/team-money/payments';
import { myPayoutsOn } from '@/server/projects/repository';
import { canManageProject } from '@/server/projects/authority';

/**
 * پولِ عضو از نگاهِ خودش — کارکردِ تعدادی و درخواستِ پرداخت.
 * ⚠️ همهٔ گاردها اینجا هستند (R-ARCH-01).
 */

export class MemberMoneyError extends Error {
  constructor(public readonly reason: RequestRejection | 'quantity_invalid' | 'not_yours' | 'frozen' | 'not_member' | 'not_unit_based') {
    super(reason);
    this.name = 'MemberMoneyError';
  }
}

async function audit(actor: Actor, action: string, objectId: number, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'unit_entry',
    objectId,
    after: after ?? null,
  });
}

/** آیا کاربر می‌تواند این پروژه را مدیریت کند؟ */
async function projectContext(
  actor: Actor,
  projectId: number,
  /**
   * ثبت/حذفِ کارکرد برای دیگران — مدیرِ **همین پروژه** (مدیرِ پروژهٔ تگ‌دار یا
   * مدیرِ دفتر) هم، مثلِ `handle_add_unit` که `can_manage_project` می‌خواست.
   * ⚠️ فقط این دو مسیر؛ دیدنِ مبالغِ دیگران همچنان مجوزِ سراسری می‌خواهد.
   */
  options: { projectManager?: boolean } = {},
) {
  const rows = await db
    .select({
      id: projects.id,
      scope: projects.scope,
      isArchived: projects.isArchived,
      currencyId: projects.currencyId,
      isUnitBased: projects.isUnitBased,
      // ⚠️ گروهِ وضعیت لازم است، نه فقط بایگانی: پروژهٔ لغوشده هم منجمد است.
      statusGroup: tags.statusGroup,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(eq(projects.id, projectId));

  const project = rows[0];
  if (!project) throw new ForbiddenError('project.not_found');
  if (!visibleScopes(actor).includes(project.scope)) throw new ForbiddenError('project.forbidden');

  const canManage = canManageSection(actor, 'projects')
    || (options.projectManager === true && await canManageProject(actor, projectId));
  if (!canManage) {
    const member = await db.select({ id: projectMembers.id }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id)));
    if (member.length === 0) throw new ForbiddenError('project.forbidden');
  }

  return { project, canManage, isFrozen: isFrozenProject(project) };
}

/* ------------------------------------------------------------------ *
 * کارکردِ تعدادی
 * ------------------------------------------------------------------ */

/**
 * فهرستِ کارکرد.
 * ⚠️ مدیر همهٔ اعضا را می‌بیند، عضو **فقط ردیف‌های خودش** را — عددِ کارکردِ
 * دیگران عملاً حقوقشان است.
 */
export async function listUnitEntries(actor: Actor, projectId: number) {
  const { canManage } = await projectContext(actor, projectId);

  const rows = await db
    .select({
      id: unitEntries.id,
      userId: unitEntries.userId,
      userName: users.name,
      entryDate: unitEntries.entryDate,
      quantity: unitEntries.quantity,
      amount: unitEntries.amount,
      note: unitEntries.note,
      status: unitEntries.status,
      currencyCode: currencies.code,
    })
    .from(unitEntries)
    .leftJoin(users, eq(users.id, unitEntries.userId))
    .leftJoin(currencies, eq(currencies.id, unitEntries.currencyId))
    .where(canManage
      ? eq(unitEntries.projectId, projectId)
      : and(eq(unitEntries.projectId, projectId), eq(unitEntries.userId, actor.id)))
    .orderBy(desc(unitEntries.entryDate), desc(unitEntries.id));

  // درخواست‌های بازِ همین ردیف‌ها — یک کوئری، نه یکی برای هر ردیف.
  const ids = rows.map((r) => r.id);
  const open = ids.length === 0 ? [] : await db
    .select({ unitEntryId: paymentRequests.unitEntryId, id: paymentRequests.id, status: paymentRequests.status })
    .from(paymentRequests)
    .where(and(
      inArray(paymentRequests.unitEntryId, ids),
      inArray(paymentRequests.status, [...OPEN_STATUSES]),
    ));

  const openByEntry = new Map(open.map((o) => [o.unitEntryId!, o]));

  return rows.map((r) => ({
    ...r,
    openRequest: openByEntry.get(r.id) ?? null,
    isMine: r.userId === actor.id,
  }));
}

/** جمعِ پرداخت‌نشدهٔ خودِ کاربر در یک پروژه. */
export async function myUnpaidUnits(actor: Actor, projectId: number): Promise<string> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${unitEntries.amount}), 0)::text` })
    .from(unitEntries)
    .where(and(
      eq(unitEntries.projectId, projectId),
      eq(unitEntries.userId, actor.id),
      eq(unitEntries.status, 'unpaid'),
    ));
  return rows[0]?.total ?? '0';
}

/**
 * ثبتِ ردیفِ کارکرد.
 * ⚠️ مبلغ از نرخِ **عضویتِ همان عضو در همان پروژه** حساب می‌شود و منجمد
 * می‌ماند (R-TEAM-13) — تغییرِ بعدیِ نرخ نباید کارکردِ گذشته را عوض کند.
 */
export async function addUnitEntry(
  actor: Actor,
  input: { projectId: number; userId: number; entryDate: string; quantity: number; note: string },
) {
  const { canManage, isFrozen, project } = await projectContext(actor, input.projectId, { projectManager: true });
  if (isFrozen) throw new MemberMoneyError('frozen');
  // پورتِ `handle_add_unit`: فقط پروژهٔ **تعدادی** ردیفِ کارکرد می‌پذیرد.
  if (!project.isUnitBased) throw new MemberMoneyError('not_unit_based');
  if (!isValidQuantity(input.quantity)) throw new MemberMoneyError('quantity_invalid');
  // پورتِ `clean_date`: تاریخِ نامعتبر/خالی → امروز، نه خطای دیتابیس.
  const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(input.entryDate) && Number.isFinite(Date.parse(`${input.entryDate}T00:00:00Z`))
    ? input.entryDate
    : new Date().toISOString().slice(0, 10);

  // عضو فقط برای خودش ثبت می‌کند؛ مدیر برای هر عضوی.
  const targetId = canManage ? input.userId : actor.id;

  const membership = await db
    .select({ unitRate: projectMembers.unitRate, currencyId: projectMembers.currencyId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, targetId)))
    .orderBy(projectMembers.id)
    .limit(1);

  /**
   * ⚠️ فقط برای **عضوِ پروژه** — پورتِ `handle_add_unit` (`class-frontend.php:1174-1185`).
   * پیش از این شناسهٔ مدیر بدونِ بررسیِ عضویت پذیرفته می‌شد: ردیفی برای
   * غیرعضو با مبلغِ صفر ثبت می‌شد (نرخی نداشت) و بی‌صدا در گزارش‌ها می‌نشست.
   */
  if (membership.length === 0) throw new MemberMoneyError('not_member');
  const rate = membership[0]?.unitRate ?? null;
  // ارزِ کارکرد: قرارداد → پروژه → ارزِ پیش‌فرض (ستون از مهاجرتِ ۰۰۲۴ اجباری است).
  const currencyId = membership[0]?.currencyId ?? project.currencyId ?? (await rateSource()).baseCurrencyId;

  const rows = await db.insert(unitEntries).values({
    projectId: input.projectId,
    userId: targetId,
    entryDate,
    quantity: String(input.quantity),
    amount: unitAmount(input.quantity, rate),
    currencyId,
    note: input.note.trim().slice(0, 500),
  }).returning({ id: unitEntries.id });

  await audit(actor, 'unit.add', rows[0]!.id, { ...input, userId: targetId });
  return rows[0]!.id;
}

export async function deleteUnitEntry(actor: Actor, entryId: number) {
  const rows = await db.select().from(unitEntries).where(eq(unitEntries.id, entryId));
  const row = rows[0];
  if (!row) return;

  const { canManage, isFrozen } = await projectContext(actor, row.projectId, { projectManager: true });
  if (!canManage && row.userId !== actor.id) throw new MemberMoneyError('not_yours');
  if (!canDeleteUnit(row.status, isFrozen)) throw new MemberMoneyError('frozen');

  await db.delete(unitEntries).where(eq(unitEntries.id, entryId));
  await audit(actor, 'unit.delete', entryId, row);
}

/* ------------------------------------------------------------------ *
 * درخواستِ پرداخت
 * ------------------------------------------------------------------ */

/** جمعِ درخواست‌های بازِ کاربر روی یک پروژه. */
async function outstandingTotal(userId: number, projectId: number): Promise<string> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${paymentRequests.amount}), 0)::text` })
    .from(paymentRequests)
    .where(and(
      eq(paymentRequests.userId, userId),
      eq(paymentRequests.projectId, projectId),
      inArray(paymentRequests.status, [...OPEN_STATUSES]),
    ));
  return rows[0]?.total ?? '0';
}

/**
 * ماندهٔ قراردادیِ کاربر روی یک پروژه: توافقی منهای پرداخت‌شده.
 *
 * ⚠️ **سمتِ سرور** حساب می‌شود و هرگز از فرم گرفته نمی‌شود — وگرنه کاربر با
 * دستکاریِ یک فیلدِ مخفی سقفِ درخواستش را بالا می‌برد.
 */
export async function contractRemaining(userId: number, projectId: number): Promise<string> {
  return (await contractSummary(userId, projectId)).remaining;
}

/**
 * توافقی / پرداخت‌شده / مانده — پورتِ `Payments::member_summary`، در **ارزِ
 * قرارداد**؛ قاعده در `contractBalance` (R-TEAM-05).
 */
export async function contractSummary(userId: number, projectId: number): Promise<{
  agreed: string; paid: string; remaining: string; currencyId: number | null;
}> {
  const [memberRows, payoutRows, projectRows, fx] = await Promise.all([
    db.select({ agreed: projectMembers.agreedAmount, currencyId: projectMembers.currencyId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .orderBy(asc(projectMembers.id)),

    db.select({
      amount: projectPayments.amount,
      currencyId: projectPayments.currencyId,
      amountSettled: projectPayments.amountSettled,
      settledCurrencyId: projectPayments.settledCurrencyId,
    })
      .from(projectPayments)
      .where(and(
        eq(projectPayments.projectId, projectId),
        eq(projectPayments.userId, userId),
        eq(projectPayments.direction, 'member_payout'),
      )),

    db.select({ currencyId: projects.currencyId }).from(projects).where(eq(projects.id, projectId)),
    rateSource(),
  ]);

  const balance = contractBalance({
    memberRows,
    payouts: payoutRows,
    projectCurrencyId: projectRows[0]?.currencyId ?? null,
    source: fx.source,
  });
  return {
    agreed: balance.agreed.toFixed(4),
    paid: balance.paid.toFixed(4),
    remaining: balance.remaining.toFixed(4),
    currencyId: balance.currencyId,
  };
}

/** درخواست‌های خودِ کاربر روی یک پروژه + مبلغِ قابلِ درخواست. */
export async function myRequests(actor: Actor, projectId: number) {
  // ⚠️ رسیدِ ردیفِ paid از دفترِ آینه می‌آید (fin_receipt_link ِ نسخهٔ قبلی).
  const summary = await contractSummary(actor.id, projectId);
  const remaining = summary.remaining;
  const [contractCurrency] = summary.currencyId
    ? await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.id, summary.currencyId))
    : [];
  const rows = await db
    .select({
      id: paymentRequests.id,
      amount: paymentRequests.amount,
      status: paymentRequests.status,
      note: paymentRequests.note,
      decisionNote: paymentRequests.decisionNote,
      createdAt: paymentRequests.createdAt,
      currencyCode: currencies.code,
      receiptIds: ledger.receiptIds,
    })
    .from(paymentRequests)
    .leftJoin(currencies, eq(currencies.id, paymentRequests.currencyId))
    .leftJoin(ledger, eq(ledger.id, paymentRequests.ledgerId))
    .where(and(eq(paymentRequests.userId, actor.id), eq(paymentRequests.projectId, projectId)))
    .orderBy(desc(paymentRequests.id));

  const [outstanding, payouts] = await Promise.all([
    outstandingTotal(actor.id, projectId),
    // پورتِ فهرستِ «پرداختی‌های شما» — ردیف‌های واقعیِ حسابداری، نه فقط درخواست‌ها.
    myPayoutsOn(actor.id, projectId),
  ]);
  return {
    requests: rows.map((r) => ({ ...r, cancellable: canCancelRequest(r.status) })),
    remaining,
    agreed: summary.agreed,
    paid: summary.paid,
    /** ارزِ قرارداد — ارقامِ بالا در این ارزند. */
    currencyCode: contractCurrency?.code ?? null,
    status: paymentStatus(summary.paid, summary.agreed),
    payouts: payouts.map((p) => ({ ...p, paidAt: p.paidAt ?? null })),
    available: availableToRequest(remaining, outstanding),
    outstanding,
  };
}

/**
 * ثبتِ درخواستِ پرداخت.
 * ⚠️ مبلغ نمی‌تواند از «مانده منهای درخواست‌های باز» بیشتر باشد — وگرنه یک
 * بدهی دو بار درخواست و در نهایت دو بار پرداخت می‌شود.
 */
export async function createRequest(
  actor: Actor,
  input: { projectId: number; amount: string; note: string; unitEntryId?: number },
) {
  const { project } = await projectContext(actor, input.projectId);

  // ⚠️ هر دو عدد سمتِ سرور خوانده می‌شوند؛ فرم فقط مبلغِ درخواستی را می‌دهد.
  const [summary, outstanding] = await Promise.all([
    contractSummary(actor.id, input.projectId),
    outstandingTotal(actor.id, input.projectId),
  ]);
  const available = availableToRequest(summary.remaining, outstanding);

  let hasOpenForUnit = false;
  if (input.unitEntryId) {
    const open = await db.select({ id: paymentRequests.id }).from(paymentRequests)
      .where(and(
        eq(paymentRequests.unitEntryId, input.unitEntryId),
        inArray(paymentRequests.status, [...OPEN_STATUSES]),
      ));
    hasOpenForUnit = open.length > 0;
  }

  const rejection = validateRequest({ amount: input.amount, available, hasOpenForUnit });
  if (rejection) throw new MemberMoneyError(rejection);

  const rows = await db.insert(paymentRequests).values({
    projectId: input.projectId,
    userId: actor.id,
    amount: input.amount,
    // ⚠️ ارزِ قرارداد، نه ارزِ پروژه — مانده و سقف هم در همین ارزند.
    currencyId: summary.currencyId ?? project.currencyId ?? (await rateSource()).baseCurrencyId,
    note: input.note.trim().slice(0, 500),
    unitEntryId: input.unitEntryId ?? null,
  }).returning({ id: paymentRequests.id });

  // ردیفِ کارکرد به «درخواست‌شده» می‌رود تا دوباره درخواست نشود.
  if (input.unitEntryId) {
    await db.update(unitEntries).set({ status: 'requested', updatedAt: new Date() })
      .where(eq(unitEntries.id, input.unitEntryId));
  }

  await audit(actor, 'request.create', rows[0]!.id, input);
  await notifyPaymentRequested(actor.id, {
    projectId: input.projectId, amount: input.amount, requestId: rows[0]!.id,
  });
  return rows[0]!.id;
}

/**
 * اعلانِ درخواستِ پرداختِ تازه به مدیران — پورتِ `payment_requested`.
 *
 * ⚠️ گیرنده مدیران‌اند، نه حسابدارِ خاص: نسخهٔ قبلی هم `manager_ids()` را
 * می‌گیرد. درخواستی که کسی نبیند، درخواست نیست.
 */
async function notifyPaymentRequested(
  actorId: number,
  input: { projectId: number; amount: string; requestId: number },
) {
  const [managers, project, member] = await Promise.all([
    managerIds(),
    db.select({ title: projects.title }).from(projects).where(eq(projects.id, input.projectId)),
    db.select({ name: users.name }).from(users).where(eq(users.id, actorId)),
  ]);

  await notify(managers.filter((id) => id !== actorId), {
    type: 'payment.requested',
    title: 'درخواست پرداخت جدید',
    body: `${member[0]?.name ?? ''} — ${input.amount} — «${project[0]?.title ?? ''}»`,
    url: '/finance?tab=members',
  });
}

/** درخواستِ کارکرد — مبلغش خودِ ردیف است، پس سقف را دور نمی‌زند. */
export async function requestForUnit(actor: Actor, entryId: number) {
  const rows = await db.select().from(unitEntries).where(eq(unitEntries.id, entryId));
  const row = rows[0];
  if (!row) throw new MemberMoneyError('not_yours');
  if (row.userId !== actor.id) throw new MemberMoneyError('not_yours');

  const { isFrozen, project } = await projectContext(actor, row.projectId);
  if (isFrozen) throw new MemberMoneyError('frozen');

  /**
   * ⚠️ کارکردِ بی‌مبلغ (عضوی که نرخِ واحد ندارد) درخواستِ صفر می‌ساخت که
   * فقط صفِ حسابدار را پر می‌کرد. همان گاردِ مسیرِ عمومی (`validateRequest`).
   */
  if (!(Number(row.amount) > 0)) throw new MemberMoneyError('amount_invalid');

  const open = await db.select({ id: paymentRequests.id }).from(paymentRequests)
    .where(and(
      eq(paymentRequests.unitEntryId, entryId),
      inArray(paymentRequests.status, [...OPEN_STATUSES]),
    ));
  if (open.length > 0) throw new MemberMoneyError('already_open');

  const inserted = await db.insert(paymentRequests).values({
    projectId: row.projectId,
    userId: actor.id,
    amount: row.amount,
    currencyId: row.currencyId ?? project.currencyId,
    note: `کارکردِ ${row.entryDate}`,
    unitEntryId: entryId,
  }).returning({ id: paymentRequests.id });

  await db.update(unitEntries).set({ status: 'requested', updatedAt: new Date() })
    .where(eq(unitEntries.id, entryId));

  await audit(actor, 'request.create', inserted[0]!.id, { entryId });
  await notifyPaymentRequested(actor.id, {
    projectId: row.projectId, amount: row.amount, requestId: inserted[0]!.id,
  });
  return inserted[0]!.id;
}

/**
 * لغوِ درخواست.
 * ⚠️ فقط صاحبش و فقط وقتی هنوز «در انتظار بررسی» است — تأییدشده تصمیمِ
 * حسابدار است و پس‌گرفتنش یعنی دور زدنِ او.
 */
export async function cancelRequest(actor: Actor, requestId: number) {
  const rows = await db.select().from(paymentRequests).where(eq(paymentRequests.id, requestId));
  const row = rows[0];
  if (!row) return;
  if (row.userId !== actor.id) throw new MemberMoneyError('not_yours');
  if (!canCancelRequest(row.status)) throw new MemberMoneyError('already_open');

  await db.delete(paymentRequests).where(eq(paymentRequests.id, requestId));

  // ردیفِ کارکرد به حالتِ پرداخت‌نشده برمی‌گردد تا دوباره قابلِ درخواست شود.
  if (row.unitEntryId) {
    await db.update(unitEntries).set({ status: 'unpaid', updatedAt: new Date() })
      .where(eq(unitEntries.id, row.unitEntryId));
  }

  await audit(actor, 'request.cancel', requestId, row);
}
