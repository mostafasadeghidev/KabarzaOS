import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  comments, projectMembers, projects, tags, tasks, taskRoles, timelogs, userOffices, users, userRoles, tagRelations,
  absences, offices as officesTable,
} from '@/db/schema';
import { isFrozenProject } from '@/domain/projects/lifecycle';
import { excerptWords, openThreads } from '@/domain/dashboard/focus';
import {
  pageOf, perPageOf, progressPercent, type AssigneeFilter,
} from '@/domain/team/boards';
import { isOwner, type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  canMonitor, isOfficeManager, monitorableUserIds, resolveRange,
  type DateRange,
} from '@/domain/access/office-scope';
import { avatarsFor } from '@/server/files/service';
import { matrixForIds, rowCells } from '@/server/availability/service';
import { weekOrder, weekdayIndex, WEEKDAYS } from '@/domain/availability/weekly';
import { getSystemConfig } from '@/server/settings/system-service';
import { canManageLeave, listAbsences } from '@/server/availability/absence-service';
import { alias } from 'drizzle-orm/pg-core';
import { visibleToUserSql } from '@/server/projects/repository';

/**
 * «تیمِ من» — دامنهٔ مدیرِ دفتر.
 *
 * ⚠️ این دامنه **عملیاتی است، نه مالی** (کامنتِ خودِ نسخهٔ قبلی). پروژه، تسک،
 * ساعت و بازبینی بله؛ پول همچنان مجوزِ مالیِ جداگانه می‌خواهد.
 */

/** دفاترِ تحتِ مدیریتِ کاربر. */
export async function managedOfficeIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ officeId: userOffices.officeId })
    .from(userOffices)
    .where(and(eq(userOffices.userId, userId), eq(userOffices.manages, true)));
  return rows.map((r) => r.officeId);
}

/**
 * دفاترِ «تیمِ من» برای این کاربر.
 *
 * مدیرِ دفتر: دفاترِ تحتِ مدیریتش. مدیرِ کل: اگر تنظیمِ «تیمِ من برای مدیرِ کل»
 * روشن باشد، **همهٔ** دفاتر (غیرفعال هم، مثلِ مدیرِ دفتری که به دفترِ غیرفعال
 * وصل است) — بی‌آنکه مدیرِ دفتری شود؛ حسابِ مدیرِ کل از صفحهٔ اعضا عمداً
 * ویرایش‌پذیر نیست (`canEditPerson`).
 *
 * ⚠️ فقط دامنهٔ همین بخش است و ردیفِ `user_offices` نمی‌سازد: اعلان‌های مدیرِ
 * دفتر، دسترسیِ پروژه و جلسات همچنان از مدیریتِ واقعی می‌خوانند.
 */
async function teamOfficeIds(actor: Actor): Promise<number[]> {
  if (isOwner(actor) && (await getSystemConfig()).ownerTeamView) {
    const rows = await db.select({ id: officesTable.id }).from(officesTable).orderBy(officesTable.id);
    return rows.map((r) => r.id);
  }
  return managedOfficeIds(actor.id);
}

/**
 * آیا این کاربر بخشِ «تیمِ من» را می‌بیند؟
 *
 * ⚠️ شرط، داشتنِ دفتر در دامنهٔ «تیمِ من» است (← teamOfficeIds) — برای مدیرِ
 * دفتر مثلِ `is_office_manager()` ِ نسخهٔ قبلی. اول مدیرانِ پروژه را استثنا
 * کرده بودم، ولی آن‌وقت منو و خودِ صفحه دو جواب می‌دادند: منو پنهان بود و آدرس
 * باز می‌شد.
 */
export async function hasTeamScope(actor: Actor): Promise<boolean> {
  return isOfficeManager(await teamOfficeIds(actor));
}

async function assertTeamScope(actor: Actor): Promise<number[]> {
  const offices = await teamOfficeIds(actor);
  if (!isOfficeManager(offices)) throw new ForbiddenError('office.not_manager');
  return offices;
}

/** پروژه‌های دفاترِ تحتِ مدیریت. */
async function officeProjectIds(actor: Actor, offices: number[]): Promise<number[]> {
  if (offices.length === 0) return [];
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(
      isNull(projects.deletedAt),
      inArray(projects.officeId, offices),
      inArray(projects.scope, visibleScopes(actor)),
    ));
  return rows.map((r) => r.id);
}

/**
 * اعضای دفاترِ تحتِ مدیریت.
 * پورتِ `office_member_ids`: فقط دارندگانِ نقشِ **عضو** — نه کارفرما/حسابدار/خودِ مدیر که به دفتر وصل‌اند —
 * و فقط حساب‌های حذف‌نشده (نسخهٔ قبلی کاربرِ بی‌`get_userdata` را رد می‌کرد).
 */
