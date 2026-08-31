import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { absences, auditLog, users } from '@/db/schema';
import { can, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { actionLabel } from '@/domain/activity/labels';

/**
 * فعالیت و حضور.
 *
 * «فعالیت» از همان `audit_log` خوانده می‌شود که هر سرویس در آن می‌نویسد —
 * یک منبع، نه یک جدولِ موازی که ممکن است از واقعیت عقب بیفتد.
 */

/** ⚠️ «فعالیت» مجوزِ خودش را دارد — دیدنِ کارِ همه، حقِ همه نیست. */
function assertActivity(actor: Actor): void {
  if (!can(actor, 'activity.view')) throw new ForbiddenError('activity.view');
}

/** ⚠️ سقفِ اندازهٔ صفحه — درخواستِ ۱۰٬۰۰۰ ردیف نباید سرور را بخواباند. */
export const ACTIVITY_PER_PAGE = 50;
const MAX_PER_PAGE = 200;

/**
 * یک صفحه از فعالیت.
 *
 * ⚠️ شمارشِ کل جدا برمی‌گردد چون بدونِ آن نمی‌شود گفت «صفحهٔ بعدی هست یا نه»
 * و کاربر عملاً فقط ۵۰ ردیفِ اول را می‌بیند بی‌آنکه بداند بقیه‌ای هم هست.
 */
export async function listActivity(
  actor: Actor,
  options: { page?: number; perPage?: number } = {},
) {
  assertActivity(actor);

  const perPage = Math.min(Math.max(1, options.perPage ?? ACTIVITY_PER_PAGE), MAX_PER_PAGE);
  const page = Math.max(1, Math.trunc(options.page ?? 1));

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        objectType: auditLog.objectType,
        objectId: auditLog.objectId,
        createdAt: auditLog.createdAt,
        actorName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog),
  ]);

  const total = totalRows[0]?.n ?? 0;
  return {
    rows,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/* ------------------------------------------------------------------ *
 * حضور و مرخصی
 * ------------------------------------------------------------------ */

export async function listAbsences(actor: Actor, input: { from: string; to: string }) {
  // مرخصی زیرِ بخشِ اعضا گارد می‌شود.
  if (!can(actor, 'members.view')) throw new ForbiddenError('members.view');

  return db
    .select({
      id: absences.id,
      userId: absences.userId,
      userName: users.name,
      fromDate: absences.fromDate,
      toDate: absences.toDate,
      note: absences.note,
    })
    .from(absences)
    .leftJoin(users, eq(users.id, absences.userId))
    // بازه‌ای که با پنجرهٔ نمایش **همپوشانی** دارد، نه فقط آن‌که کاملاً داخلش است.
    .where(and(lte(absences.fromDate, input.to), gte(absences.toDate, input.from)))
    .orderBy(absences.fromDate);
}

export async function saveAbsence(
  actor: Actor,
  input: { id: number | null; userId: number; fromDate: string; toDate: string; note: string },
) {
  if (!can(actor, 'members.manage')) throw new ForbiddenError('members.manage');

  // ⚠️ بازهٔ وارونه بی‌صدا ذخیره نمی‌شود؛ جایش می‌کنیم تا مرخصی گم نشود.
  const [fromDate, toDate] = input.fromDate <= input.toDate
    ? [input.fromDate, input.toDate]
    : [input.toDate, input.fromDate];

  const values = { userId: input.userId, fromDate, toDate, note: input.note };

  if (input.id) {
    await db.update(absences).set({ ...values, updatedAt: new Date() })
      .where(eq(absences.id, input.id));
    return input.id;
  }
  const rows = await db.insert(absences).values(values).returning({ id: absences.id });
  return rows[0]!.id;
}

export async function deleteAbsence(actor: Actor, id: number) {
  if (!can(actor, 'members.manage')) throw new ForbiddenError('members.manage');
  await db.delete(absences).where(eq(absences.id, id));
}

export { sql };

export { actionLabel };
