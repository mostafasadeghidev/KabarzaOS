import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { absences, auditLog, userOffices, userRoles, users } from '@/db/schema';
import { canManageSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  adjacencyWindow, normalizeRange, planAbsence, type AbsenceRow,
} from '@/domain/availability/absences';
import { notify } from '@/server/notifications/service';

/**
 * مرخصیِ موردی — پورتِ `Timer_Absence_Handlers` و `Support\Absences`.
 *
 * ⚠️ چهار مسیرِ نسخهٔ قبلی اینجا دو تابع شده‌اند: ثبت و حذف، هرکدام با پارامترِ
 * «برای چه کسی». دلیلش این است که گاردِ هر دو یکی است و دو کپیِ جدا دیر یا
 * زود از هم واگرا می‌شدند.
 */

/**
 * آیا این مدیر می‌تواند مرخصیِ این عضو را بگرداند؟ — پورتِ
 *.
 *
 * دو راه: مدیریتِ سراسریِ اعضا، یا مدیرِ دفتری که عضو در آن است.
 */
export async function canManageLeave(actor: Actor, memberId: number): Promise<boolean> {
  if (memberId === actor.id) return true;
  if (canManageSection(actor, 'members')) return true;

  const [managed, member] = await Promise.all([
    db.select({ officeId: userOffices.officeId })
      .from(userOffices)
      .where(and(eq(userOffices.userId, actor.id), eq(userOffices.manages, true))),
    db.select({ officeId: userOffices.officeId })
      .from(userOffices)
      .where(eq(userOffices.userId, memberId)),
  ]);

  if (managed.length === 0) return false;
  const mine = new Set(managed.map((r) => r.officeId));
  return member.some((r) => mine.has(r.officeId));
}

async function assertCanManageLeave(actor: Actor, memberId: number): Promise<void> {
  if (!(await canManageLeave(actor, memberId))) throw new ForbiddenError('absence.manage');
}

async function audit(
  actor: Actor,
  action: string,
  memberId: number,
  before: unknown,
  after: unknown,
) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'user',
    objectId: memberId,
    before: before ?? null,
    after: after ?? null,
  });
}

/** مرخصی‌های یک نفر؛ با `upcomingOnly` گذشته‌ها کنار می‌روند. */
export async function listAbsences(
  actor: Actor,
  userId: number,
  options: { upcomingOnly?: boolean; today?: string } = {},
) {
  await assertCanManageLeave(actor, userId);

  const conditions = [eq(absences.userId, userId)];
  if (options.upcomingOnly) {
    conditions.push(gte(absences.toDate, options.today ?? new Date().toISOString().slice(0, 10)));
  }

  return db
    .select({
      id: absences.id,
      fromDate: absences.fromDate,
      toDate: absences.toDate,
      note: absences.note,
    })
    .from(absences)
    .where(and(...conditions))
    .orderBy(asc(absences.fromDate), asc(absences.id));
}

export interface AbsenceInput {
  userId: number;
  from: string;
  to: string;
  note?: string;
}

export class AbsenceDateError extends Error {
  constructor() {
    super('absence.invalid_range');
  }
}

/**
 * ثبتِ مرخصی — برای خود یا (با مجوز) برای عضوِ دیگر.
 *
 * ⚠️ همپوشانی **ادغام** می‌شود، نه رد (منطقش در دامنه است). و وقتی مدیر برای
 * دیگری ثبت می‌کند، خودِ عضو اعلان می‌گیرد: تغییرِ خاموش در تقویمِ کسی
 * پذیرفتنی نیست.
 */