async function officeMemberIds(offices: number[]): Promise<number[]> {
  if (offices.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: userOffices.userId })
    .from(userOffices)
    .innerJoin(userRoles, and(eq(userRoles.userId, userOffices.userId), eq(userRoles.role, 'member')))
    .innerJoin(users, and(eq(users.id, userOffices.userId), isNull(users.deletedAt)))
    .where(inArray(userOffices.officeId, offices));
  return rows.map((r) => r.userId);
}

/** کسانی که روی این پروژه‌ها کار کرده‌اند (عضویت یا ساعتِ ثبت‌شده). */
async function projectWorkerIds(projectIds: number[]): Promise<number[]> {
  if (projectIds.length === 0) return [];
  const [memberRows, logRows] = await Promise.all([
    db.selectDistinct({ userId: projectMembers.userId }).from(projectMembers)
      .where(inArray(projectMembers.projectId, projectIds)),
    db.selectDistinct({ userId: timelogs.userId }).from(timelogs)
      .where(inArray(timelogs.projectId, projectIds)),
  ]);
  return [...new Set([...memberRows, ...logRows].map((r) => r.userId))];
}

export interface TeamScope {
  offices: number[];
  projectIds: number[];
  /** اعضای خودِ دفاتر — کارتِ «کارکنانِ تحتِ مدیریت» و ماتریسِ در دسترس بودن. */
  officeMembers: number[];
  /** اعضا ∪ کسانی که روی پروژه‌های دفتر کار کرده‌اند — دامنهٔ پایش و پروفایل. */
  monitorable: number[];
}

export async function teamScope(actor: Actor): Promise<TeamScope> {
  const offices = await assertTeamScope(actor);
  const projectIds = await officeProjectIds(actor, offices);
  const [members, workers] = await Promise.all([
    officeMemberIds(offices),
    projectWorkerIds(projectIds),
  ]);

  return {
    offices,
    projectIds,
    officeMembers: members,
    monitorable: monitorableUserIds({ officeMemberIds: members, projectWorkerIds: workers }),
  };
}

/** تسکِ «باز» — نه بسته، نه در ریویو (پورتِ `open_for_projects`). بی‌وضعیت باز است. */
const OPEN_TASK = sql`coalesce(${tags.isClosed}, false) = false and coalesce(${tags.isReview}, false) = false`;

/**
 * پروژه‌هایی که کامنتشان در صفِ بازبینی می‌آید — منجمدها (بایگانی، کنسل،
 * نگه‌داشته) بیرون‌اند؛ همان `non_frozen_ids` ِ کارتِ نسخهٔ قبلی: پاسخ روی
 * پروژهٔ منجمد ممکن نیست، پس شمردنش فقط کاری نشدنی را نشان می‌داد.
 */
async function nonFrozenIds(projectIds: number[]): Promise<number[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({ id: projects.id, isArchived: projects.isArchived, statusGroup: tags.statusGroup })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(inArray(projects.id, projectIds));
  return rows.filter((r) => !isFrozenProject(r)).map((r) => r.id);
}

/**
 * شمارِ تسک‌های بازِ هر نفر — پورتِ `count_open_for_user_in_projects`: همان
 * قاعدهٔ `visibleToUserSql` (مسئولِ مستقیم، تسکِ خصوصیِ خودش، تسکِ نقشیِ
 * بی‌مسئولِ نقشی که روی همان پروژه دارد و ادعانشده یا ادعای خودش است)، برای
 * همه یک‌جا.
 * ⚠️ پیش از این فقط `assigned_to` شمرده می‌شد: عضوی که کارش نقشی بود «۰ تسکِ
 * باز» نشان می‌داد در حالی که صندوقِ خودش پر بود.
 */
async function openTaskCounts(userIds: number[], projectIds: number[]): Promise<Array<{ userId: number; n: number }>> {
  if (userIds.length === 0 || projectIds.length === 0) return [];
  const users_ = sql.join(userIds.map((id) => sql`${id}`), sql`, `);
  const projects_ = sql.join(projectIds.map((id) => sql`${id}`), sql`, `);
  const open = sql`coalesce(g.is_closed, false) = false and coalesce(g.is_review, false) = false`;
  const rows = await db.execute(sql`
    select v.user_id, count(distinct v.task_id)::int as n from (
      select t.assigned_to as user_id, t.id as task_id
        from tasks t left join tags g on g.id = t.status_tag_id
        where t.project_id in (${projects_}) and t.deleted_at is null and ${open}
          and t.assigned_to in (${users_})
      union all
      select t.created_by, t.id
        from tasks t left join tags g on g.id = t.status_tag_id
        where t.project_id in (${projects_}) and t.deleted_at is null and ${open}
          and t.is_private = true and t.created_by in (${users_})
      union all
      select pm.user_id, t.id
        from tasks t
        join task_roles tr on tr.task_id = t.id
        join project_members pm on pm.project_id = t.project_id and pm.role_tag_id = tr.role_tag_id
        left join tags g on g.id = t.status_tag_id
        where t.project_id in (${projects_}) and t.deleted_at is null and ${open}
          and t.is_private = false and t.assigned_to is null
          and (tr.claimed_by is null or tr.claimed_by = pm.user_id)
          and pm.user_id in (${users_})
    ) v group by v.user_id
  `) as unknown as Array<{ user_id: number; n: number }>;
  return rows.map((r) => ({ userId: Number(r.user_id), n: Number(r.n) }));
}

