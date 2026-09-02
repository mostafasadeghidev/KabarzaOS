import { and, desc, eq, gte, inArray, isNull, sql, ilike, lte, or, SQL } from 'drizzle-orm';
import { assertNotFrozen } from '@/server/projects/authority';
import { db } from '@/db/client';
import {
  auditLog, projectMembers, projects, timelogs, users, workTimers, tags, userOffices,
} from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  elapsedMinutes, isEditable, mergeDescriptions, planStop, resumeStartedAt,
  toDateString, type PendingTimer, type RunningTimer,
} from '@/domain/timelogs/timer';
import { isFrozenProject } from '@/domain/projects/lifecycle';
import { monthRange, weekRange } from '@/domain/reports/filters';
import { clampPage, HOURS_PER_PAGE } from '@/domain/timelogs/hours-filter';

/**
 * تایمرِ کار و ثبتِ ساعت.
 * ⚠️ همهٔ گاردها اینجا هستند، نه در صفحه (R-ARCH-01).
 */

export class TimerError extends Error {
  constructor(public readonly code: 'already_running' | 'not_running' | 'nothing_pending') {
    super(code);
    this.name = 'TimerError';
  }
}

async function audit(actor: Actor, action: string, objectId: number, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'timelog',
    objectId,
    after: after ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * چه کسی روی چه چیزی ساعت ثبت می‌کند
 * ------------------------------------------------------------------ */

/**
 * پورتِ `can_log_general()`: ساعتِ **عمومی** (بی‌پروژه) را عضوِ تیم، مالک/مدیرِ
 * پروژه‌ها و مالی می‌زنند — کارِ اداری/حسابداری که به پروژه‌ای نمی‌خورد.
 * ⚠️ پیش از این فقط نقشِ `member` بود و مالک/حسابدار اصلاً صفحهٔ ساعت نداشتند.
 */
export function canLogGeneral(actor: Actor): boolean {
  return actor.roles.includes('member') || actor.roles.includes('owner')
    || canManageSection(actor, 'projects') || canViewSection(actor, 'finance');
}

/** دفترهای تحتِ مدیریتِ کاربر — همان `managed_office_ids`. */
async function managedOffices(userId: number): Promise<number[]> {
  const rows = await db.select({ officeId: userOffices.officeId }).from(userOffices)
    .where(and(eq(userOffices.userId, userId), eq(userOffices.manages, true)));
  return rows.map((r) => r.officeId);
}

/**
 * پورتِ `can_log_time()`: روی پروژه → عضوِ امضاشده، **مدیرِ دفترِ پروژه** (بی‌نیاز از
 * امضا)، یا مالک/مدیرِ پروژه‌ها؛ بی‌پروژه → `canLogGeneral`. پروژهٔ منجمد
 * (بایگانی/لغو/توقف) ساعتِ تازه نمی‌پذیرد. پروژهٔ خصوصی پشتِ گاردِ scope می‌ماند.
 */
export async function canLogTime(actor: Actor, projectId: number | null): Promise<boolean> {
  if (projectId === null) return canLogGeneral(actor);

  const rows = await db
    .select({ scope: projects.scope, isArchived: projects.isArchived, officeId: projects.officeId, statusGroup: tags.statusGroup })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  const project = rows[0];
  if (!project) return false;
  if (!visibleScopes(actor).includes(project.scope)) return false;
  if (isFrozenProject(project)) return false;

  if (actor.roles.includes('owner') || canManageSection(actor, 'projects')) return true;

  const member = await db.select({ id: projectMembers.id }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id)));
  if (member.length > 0) return true;

  return project.officeId !== null && (await managedOffices(actor.id)).includes(project.officeId);
}

/** آیا این کاربر بخشِ «ساعت کاری» را دارد؟ پورتِ افزونه: هر که ساعتِ عمومی یا پروژه‌ای می‌تواند بزند. */
export async function canUseTimesheet(actor: Actor): Promise<boolean> {
  if (canLogGeneral(actor)) return true;
  return (await loggableProjects(actor)).length > 0;
}

/**
 * پروژه‌هایی که این کاربر می‌تواند رویشان ساعت ثبت کند — پورتِ افزونه:
 * پروژه‌های عضویت ∪ پروژه‌های دفترهای تحتِ مدیریت (مالک/مدیرِ پروژه‌ها: همه)،
 * فقط **باز** و **غیرمنجمد** — پیش از این بسته/لغو/توقف در فهرست بود و ثبت
 * با خطای عمومی می‌شکست.
 */