export async function saveAbsence(actor: Actor, input: AbsenceInput): Promise<number> {
  await assertCanManageLeave(actor, input.userId);

  const range = normalizeRange(input.from, input.to);
  if (!range) throw new AbsenceDateError();

  const { lo, hi } = adjacencyWindow(range.from, range.to);

  const id = await db.transaction(async (tx) => {
    // ردیف‌های همپوشان یا چسبیده — همان ترتیبِ نسخهٔ قبلی، چون «اولی» می‌ماند.
    const nearby: AbsenceRow[] = await tx
      .select({
        id: absences.id,
        fromDate: absences.fromDate,
        toDate: absences.toDate,
        note: absences.note,
      })
      .from(absences)
      .where(and(
        eq(absences.userId, input.userId),
        lte(absences.fromDate, hi),
        gte(absences.toDate, lo),
      ))
      .orderBy(asc(absences.fromDate), asc(absences.id));

    const plan = planAbsence(range.from, range.to, input.note ?? '', nearby);
    if (!plan) throw new AbsenceDateError();

    if (plan.kind === 'insert') {
      const rows = await tx.insert(absences).values({
        userId: input.userId,
        fromDate: plan.fromDate,
        toDate: plan.toDate,
        note: plan.note,
      }).returning({ id: absences.id });
      return rows[0]!.id;
    }

    for (const dead of plan.deleteIds) {
      await tx.delete(absences).where(eq(absences.id, dead));
    }
    await tx.update(absences)
      .set({ fromDate: plan.fromDate, toDate: plan.toDate, note: plan.note })
      .where(eq(absences.id, plan.keepId!));
    return plan.keepId!;
  });

  await audit(actor, 'absence.set', input.userId, null, {
    from: range.from, to: range.to, note: input.note ?? '',
  });

  // ⚠️ فقط وقتی **دیگری** ثبت کرده — کسی که خودش ثبت کرده اعلان نمی‌خواهد.
  if (input.userId !== actor.id) {
    const [byUser] = await db.select({ name: users.name })
      .from(users).where(eq(users.id, actor.id));
    await notify([input.userId], {
      type: 'absence_set',
      title: 'مرخصی برای شما ثبت شد',
      body: byUser ? 'از {from} تا {to} (توسط {by}).' : 'از {from} تا {to}.',
      params: { from: range.from, to: range.to, by: byUser?.name ?? '' },
      url: '/activity',
    });
  }

  return id;
}

/**
 * حذفِ مرخصی.
 * ⚠️ گارد روی **صاحبِ ردیف** اعمال می‌شود، نه فقط روی شناسه — وگرنه شناسهٔ
 * حدس‌زده مرخصیِ دیگری را پاک می‌کرد.
 */
export async function deleteAbsence(actor: Actor, id: number): Promise<void> {
  const [row] = await db.select({ userId: absences.userId, fromDate: absences.fromDate, toDate: absences.toDate })
    .from(absences).where(eq(absences.id, id));
  if (!row) return;

  await assertCanManageLeave(actor, row.userId);

  await db.delete(absences).where(eq(absences.id, id));
  await audit(actor, 'absence.delete', row.userId, {
    from: row.fromDate, to: row.toDate,
  }, null);
}

/**
 * اعضایی که این کاربر می‌تواند برایشان مرخصی ثبت کند — خودش همیشه، و
 * (بسته به مجوز) بقیه.
 *
 * ⚠️ یک کوئری، نه یکی به‌ازای هر عضو (R-PERF-01): دفاترِ تحتِ مدیریت یک بار
 * خوانده می‌شود و تقاطع در حافظه گرفته می‌شود.
 */
export async function leaveTargets(actor: Actor): Promise<Array<{ id: number; name: string }>> {
  const [members, self] = await Promise.all([
    db.selectDistinct({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt)))
      .orderBy(users.name),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, actor.id)),
  ]);

  /**
   * ⚠️ خودِ کاربر **همیشه** اول می‌آید، حتی اگر نقشِ «عضو» نداشته باشد.
   * بدونِ این، مالک — که عضو نیست — خودش را در فهرست نمی‌دید و مرورگر
   * گزینهٔ پیش‌فرض را روی اولین عضو می‌گذاشت: مرخصیِ ناخواسته برای کسِ دیگر.
   */
  const withSelf = (rows: Array<{ id: number; name: string }>) =>
    rows.some((r) => r.id === actor.id) || !self[0]
      ? [...rows].sort((a, b) => (a.id === actor.id ? -1 : b.id === actor.id ? 1 : 0))
      : [self[0], ...rows];

  if (canManageSection(actor, 'members')) return withSelf(members);

  const managed = await db
    .select({ officeId: userOffices.officeId })
    .from(userOffices)
    .where(and(eq(userOffices.userId, actor.id), eq(userOffices.manages, true)));

  // فقط خودش.
  if (managed.length === 0) return withSelf([]);

  const mine = new Set(managed.map((r) => r.officeId));
  const rows = await db
    .select({ userId: userOffices.userId, officeId: userOffices.officeId })
    .from(userOffices)
    .where(inArray(userOffices.officeId, [...mine]));

  const allowed = new Set(rows.map((r) => r.userId));
  allowed.add(actor.id);
  return withSelf(members.filter((u) => allowed.has(u.id)));
}