/* ------------------------------------------------------------------ *
 * نماها
 * ------------------------------------------------------------------ */

/**
 * کارت‌های «تیمِ تحتِ مدیریتِ شما» — پورتِ `team_overview_cards`.
 * ⚠️ عملیاتی، نه مالی: شمارِ پروژه، کارکنان، تسکِ باز، ریویو و کامنت.
 */
export async function teamOverview(actor: Actor) {
  const scope = await teamScope(actor);
  const empty = { projects: 0, members: scope.officeMembers.length, openTasks: 0, reviewTasks: 0, comments: 0 };
  if (scope.projectIds.length === 0) return empty;

  const [taskRows, threads] = await Promise.all([
    db.select({
      open: sql<number>`count(*) filter (where ${OPEN_TASK})::int`,
      review: sql<number>`count(*) filter (where coalesce(${tags.isReview}, false) = true)::int`,
    })
      .from(tasks)
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(inArray(tasks.projectId, scope.projectIds), isNull(tasks.deletedAt))),
    openCommentThreads(await nonFrozenIds(scope.projectIds)),
  ]);

  return {
    ...empty,
    projects: scope.projectIds.length,
    openTasks: taskRows[0]?.open ?? 0,
    reviewTasks: taskRows[0]?.review ?? 0,
    comments: threads.length,
  };
}

/**
 * پروژه‌های تیم — ستون‌های `managed_projects_table`: دفتر، تاریخِ ثبت، وضعیت،
 * شمارِ تسک، درصدِ پیشرفت و زمانِ کلِ کار. بی‌پول.
 */