export async function loggableProjects(actor: Actor) {
  const scopes = visibleScopes(actor);
  const global = actor.roles.includes('owner') || canManageSection(actor, 'projects');
  const offices = global ? [] : await managedOffices(actor.id);

  return db
    .selectDistinct({ id: projects.id, title: projects.title })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .where(and(
      isNull(projects.deletedAt),
      eq(projects.isArchived, false),
      inArray(projects.scope, scopes),
      sql`coalesce(${tags.isClosed}, false) = false`,
      sql`coalesce(${tags.statusGroup}, '') not in ('cancelled', 'on_hold')`,
      global ? sql`true` : or(
        sql`${projectMembers.id} is not null`,
        offices.length > 0 ? inArray(projects.officeId, offices) : sql`false`,
      ),
    ))
    .orderBy(projects.title);
}

/* ------------------------------------------------------------------ *
 * تایمر
 * ------------------------------------------------------------------ */

export interface TimerState {
  running: (RunningTimer & { projectTitle: string | null; minutes: number }) | null;
  pending: (PendingTimer & { projectTitle: string | null }) | null;
}

/** وضعیتِ فعلیِ تایمرِ کاربر — برای نوارِ بالای صفحه. */
export async function timerState(actor: Actor, now = new Date()): Promise<TimerState> {
  const rows = await db
    .select({
      projectId: workTimers.projectId,
      startedAt: workTimers.startedAt,
      pendingMinutes: workTimers.pendingMinutes,
      pendingLogDate: workTimers.pendingLogDate,
      projectTitle: projects.title,
    })
    .from(workTimers)
    .leftJoin(projects, eq(projects.id, workTimers.projectId))
    .where(eq(workTimers.userId, actor.id));

  const row = rows[0];
  if (!row) return { running: null, pending: null };

  if (row.startedAt) {
    return {
      running: {
        projectId: row.projectId,
        startedAt: row.startedAt,
        projectTitle: row.projectTitle,
        minutes: elapsedMinutes(row.startedAt, now),
      },
      pending: null,
    };
  }

  return {
    running: null,
    pending: {
      projectId: row.projectId,
      minutes: row.pendingMinutes!,
      logDate: row.pendingLogDate!,
      projectTitle: row.projectTitle,
    },
  };
}

/** شروعِ تایمر — اگر یکی در حالِ اجراست، کاری نمی‌کند (مثلِ نسخهٔ قبلی). */
export async function startTimer(actor: Actor, projectId: number | null, now = new Date()) {
  if (!await canLogTime(actor, projectId)) throw new ForbiddenError('timelog.forbidden');
  // ⚠️ تایمر هم روی پروژهٔ منجمد شروع نمی‌شود (`handle_timer_start`).
  if (projectId) await assertNotFrozen(projectId, actor);

  const state = await timerState(actor, now);
  if (state.running) throw new TimerError('already_running');
  // تایمرِ پارک‌شده باید اول تعیینِ تکلیف شود، وگرنه گم می‌شود.
  if (state.pending) throw new TimerError('already_running');

  await db.insert(workTimers)
    .values({ userId: actor.id, projectId, startedAt: now })
    .onConflictDoUpdate({
      target: workTimers.userId,
      set: { projectId, startedAt: now, pendingMinutes: null, pendingLogDate: null },
    });
}

/**
 * توقفِ تایمر.
 * ⚠️ زیرِ سقف ثبت می‌شود؛ بالای سقف **هیچ چیز ذخیره نمی‌شود** و پارک می‌گردد.
 */
export async function stopTimer(actor: Actor, description: string, now = new Date()) {
  const state = await timerState(actor, now);
  if (!state.running) throw new TimerError('not_running');

  const outcome = planStop(
    { projectId: state.running.projectId, startedAt: state.running.startedAt },
    now,
  );

  if (outcome.action === 'park') {
    await db.update(workTimers).set({
      startedAt: null,
      pendingMinutes: outcome.minutes,
      pendingLogDate: outcome.logDate,
      updatedAt: now,
    }).where(eq(workTimers.userId, actor.id));
    return { parked: true, minutes: outcome.minutes };
  }

  await db.delete(workTimers).where(eq(workTimers.userId, actor.id));
  if (outcome.minutes > 0) {
    await addOrMerge(actor, {
      projectId: outcome.projectId,
      logDate: outcome.logDate,
      minutes: outcome.minutes,
      description,
    });
  }
  return { parked: false, minutes: outcome.minutes };
}

/** تأییدِ تایمرِ پارک‌شده با دقیقهٔ اصلاح‌شدهٔ کاربر. */
export async function confirmPending(actor: Actor, minutes: number, now = new Date()) {
  const state = await timerState(actor, now);
  if (!state.pending) throw new TimerError('nothing_pending');

  await db.delete(workTimers).where(eq(workTimers.userId, actor.id));
  if (minutes > 0) {
    await addOrMerge(actor, {
      projectId: state.pending.projectId,
      logDate: state.pending.logDate,
      minutes,
      description: '',
    });
  }
}

