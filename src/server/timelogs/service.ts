import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { assertNotFrozen } from '@/server/projects/authority';
import { db } from '@/db/client';
import {
  auditLog, projectMembers, projects, timelogs, users, workTimers,
} from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  elapsedMinutes, isEditable, mergeDescriptions, planStop, resumeStartedAt,
  toDateString, type PendingTimer, type RunningTimer,
} from '@/domain/timelogs/timer';

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
 * ⚠️ پورتِ `can_log_time()` — عضویت در پروژه، یا مدیریتِ پروژه‌ها.
 * پروژهٔ خصوصی همچنان پشتِ گاردِ scope است.
 */
export async function canLogTime(actor: Actor, projectId: number | null): Promise<boolean> {
  // ⚠️ شرطِ نخست و مشترک — چه ساعتِ عمومی چه پروژه‌ای.
  if (!isTeamMember(actor)) return false;

  // ساعتِ عمومی: کارِ اداری که به پروژه‌ای نمی‌خورد.
  if (projectId === null) return true;

  const rows = await db.select({ scope: projects.scope, isArchived: projects.isArchived })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  const project = rows[0];
  if (!project) return false;
  if (!visibleScopes(actor).includes(project.scope)) return false;
  // ⚠️ پروژهٔ بایگانی‌شده «منجمد» است — ساعتِ تازه رویش ثبت نمی‌شود.
  if (project.isArchived) return false;

  // مدیرِ پروژه‌ها که عضوِ تیم هم هست، روی هر پروژه‌ای ثبت می‌کند.
  if (canManageSection(actor, 'projects')) return true;

  const member = await db.select({ id: projectMembers.id }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id)));
  return member.length > 0;
}

/** آیا این کاربر اصلاً بخشِ «ساعت کاری» را دارد؟ */
export function canUseTimesheet(actor: Actor): boolean {
  return isTeamMember(actor);
}

/**
 * ساعت را **فقط اعضای تیم** ثبت می‌کنند.
 *
 * ⚠️ واگراییِ آگاهانه از نسخهٔ قبلی: آنجا مالک و حسابدار هم می‌توانستند ساعتِ
 * عمومی بزنند. اینجا نه — مدیرِ کل کارش را ساعتی نمی‌فروشد و آن ردیف‌ها
 * فقط گزارشِ «ساعتِ کاریِ تیم» را آلوده می‌کردند. مدیر همچنان **می‌بیند**
 * و مدیریت می‌کند؛ فقط برای خودش ثبت نمی‌کند.
 *
 * ⚠️ مالکی که واقعاً عضوِ تیم هم هست (نقشِ `member` را هم دارد) استثنا
 * نیست: نقش را دارد، پس ثبت هم می‌کند.
 */
function isTeamMember(actor: Actor): boolean {
  return actor.roles.includes('member');
}

/** پروژه‌هایی که این کاربر می‌تواند رویشان ساعت ثبت کند. */
export async function loggableProjects(actor: Actor) {
  const scopes = visibleScopes(actor);
  const base = db
    .select({ id: projects.id, title: projects.title })
    .from(projects);

  if (canManageSection(actor, 'projects')) {
    return base
      .where(and(
        isNull(projects.deletedAt),
        eq(projects.isArchived, false),
        inArray(projects.scope, scopes),
      ))
      .orderBy(projects.title);
  }

  return db
    .selectDistinct({ id: projects.id, title: projects.title })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(
      isNull(projects.deletedAt),
      eq(projects.isArchived, false),
      inArray(projects.scope, scopes),
      eq(projectMembers.userId, actor.id),
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
  if (projectId) await assertNotFrozen(projectId);

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
  if (input.projectId) await assertNotFrozen(input.projectId);

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

/** ساعت‌های خودِ کاربر — تازه‌ترین اول. */
export async function myLogs(actor: Actor, limit = 60, now = new Date()) {
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
    .where(eq(timelogs.userId, actor.id))
    .orderBy(desc(timelogs.logDate), desc(timelogs.id))
    .limit(limit);

  return rows.map((r) => ({ ...r, editable: isEditable(r.createdAt, now) }));
}

/** جمعِ ساعتِ این هفته و این ماهِ کاربر — دو عدد، یک کوئری. */
export async function myTotals(actor: Actor, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      week: sql<number>`coalesce(sum(case when ${timelogs.logDate} >= ${toDateString(weekAgo)} then ${timelogs.minutes} else 0 end), 0)::int`,
      total: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
    .from(timelogs)
    .where(eq(timelogs.userId, actor.id));

  return { week: rows[0]?.week ?? 0, total: rows[0]?.total ?? 0 };
}

/** ویرایشِ یک ثبت — فقط صاحبش و فقط داخلِ پنجرهٔ ویرایش. */
export async function updateLog(
  actor: Actor,
  logId: number,
  input: { minutes: number; description: string },
  now = new Date(),
) {
  const rows = await db.select().from(timelogs).where(eq(timelogs.id, logId));
  const row = rows[0];
  if (!row) throw new ForbiddenError('timelog.not_found');

  // ⚠️ مدیر هم ثبتِ دیگری را ویرایش نمی‌کند — این عددِ حقوقِ اوست.
  if (row.userId !== actor.id) throw new ForbiddenError('timelog.not_yours');
  if (!isEditable(row.createdAt, now)) throw new ForbiddenError('timelog.window_closed');

  await db.update(timelogs).set({
    minutes: input.minutes,
    description: input.description.trim(),
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
  if (row.projectId) await assertNotFrozen(row.projectId);

  await db.delete(timelogs).where(eq(timelogs.id, logId));
  await audit(actor, 'timelog.delete', logId, row);
}

export { canViewSection, users, gte };