export async function teamProjects(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return [];

  const [rows, totals, minutes] = await Promise.all([
    db.select({
      id: projects.id,
      title: projects.title,
      regDate: projects.regDate,
      deadline: projects.deadline,
      isArchived: projects.isArchived,
      officeName: officesTable.name,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
      statusColor: tags.color,
    })
      .from(projects)
      .leftJoin(tags, eq(tags.id, projects.statusTagId))
      .leftJoin(officesTable, eq(officesTable.id, projects.officeId))
      .where(inArray(projects.id, scope.projectIds))
      .orderBy(projects.title),
    taskTotalsFor(scope.projectIds),
    db.select({ projectId: timelogs.projectId, minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .where(inArray(timelogs.projectId, scope.projectIds))
      .groupBy(timelogs.projectId),
  ]);

  const totalOf = new Map(totals.map((r) => [r.projectId, r]));
  const minutesOf = new Map(minutes.map((r) => [r.projectId, r.minutes]));
  return rows.map((r) => ({
    ...r,
    // ⚠️ گروهِ خالیِ تگ یعنی «بی‌گروه» — null تا بردِ پروژه آن را فقط زیرِ «همه» بگذارد.
    statusGroup: r.statusGroup || null,
    taskTotal: totalOf.get(r.id)?.total ?? 0,
    progress: progressPercent(totalOf.get(r.id)?.done ?? 0, totalOf.get(r.id)?.total ?? 0),
    minutes: minutesOf.get(r.id) ?? 0,
  }));
}

/** شمارِ کل و انجام‌شدهٔ تسک‌ها — همان فرمولِ نوارِ پیشرفتِ کارتِ پروژه. */
async function taskTotalsFor(projectIds: number[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where coalesce(${tags.statusGroup}, '') = 'complete')::int`,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt)))
    .groupBy(tasks.projectId);
}

/** فیلترهای بردِ تسکِ تیم — همه از آدرس. */
export interface TeamTaskFilter {
  /** تگِ وضعیت (تبِ وضعیت). */
  statusTagId?: number | null;
  /** «عضو / نقش» — `parseAssignee`. */
  assignee?: AssigneeFilter | null;
  priorityTagId?: number | null;
  /** `overdue` | `today` | `week` | `none` */
  due?: string | null;
  /**
   * فقط تسک‌های باز (پیش‌فرض) — بردِ نسخهٔ قبلی فقط همین‌ها را داشت. خاموش
   * کردنش بسته‌ها و ریویوها را هم می‌آورد (پیش از این همیشه چنین بود).
   */
  openOnly?: boolean;
  page?: number;
  perPage?: number;
}

/**
 * بردِ تسک‌های تیم — ردیف‌ها، شمارِ کل و **تب‌های وضعیت با شمارش**.
 *
 * ⚠️ شمارِ تب‌ها درونِ فیلترهای دیگر است، نه روی کلِ دامنه (همان
 * `render_task_board`): «در حال انجام ۳» یعنی سه تسک با همین عضو/اولویت/ددلاین.
 * فیلتر روی **سرور** است — فیلترِ کلاینتی روی برشِ صفحه، نتیجهٔ گمراه‌کننده می‌داد.
 */
export async function teamTasks(actor: Actor, filter: TeamTaskFilter = {}) {
  const scope = await teamScope(actor);
  const perPage = perPageOf(filter.perPage);
  const none = { rows: [], forMember: null, total: 0, allCount: 0, statusCounts: [], page: 1, perPage, totalPages: 1 };
  if (scope.projectIds.length === 0) return none;

  const today = new Date().toISOString().slice(0, 10);
  const locale = await currentLocale();
  const base = [
    inArray(tasks.projectId, scope.projectIds),
    isNull(tasks.deletedAt),
    // پورتِ افزونه: مدیرِ دفتر مدیرِ پروژه است و تسکِ خصوصیِ پروژه‌های دفترش را هم می‌بیند.
    ...taskFilterConditions(filter, today),
  ];
  const withStatus = filter.statusTagId ? [...base, eq(tasks.statusTagId, filter.statusTagId)] : base;

  const [countRows, statusRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` })
      .from(tasks).leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(...withStatus)),
    db.select({
      id: tags.id, name: tagName(locale), color: tags.color, sortOrder: tags.sortOrder,
      n: sql<number>`count(*)::int`,
    })
      .from(tasks).innerJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(...base))
      .groupBy(tags.id)
      .orderBy(tags.sortOrder, tags.id),
  ]);
  const allRows = await db.select({ n: sql<number>`count(*)::int` })
    .from(tasks).leftJoin(tags, eq(tags.id, tasks.statusTagId)).where(and(...base));

  const total = countRows[0]?.n ?? 0;
  const page = pageOf(filter.page, total, perPage);
  const priority = alias(tags, 'priority_tag');
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assignedTo,
      assigneeName: users.name,
      statusName: tagName(locale),
      statusColor: tags.color,
      priorityName: tagName(locale, priority),
      priorityColor: priority.color,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .where(and(...withStatus))
    .orderBy(desc(tasks.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const roles = await roleNamesOfTasks(rows.map((r) => r.id));
  /**
   * نامِ عضوِ فیلترِ «کارهای این عضو» — انتخابگر بدونِ آن گزینه‌ای برای نشان‌دادن
   * نداشت. ⚠️ فقط برای کسی در دامنهٔ پایش؛ شناسهٔ دست‌کاری‌شده نامی لو نمی‌دهد.
   */
  const who = filter.assignee;
  const forMember = who?.kind === 'member' && canMonitor(who.id, scope.monitorable)
    ? (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, who.id)))[0] ?? null
    : null;
  return {
    rows: rows.map((r) => ({ ...r, roleNames: roles.get(r.id) ?? [] })),
    forMember,
    total,
    allCount: allRows[0]?.n ?? 0,
    statusCounts: statusRows.map(({ id, name, color, n }) => ({ id, name, color, n })),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** نقش‌های هر تسک — ستونِ «تخصیص» (`task_assignee_text`: نفر و/یا نقش‌ها). */
async function roleNamesOfTasks(taskIds: number[]): Promise<Map<number, string[]>> {
  if (taskIds.length === 0) return new Map();
  const roleTag = alias(tags, 'task_role_tag');
  const rows = await db
    .select({ taskId: taskRoles.taskId, name: tagName(await currentLocale(), roleTag) })
    .from(taskRoles)
    .innerJoin(roleTag, eq(roleTag.id, taskRoles.roleTagId))
    .where(inArray(taskRoles.taskId, taskIds))
    .orderBy(roleTag.sortOrder, roleTag.id);
  const out = new Map<number, string[]>();
  for (const r of rows) out.set(r.taskId, [...(out.get(r.taskId) ?? []), r.name]);
  return out;
}

/**
 * شرط‌های فیلتر به‌جز وضعیت — جدا، چون فهرست، شمارش و تب‌ها هر سه از آن
 * استفاده می‌کنند و دو کپی دیر یا زود واگرا می‌شد.
 * ⚠️ شرطِ «باز» به جدولِ `tags` ِ وضعیت نیاز دارد؛ هر پرس‌وجو باید آن را جوین کند.
 */
function taskFilterConditions(filter: TeamTaskFilter, today: string) {
  const out = [];
  if (filter.openOnly !== false) out.push(OPEN_TASK);
  if (filter.priorityTagId) out.push(eq(tasks.priorityTagId, filter.priorityTagId));

  const who = filter.assignee;
  // ⚠️ «بدونِ مسئول» یعنی بی‌نفر؛ تسکِ نقش‌محور هم بی‌نفر است و این‌جا می‌آید.
  if (who?.kind === 'none') out.push(isNull(tasks.assignedTo));
  else if (who?.kind === 'user') out.push(eq(tasks.assignedTo, who.id));
  else if (who?.kind === 'role') {
    out.push(sql`exists (select 1 from ${taskRoles} where ${taskRoles.taskId} = ${tasks.id} and ${taskRoles.roleTagId} = ${who.id})`);
  } else if (who?.kind === 'member') out.push(visibleToUserSql(who.id));

  if (filter.due === 'none') out.push(isNull(tasks.dueDate));
  else if (filter.due === 'overdue') out.push(lt(tasks.dueDate, today));
  else if (filter.due === 'today') out.push(eq(tasks.dueDate, today));
  else if (filter.due === 'week') {
    const week = new Date(`${today}T12:00:00Z`);
    week.setUTCDate(week.getUTCDate() + 7);
    out.push(gte(tasks.dueDate, today));
    out.push(lte(tasks.dueDate, week.toISOString().slice(0, 10)));
  }
  return out;
}

/**
 * رشته‌های کامنتِ باز — پورتِ `threads_for_projects` + وضعیتِ باز.
 * ⚠️ وضعیتِ رشته از **تازه‌ترین** پیام است (`openThreads`)؛ فهرستِ قبلی هر
 * ردیفِ «نیازمند بررسی» را جدا می‌آورد و یک گفت‌وگو چند بار دیده می‌شد.
 */
async function openCommentThreads(projectIds: number[]) {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      status: comments.status,
      body: comments.body,
      projectId: comments.projectId,
      userId: comments.userId,
      userName: users.name,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(and(
      inArray(comments.projectId, projectIds),
      eq(comments.type, 'comment'),
      isNull(comments.taskId),
    ))
    .orderBy(comments.id);
  return openThreads(rows);
}

/** کامنت‌های نیازمندِ بررسیِ تیم — آخرین پیامِ هر رشته، با پاسخِ سریع. */
export async function teamComments(actor: Actor) {
  const scope = await teamScope(actor);
  const ids = await nonFrozenIds(scope.projectIds);
  if (ids.length === 0) return [];

  const [threads, titles] = await Promise.all([
    openCommentThreads(ids),
    db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, ids)),
  ]);
  const titleOf = new Map(titles.map((p) => [p.id, p.title]));
  return threads
    .map(({ root, latest }) => ({
      /** ریشهٔ رشته — پاسخِ سریع زیرِ همین می‌نشیند. */
      rootId: root.id,
      id: latest.id,
      projectId: root.projectId!,
      projectTitle: titleOf.get(root.projectId!) ?? '',
      authorId: latest.userId,
      authorName: latest.userName,
      createdAt: latest.createdAt,
      // پورتِ `wp_trim_words( …, 30 )`.
      // کامنتِ فقط‌عکس متنی ندارد؛ نشانهٔ تصویر جایش می‌نشیند.
      excerpt: excerptWords(latest.body, 30) || '🖼',
    }))
    .sort((a, b) => b.id - a.id);
}