/** ازسرگیریِ تایمرِ پارک‌شده — زمانِ شمرده‌شده از دست نمی‌رود. */
export async function resumePending(actor: Actor, now = new Date()) {
  const state = await timerState(actor, now);
  if (!state.pending) throw new TimerError('nothing_pending');

  await db.update(workTimers).set({
    startedAt: resumeStartedAt(state.pending, now),
    pendingMinutes: null,
    pendingLogDate: null,
    updatedAt: now,
  }).where(eq(workTimers.userId, actor.id));
}

/** دور انداختنِ تایمرِ پارک‌شده بدونِ ثبت. */
export async function discardPending(actor: Actor) {
  await db.delete(workTimers).where(eq(workTimers.userId, actor.id));
}

/* ------------------------------------------------------------------ *
 * ثبتِ ساعت
 * ------------------------------------------------------------------ */

export interface LogInput {
  projectId: number | null;
  logDate: string;
  minutes: number;
  description: string;
}

/**
 * افزودن یا **ادغام** با ثبتِ همان روز و همان پروژه.
 *
 * ⚠️ یک روز + یک پروژه = یک ردیف. وگرنه «چقدر امروز روی پروژهٔ X» به چند
 * ردیفِ تکه‌تکه تبدیل می‌شود و گزارش خواندنی نمی‌ماند.
 */
export async function addOrMerge(actor: Actor, input: LogInput): Promise<number> {
  if (!await canLogTime(actor, input.projectId)) throw new ForbiddenError('timelog.forbidden');
  // ⚠️ پروژهٔ منجمد ساعتِ تازه نمی‌پذیرد (`handle_log_time` → `block_if_frozen`).
  if (input.projectId) await assertNotFrozen(input.projectId, actor);

  const existing = await db
    .select({ id: timelogs.id, minutes: timelogs.minutes, description: timelogs.description })
    .from(timelogs)
    .where(and(
      eq(timelogs.userId, actor.id),
      input.projectId === null ? isNull(timelogs.projectId) : eq(timelogs.projectId, input.projectId),
      eq(timelogs.logDate, input.logDate),
    ))
    .orderBy(timelogs.id)
    .limit(1);

  const row = existing[0];
  if (!row) {
    const inserted = await db.insert(timelogs).values({
      projectId: input.projectId,
      userId: actor.id,
      logDate: input.logDate,
      minutes: input.minutes,
      description: input.description.trim(),
    }).returning({ id: timelogs.id });

    await audit(actor, 'timelog.add', inserted[0]!.id, input);
    return inserted[0]!.id;
  }

  await db.update(timelogs).set({
    minutes: row.minutes + input.minutes,
    description: mergeDescriptions(row.description, input.description),
    updatedAt: new Date(),
  }).where(eq(timelogs.id, row.id));

  await audit(actor, 'timelog.merge', row.id, input);
  return row.id;
}

export interface HoursListFilter {
  from?: string | null;
  to?: string | null;
  /** نامِ پروژه (شامل) — ساعتِ عمومی عنوان ندارد، پس با فیلترِ نام بیرون می‌ماند. */
  project?: string | null;
  page?: number;
  perPage?: number;
}

/**
 * ساعت‌های خودِ کاربر — پورتِ `view_hours()`: بازه/نامِ پروژه، صفحه‌بندیِ ۱۵تایی،
 * جمعِ دقیقه‌های بازه. تازه‌ترین اول.
 */
