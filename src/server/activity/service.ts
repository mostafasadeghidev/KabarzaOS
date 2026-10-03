import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { absences, auditLog, users } from '@/db/schema';
import { can, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { actionLabel } from '@/domain/activity/labels';
import {
  collectRefs, describeChanges, isSingleton, snapshotName, subjectKind, SUBJECT_LABELS,
  type ChangeSet, type SubjectKind,
} from '@/domain/activity/details';
import { currentLocale } from '@/i18n/server';
import { namesOf } from './names';

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
        actorId: auditLog.actorId,
        actorType: auditLog.actorType,
        actorName: users.name,
        // نامِ عکس‌گرفته — برای موردی که بعداً حذف شده و دیگر در جدولش نیست.
        // ⚠️ روی مقدارِ تنها (عدد/فهرست) `->>` بی‌خطا `null` می‌دهد.
        snapshot: sql<string | null>`coalesce(
          ${auditLog.before}->>'title', ${auditLog.before}->>'name',
          ${auditLog.after}->>'title', ${auditLog.after}->>'name')`,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog),
  ]);

  const total = totalRows[0]?.n ?? 0;
  const subjects = await subjectsOf(rows);
  return {
    rows: rows.map(({ snapshot: _snapshot, ...r }, i) => ({ ...r, subject: subjects[i]! })),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * «مورد»ِ رویداد به زبانِ آدم — «پروژه: طراحی سایت» به‌جای «project #12».
 * `name: null` یعنی مورد پیدا نشد (حذف شده و نامی هم در رویداد نبود).
 */
export interface EventSubject {
  kind: SubjectKind | null;
  /** برچسبِ نوع («پروژه»)؛ برای نوعِ ناشناخته همان `object_type` ِ خام. */
  kindLabel: string;
  name: string | null;
  id: number | null;
  /** موردی که هنوز وجود دارد — فقط آن پیوند می‌گیرد. */
  live: boolean;
  /** پروژهٔ مادر، برای تسک و کارکرد و … */
  projectId: number | null;
  projectTitle: string | null;
}

async function subjectsOf(rows: Array<{
  action: string; objectType: string; objectId: number | null; snapshot: string | null;
}>): Promise<EventSubject[]> {
  const kinds = rows.map((r) => subjectKind(r.action, r.objectType));
  const names = await namesOf(
    rows.flatMap((r, i) => (kinds[i] && r.objectId ? [{ kind: kinds[i]!, id: r.objectId }] : [])),
    await currentLocale(),
  );
  return rows.map((r, i) => {
    const kind = kinds[i]!;
    const single = kind !== null && isSingleton(kind);
    const found = kind && r.objectId ? names.get(`${kind}:${r.objectId}`) : undefined;
    /**
     * ⚠️ رویدادهای تسک با شناسهٔ **پروژه** ثبت می‌شوند؛ ولی «ویرایشِ تسک — پروژهٔ
     * X» نمی‌گوید کدام تسک. اگر عنوانِ تسک در خودِ رویداد هست، مورد همان تسک است.
     */
    if (kind === 'project' && r.action.startsWith('task.') && r.snapshot) {
      return {
        kind: 'task' as const,
        kindLabel: SUBJECT_LABELS.task,
        name: r.snapshot,
        id: null,
        live: false,
        projectId: found ? r.objectId : null,
        projectTitle: found?.name ?? null,
      };
    }
    return {
      kind,
      kindLabel: kind ? SUBJECT_LABELS[kind] : r.objectType,
      name: single ? null : found?.name || r.snapshot || null,
      id: single ? null : r.objectId,
      live: !!found,
      projectId: kind === 'project' ? (found ? r.objectId : null) : found?.projectId ?? null,
      projectTitle: found?.projectTitle ?? null,
    };
  });
}

/** جزئیاتِ کاملِ یک رویداد — برای دیالوگِ «چه چیزی عوض شد». */
export interface ActivityEventDetail {
  id: number;
  action: string;
  label: string;
  createdAt: Date;
  actorName: string | null;
  actorType: string;
  subject: EventSubject;
  changes: ChangeSet;
  /** نامِ شناسه‌های داخلِ تغییرات: `user:3` → «سارا». */
  refs: Record<string, string>;
}

export async function getActivityEvent(actor: Actor, id: number): Promise<ActivityEventDetail | null> {
  assertActivity(actor);
  const [row] = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      objectType: auditLog.objectType,
      objectId: auditLog.objectId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      actorType: auditLog.actorType,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.id, id));
  if (!row) return null;

  const [subject] = await subjectsOf([{ ...row, snapshot: snapshotName(row.before, row.after) }]);
  const names = await namesOf(collectRefs(row.action, row.before, row.after), await currentLocale());

  return {
    id: row.id,
    action: row.action,
    label: actionLabel(row.action),
    createdAt: row.createdAt,
    actorName: row.actorName,
    actorType: row.actorType,
    subject: subject!,
    // ⚠️ `describeChanges` رازها را دوباره حذف می‌کند — ردیف‌های پیش از مهاجرتِ ۰۰۳۷ هم امن‌اند.
    changes: describeChanges(row.action, row.before, row.after),
    refs: Object.fromEntries([...names].map(([key, v]) => [key, v.name])),
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