/**
 * همهٔ تسک‌های **نیازمندِ بررسی** در دفاترِ تحتِ مدیریت — بدونِ صفحه‌بندی و
 * بدونِ فیلترِ تبِ تسک‌ها (پورتِ `review_for_projects`).
 */
export async function teamReviewTasks(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return [];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      dueDate: tasks.dueDate,
      assigneeName: users.name,
      statusName: tagName(await currentLocale()),
      statusColor: tags.color,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .innerJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, scope.projectIds),
      isNull(tasks.deletedAt),
      // پورتِ افزونه: مدیرِ دفتر مدیرِ پروژه است و تسکِ خصوصیِ پروژه‌های دفترش را هم می‌بیند.
      eq(tags.isReview, true),
    ))
    .orderBy(desc(tasks.id));
  const roles = await roleNamesOfTasks(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, roleNames: roles.get(r.id) ?? [] }));
}

/**
 * اعضای تیم و ساعتِ کاریِ بازه.
 *
 * دو فهرستِ جدا، مثلِ نسخهٔ قبلی:
 *  - `members` — کارت‌های «کارکنانِ تحتِ مدیریت»: فقط اعضای **خودِ دفاتر**
 *    (`office_member_ids`)، با یا بی‌ساعت.
 *  - `hours` — جدول و نمودارِ «ساعتِ کاریِ تیم در این بازه»: هر کسی که روی
 *    پروژه‌های دفتر ساعت ثبت کرده (`member_hours_for_projects`)، حتی از دفترِ دیگر.
 * ⚠️ پیش از این کارت‌ها همهٔ دامنهٔ پایش را نشان می‌دادند و عضوِ دفترِ دیگری
 * که یک بار روی پروژه کار کرده بود «کارمندِ تحتِ مدیریت» دیده می‌شد.
 */