export async function myLogs(actor: Actor, filter: HoursListFilter = {}, now = new Date()) {
  const perPage = filter.perPage ?? HOURS_PER_PAGE;
  const conds: SQL[] = [eq(timelogs.userId, actor.id)];
  if (filter.from) conds.push(gte(timelogs.logDate, filter.from));
  if (filter.to) conds.push(lte(timelogs.logDate, filter.to));
  if (filter.project) conds.push(ilike(projects.title, `%${filter.project.replace(/[%_\\]/g, '')}%`));
  const where = and(...conds);

  const [summary] = await db
    .select({ n: sql<number>`count(*)::int`, minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
    .from(timelogs)
    .leftJoin(projects, eq(projects.id, timelogs.projectId))
    .where(where);
  const total = summary?.n ?? 0;
  const { page, pages } = clampPage(filter.page ?? 1, total, perPage);

  const rows = await db
    .select({
      id: timelogs.id,
      projectId: timelogs.projectId,
      projectTitle: projects.title,
      logDate: timelogs.logDate,
      minutes: timelogs.minutes,
      description: timelogs.description,
      createdAt: timelogs.createdAt,
    })
    .from(timelogs)
    .leftJoin(projects, eq(projects.id, timelogs.projectId))
    .where(where)
    .orderBy(desc(timelogs.logDate), desc(timelogs.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    rows: rows.map((r) => ({ ...r, editable: isEditable(r.createdAt, now) })),
    total,
    page,
    pages,
    rangeMinutes: summary?.minutes ?? 0,
  };
}

/** عنوانِ پروژه‌هایی که کاربر رویشان ساعت زده — پیشنهادِ فیلترِ نام (پورتِ `project_ids_for_user`). */
export async function loggedProjectTitles(actor: Actor): Promise<string[]> {
  const rows = await db
    .selectDistinct({ title: projects.title })
    .from(timelogs)
    .innerJoin(projects, eq(projects.id, timelogs.projectId))
    .where(eq(timelogs.userId, actor.id))
    .orderBy(projects.title);
  return rows.map((r) => r.title);
}

/**
 * جمعِ ساعتِ «این هفته» (هفتهٔ تقویمی از روزِ شروعِ تنظیمات) و «این ماه» — پورتِ
 * افزونه. ⚠️ پیش از این «هفته» هفت روزِ گذشته بود و با گزارش‌ها نمی‌خواند.
 */
export async function myTotals(actor: Actor, now = new Date(), weekStart = 0) {
  const today = toDateString(now);
  const week = weekRange(today, weekStart);
  const month = monthRange(today);
  const rows = await db
    .select({
      week: sql<number>`coalesce(sum(case when ${timelogs.logDate} >= ${week.from} and ${timelogs.logDate} <= ${week.to} then ${timelogs.minutes} else 0 end), 0)::int`,
      month: sql<number>`coalesce(sum(case when ${timelogs.logDate} >= ${month.from} and ${timelogs.logDate} <= ${month.to} then ${timelogs.minutes} else 0 end), 0)::int`,
      total: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
    .from(timelogs)
    .where(eq(timelogs.userId, actor.id));

  return { week: rows[0]?.week ?? 0, month: rows[0]?.month ?? 0, total: rows[0]?.total ?? 0 };
}

/** ویرایشِ یک ثبت — فقط صاحبش و فقط داخلِ پنجرهٔ ویرایش. */
export async function updateLog(
  actor: Actor,
  logId: number,
  input: { minutes: number; description: string; logDate?: string; projectId?: number | null },
  now = new Date(),
) {
  const rows = await db.select().from(timelogs).where(eq(timelogs.id, logId));
  const row = rows[0];
  if (!row) throw new ForbiddenError('timelog.not_found');

  // ⚠️ مدیر هم ثبتِ دیگری را ویرایش نمی‌کند — این عددِ حقوقِ اوست.
  if (row.userId !== actor.id) throw new ForbiddenError('timelog.not_yours');
  if (!isEditable(row.createdAt, now)) throw new ForbiddenError('timelog.window_closed');
  // ⚠️ همان قفلی که ثبت، حذف و تایمر دارند — ویرایش نداشت (`block_if_frozen`).
  if (row.projectId) await assertNotFrozen(row.projectId, actor);

  // پورتِ افزونه: تاریخ و پروژه هم ویرایش‌پذیرند (ثبتِ روزِ اشتباه را نباید حذف و دوباره ساخت).
  const nextProject = input.projectId === undefined ? row.projectId : input.projectId;
  if (input.projectId !== undefined && input.projectId !== row.projectId) {
    if (!await canLogTime(actor, input.projectId)) throw new ForbiddenError('timelog.forbidden');
  }
  const nextDate = input.logDate && /^\d{4}-\d{2}-\d{2}$/.test(input.logDate) ? input.logDate : row.logDate;

  await db.update(timelogs).set({
    minutes: input.minutes,
    description: input.description.trim(),
    logDate: nextDate,
    projectId: nextProject,
    updatedAt: now,
  }).where(eq(timelogs.id, logId));

  await audit(actor, 'timelog.update', logId, input);
}

export async function deleteLog(actor: Actor, logId: number, now = new Date()) {
  const rows = await db.select().from(timelogs).where(eq(timelogs.id, logId));
  const row = rows[0];
  if (!row) return;

  if (row.userId !== actor.id) throw new ForbiddenError('timelog.not_yours');
  if (!isEditable(row.createdAt, now)) throw new ForbiddenError('timelog.window_closed');
  if (row.projectId) await assertNotFrozen(row.projectId, actor);

  await db.delete(timelogs).where(eq(timelogs.id, logId));
  await audit(actor, 'timelog.delete', logId, row);
}

export { canViewSection, users, gte };
