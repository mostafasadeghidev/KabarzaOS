import { isFrozenProject } from '@/domain/projects/lifecycle';
import { notify } from '@/server/notifications/service';
import { managerIds } from '@/server/notifications/audience';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
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

/**
 * پولِ عضو از نگاهِ خودش — کارکردِ تعدادی و درخواستِ پرداخت.
 * ⚠️ همهٔ گاردها اینجا هستند (R-ARCH-01).
 */

export class MemberMoneyError extends Error {
  constructor(public readonly reason: RequestRejection | 'quantity_invalid' | 'not_yours' | 'frozen' | 'not_member') {
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
async function projectContext(actor: Actor, projectId: number) {
  const rows = await db
    .select({
      id: projects.id,
      scope: projects.scope,
      isArchived: projects.isArchived,
      currencyId: projects.currencyId,
      // ⚠️ گروهِ وضعیت لازم است، نه فقط بایگانی: پروژهٔ لغوشده هم منجمد است.
      statusGroup: tags.statusGroup,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(eq(projects.id, projectId));

  const project = rows[0];
  if (!project) throw new ForbiddenError('project.not_found');
  if (!visibleScopes(actor).includes(project.scope)) throw new ForbiddenError('project.forbidden');

  const canManage = canManageSection(actor, 'projects');
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
  const { canManage, isFrozen, project } = await projectContext(actor, input.projectId);
  if (isFrozen) throw new MemberMoneyError('frozen');
  if (!isValidQuantity(input.quantity)) throw new MemberMoneyError('quantity_invalid');

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
  const currencyId = membership[0]?.currencyId ?? project.currencyId;

  const rows = await db.insert(unitEntries).values({
    projectId: input.projectId,
    userId: targetId,
    entryDate: input.entryDate,
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

  const { canManage, isFrozen } = await projectContext(actor, row.projectId);
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
  const [agreedRows, paidRows] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${projectMembers.agreedAmount}), 0)::text` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))),

    db.select({ total: sql<string>`coalesce(sum(${projectPayments.amount}), 0)::text` })
      .from(projectPayments)
      .where(and(
        eq(projectPayments.projectId, projectId),
        eq(projectPayments.userId, userId),
        eq(projectPayments.direction, 'member_payout'),
      )),
  ]);

  const value = Number(agreedRows[0]?.total ?? 0) - Number(paidRows[0]?.total ?? 0);
  return (value > 0 ? value : 0).toFixed(4);
}

/** درخواست‌های خودِ کاربر روی یک پروژه + مبلغِ قابلِ درخواست. */
export async function myRequests(actor: Actor, projectId: number) {
  // ⚠️ رسیدِ ردیفِ paid از دفترِ آینه می‌آید (fin_receipt_link ِ نسخهٔ قبلی).
  const remaining = await contractRemaining(actor.id, projectId);
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

  const outstanding = await outstandingTotal(actor.id, projectId);
  return {
    requests: rows.map((r) => ({ ...r, cancellable: canCancelRequest(r.status) })),
    remaining,
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
  const [remaining, outstanding] = await Promise.all([
    contractRemaining(actor.id, input.projectId),
    outstandingTotal(actor.id, input.projectId),
  ]);
  const available = availableToRequest(remaining, outstanding);

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
    currencyId: project.currencyId,
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