export async function teamMembers(actor: Actor, input: { range?: string; from?: string; to?: string }) {
  const scope = await teamScope(actor);
  const period = resolveRange(input, new Date());
  const system = await getSystemConfig();
  const order = weekOrder(system.weekStart);
  const empty = { members: [], hours: [], period, matrix: [], dayLabels: order.map((d) => WEEKDAYS[d]!) };

  if (scope.monitorable.length === 0) return empty;

  const conditions = [inArray(timelogs.userId, scope.monitorable)];
  conditions.push(scope.projectIds.length > 0 ? inArray(timelogs.projectId, scope.projectIds) : sql`false`);
  if (period.from) conditions.push(gte(timelogs.logDate, period.from));
  if (period.to) conditions.push(lte(timelogs.logDate, period.to));

  const today = new Date().toISOString().slice(0, 10);
  const locale = await currentLocale();
  const everyone = [...new Set([...scope.officeMembers, ...scope.monitorable])];
  const [people, hours, roleRows, leaveRows, openRows, avatars] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(inArray(users.id, everyone), isNull(users.deletedAt)))
      .orderBy(users.name),

    db.select({
      userId: timelogs.userId,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
      projects: sql<number>`count(distinct ${timelogs.projectId})::int`,
    })
      .from(timelogs)
      .where(and(...conditions))
      .groupBy(timelogs.userId),

    // پورتِ کارتِ افزونه: نقش‌ها، 🌴 مرخصیِ امروز، شمارِ تسکِ باز (نه بسته، نه در ریویو)، آواتار.
    db.select({ userId: tagRelations.objectId, name: tagName(locale) })
      .from(tagRelations)
      .innerJoin(tags, eq(tags.id, tagRelations.tagId))
      .where(and(eq(tagRelations.objectType, 'user'), inArray(tagRelations.objectId, scope.officeMembers.length > 0 ? scope.officeMembers : [0]), eq(tags.type, 'member_role')))
      .orderBy(tags.sortOrder, tags.id),
    db.select({ userId: absences.userId }).from(absences)
      .where(and(inArray(absences.userId, everyone), lte(absences.fromDate, today), gte(absences.toDate, today))),
    openTaskCounts(everyone, scope.projectIds),
    avatarsFor(scope.officeMembers),
  ]);

  const nameOf = new Map(people.map((p) => [p.id, p]));
  const byUser = new Map(hours.map((h) => [h.userId, h]));
  const rolesOf = new Map<number, string[]>();
  for (const r of roleRows) rolesOf.set(r.userId, [...(rolesOf.get(r.userId) ?? []), r.name]);
  const onLeave = new Set(leaveRows.map((r) => r.userId));
  const openOf = new Map(openRows.map((r) => [r.userId, r.n]));
  const officeSet = new Set(scope.officeMembers);
  const officePeople = people.filter((p) => officeSet.has(p.id));
  const matrixRows = await matrixForIds(officePeople.map((p) => ({ id: p.id, name: p.name })));
  const todayIdx = weekdayIndex(new Date());

  return {
    members: officePeople.map((p) => ({
      ...p,
      minutes: byUser.get(p.id)?.minutes ?? 0,
      projects: byUser.get(p.id)?.projects ?? 0,
      roleNames: rolesOf.get(p.id) ?? [],
      onLeave: onLeave.has(p.id),
      openTasks: openOf.get(p.id) ?? 0,
      avatarFileId: avatars.get(p.id) ?? null,
    })),
    // پرکارترین اول — نمودارِ میله‌ای از همین ترتیب می‌خواند.
    hours: hours
      .filter((h) => h.minutes > 0 && nameOf.has(h.userId))
      .map((h) => ({
        id: h.userId,
        name: nameOf.get(h.userId)!.name,
        email: nameOf.get(h.userId)!.email,
        projects: h.projects,
        minutes: h.minutes,
        openTasks: openOf.get(h.userId) ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    period,
    matrix: matrixRows.map((r) => ({ id: r.id, name: r.name, roles: r.roleNames, cells: rowCells(r, order, todayIdx) })),
    dayLabels: order.map((d) => WEEKDAYS[d]!),
  };
}


/**
 * پروفایلِ کاریِ یک عضو.
 * ⚠️ فقط کسی که داخلِ دامنهٔ پایش است — وگرنه مدیرِ دفتر می‌توانست با
 * دست‌کاریِ شناسه در آدرس، کارِ هر کسی در شرکت را ببیند.
 */
export async function teamMember(
  actor: Actor,
  userId: number,
  input: { range?: string; from?: string; to?: string },
) {
  const scope = await teamScope(actor);
  if (!canMonitor(userId, scope.monitorable)) throw new ForbiddenError('office.out_of_scope');

  const period = resolveRange(input, new Date());
  const conditions = [eq(timelogs.userId, userId)];
  if (scope.projectIds.length > 0) conditions.push(inArray(timelogs.projectId, scope.projectIds));
  if (period.from) conditions.push(gte(timelogs.logDate, period.from));
  if (period.to) conditions.push(lte(timelogs.logDate, period.to));

  const [person, logs, openTasks] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.id, userId)),

    db.select({
      projectId: timelogs.projectId,
      projectTitle: projects.title,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .leftJoin(projects, eq(projects.id, timelogs.projectId))
      .where(and(...conditions))
      .groupBy(timelogs.projectId, projects.title),

    scope.projectIds.length === 0 ? Promise.resolve([]) : db
      .select({ id: tasks.id, title: tasks.title, projectTitle: projects.title, dueDate: tasks.dueDate })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(
        // پورتِ `open_for_user_in_projects`: تسکِ نقشیِ او هم، نه فقط مستقیم.
        visibleToUserSql(userId),
        inArray(tasks.projectId, scope.projectIds),
        isNull(tasks.deletedAt),
        // ⚠️ فقط بازها — عنوانِ بخش «تسک‌های باز» است و پیش از این بسته‌ها را هم می‌آورد.
        OPEN_TASK,
      ))
      .orderBy(desc(tasks.id))
      .limit(100),
  ]);

  const me = person[0] ?? null;
  const locale = await currentLocale();
  const roleTag = alias(tags, 'role_tag');
  const notClosed = and(
    isNull(tasks.deletedAt),
    sql`coalesce(${tags.isClosed}, false) = false`,
    sql`coalesce(${tags.isReview}, false) = false`,
  );
  const [roleRows, memberships, hoursAll, matrixRows, system, absenceRows, canLeave, openByProject] = await Promise.all([
    db.select({ name: tagName(locale) }).from(tagRelations)
      .innerJoin(tags, eq(tags.id, tagRelations.tagId))
      .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, userId), eq(tags.type, 'member_role')))
      .orderBy(tags.sortOrder, tags.id),
    /**
     * عضویت‌های این نفر در پروژه‌های دامنه، با نقش و بسته/باز. ⚠️ بایگانی هم
     * شمرده می‌شود (`member_assigned_project_ids`) تا رقمِ کارتِ «پروژه‌ها» با
     * دریل‌داونش بخواند؛ «در حال اجرا» بایگانی را کنار می‌گذارد.
     */
    scope.projectIds.length === 0 ? Promise.resolve([]) : db
      .select({ id: projects.id, title: projects.title, isClosed: tags.isClosed, isArchived: projects.isArchived, roleName: tagName(locale, roleTag) })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .leftJoin(tags, eq(tags.id, projects.statusTagId))
      .leftJoin(roleTag, eq(roleTag.id, projectMembers.roleTagId))
      .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, scope.projectIds), isNull(projects.deletedAt)))
      .orderBy(projects.title),
    // کارکرد به تفکیکِ پروژه — همهٔ زمان، در دامنهٔ دفترها (پورتِ member_project_hours).
    db.select({ projectId: timelogs.projectId, projectTitle: projects.title, minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .leftJoin(projects, eq(projects.id, timelogs.projectId))
      .where(and(eq(timelogs.userId, userId), scope.projectIds.length > 0 ? inArray(timelogs.projectId, scope.projectIds) : sql`false`))
      .groupBy(timelogs.projectId, projects.title)
      .orderBy(sql`sum(${timelogs.minutes}) desc`),
    me ? matrixForIds([{ id: me.id, name: me.name }]) : Promise.resolve([]),
    getSystemConfig(),
    listAbsences(actor, userId, { upcomingOnly: true }).catch(() => []),
    canManageLeave(actor, userId),
    scope.projectIds.length === 0 ? Promise.resolve([]) : db
      .select({ projectId: tasks.projectId, n: sql<number>`count(*)::int` })
      .from(tasks)
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(visibleToUserSql(userId), inArray(tasks.projectId, scope.projectIds), notClosed))
      .groupBy(tasks.projectId),
  ]);

  const projectIds = [...new Set(memberships.map((m) => m.id))];
  const openIds = [...new Set(memberships.filter((m) => m.isClosed !== true && !m.isArchived).map((m) => m.id))];
  const progressRows = openIds.length === 0 ? [] : await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where coalesce(${tags.statusGroup}, '') = 'complete')::int`,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(inArray(tasks.projectId, openIds), isNull(tasks.deletedAt)))
    .groupBy(tasks.projectId);
  const progressOf = new Map(progressRows.map((r) => [r.projectId, r.total > 0 ? Math.round((r.done / r.total) * 100) : 0]));
  const minutesOf = new Map(hoursAll.map((h) => [h.projectId, h.minutes]));
  const openTasksOf = new Map(openByProject.map((r) => [r.projectId, r.n]));
  const rolesByProject = new Map<number, string[]>();
  for (const m of memberships) if (m.roleName) rolesByProject.set(m.id, [...(rolesByProject.get(m.id) ?? []), m.roleName]);

  const order = weekOrder(system.weekStart);
  const todayIdx = weekdayIndex(new Date());

  return {
    person: me ? { ...me, roleNames: roleRows.map((r) => r.name), avatarFileId: (await avatarsFor([me.id])).get(me.id) ?? null } : null,
    logs,
    openTasks,
    period,
    // پورتِ کارت‌های آمارِ افزونه.
    stats: {
      projects: projectIds.length,
      openProjects: openIds.length,
      minutes: hoursAll.reduce((sum, h) => sum + h.minutes, 0),
      openTasks: openByProject.reduce((sum, r) => sum + r.n, 0),
    },
    openProjects: openIds.map((id) => ({
      id,
      title: memberships.find((m) => m.id === id)?.title ?? `#${id}`,
      roles: rolesByProject.get(id) ?? [],
      progress: progressOf.get(id) ?? 0,
      minutes: minutesOf.get(id) ?? 0,
      openTasks: openTasksOf.get(id) ?? 0,
    })),
    hoursAllTime: hoursAll,
    matrix: matrixRows.map((r) => ({ id: r.id, name: r.name, roles: r.roleNames, cells: rowCells(r, order, todayIdx) })),
    dayLabels: order.map((d) => WEEKDAYS[d]!),
    absences: absenceRows,
    canLeave,
  };
}

export type { DateRange };

/**
 * همهٔ پروژه‌های یک عضو در دامنه — هر وضعیتی، بایگانی هم (پورتِ
 * `view_team_member_projects`؛ دریل‌داونِ کارتِ «پروژه‌ها» ی پروفایل). ستون‌ها
 * از دیدِ همین عضو: نقش‌هایش، ساعتِ خودش، تسک‌های بازِ خودش. بی‌پول.
 */
export async function teamMemberProjects(actor: Actor, userId: number) {
  const scope = await teamScope(actor);
  if (!canMonitor(userId, scope.monitorable)) throw new ForbiddenError('office.out_of_scope');

  const person = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)))[0] ?? null;
  if (scope.projectIds.length === 0) return { person, projects: [] };

  const locale = await currentLocale();
  const roleTag = alias(tags, 'role_tag');
  const memberships = await db
    .select({
      id: projects.id,
      title: projects.title,
      isArchived: projects.isArchived,
      statusName: tagName(locale),
      statusGroup: tags.statusGroup,
      statusColor: tags.color,
      roleName: tagName(locale, roleTag),
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .leftJoin(roleTag, eq(roleTag.id, projectMembers.roleTagId))
    .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, scope.projectIds), isNull(projects.deletedAt)))
    .orderBy(projects.title);

  const ids = [...new Set(memberships.map((m) => m.id))];
  if (ids.length === 0) return { person, projects: [] };

  const [totals, minutes, open] = await Promise.all([
    taskTotalsFor(ids),
    db.select({ projectId: timelogs.projectId, minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .where(and(eq(timelogs.userId, userId), inArray(timelogs.projectId, ids)))
      .groupBy(timelogs.projectId),
    db.select({ projectId: tasks.projectId, n: sql<number>`count(*)::int` })
      .from(tasks)
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(visibleToUserSql(userId), inArray(tasks.projectId, ids), isNull(tasks.deletedAt), OPEN_TASK))
      .groupBy(tasks.projectId),
  ]);
  const totalOf = new Map(totals.map((r) => [r.projectId, r]));
  const minutesOf = new Map(minutes.map((r) => [r.projectId, r.minutes]));
  const openOf = new Map(open.map((r) => [r.projectId, r.n]));

  return {
    person,
    projects: ids.map((id) => {
      const rows = memberships.filter((m) => m.id === id);
      const first = rows[0]!;
      return {
        id,
        title: first.title,
        isArchived: first.isArchived,
        statusName: first.statusName,
        statusGroup: first.statusGroup || null,
        statusColor: first.statusColor,
        roles: [...new Set(rows.map((r) => r.roleName).filter((n): n is string => Boolean(n)))],
        progress: progressPercent(totalOf.get(id)?.done ?? 0, totalOf.get(id)?.total ?? 0),
        minutes: minutesOf.get(id) ?? 0,
        openTasks: openOf.get(id) ?? 0,
      };
    }),
  };
}

/**
 * گزینه‌های فیلترِ بردِ تسک — اولویت‌ها، و عضوها و نقش‌هایی که **واقعاً** روی
 * تسک‌های دامنه هستند (`task_filter_options`).
 *
 * ⚠️ فهرستِ مسئول از خودِ تسک‌ها می‌آید، نه از کلِ اعضا: انتخابگری که ۵۰ نام
 * دارد و ۴۷تایشان هیچ تسکی ندارند، فیلتر را بی‌فایده می‌کند.
 */
export async function taskFilterOptions(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) {
    return { priorities: [], assignees: [], roles: [] };
  }

  const locale = await currentLocale();
  const inScope = and(inArray(tasks.projectId, scope.projectIds), isNull(tasks.deletedAt));
  const [priorities, assignees, roles] = await Promise.all([
    db.select({ id: tags.id, name: tagName(locale) })
      .from(tags)
      .where(eq(tags.type, 'task_priority'))
      .orderBy(tags.sortOrder, tags.id),

    db.selectDistinct({ id: users.id, name: users.name })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.assignedTo))
      .where(inScope)
      .orderBy(users.name),

    db.selectDistinct({ id: tags.id, name: tagName(locale), sortOrder: tags.sortOrder })
      .from(taskRoles)
      .innerJoin(tasks, eq(tasks.id, taskRoles.taskId))
      .innerJoin(tags, eq(tags.id, taskRoles.roleTagId))
      .where(inScope)
      .orderBy(tags.sortOrder, tags.id),
  ]);

  return { priorities, assignees, roles: roles.map(({ id, name }) => ({ id, name })) };
}
