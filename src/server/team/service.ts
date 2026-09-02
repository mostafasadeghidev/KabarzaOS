import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  comments, projectMembers, projects, tags, tasks, timelogs, userOffices, users, userRoles,
} from '@/db/schema';
import { type Actor } from '@/domain/access/permissions';
import { ForbiddenError, visibleScopes } from '@/domain/access/guard';
import {
  canMonitor, isOfficeManager, monitorableUserIds, resolveRange,
  type DateRange,
} from '@/domain/access/office-scope';

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
 * آیا این کاربر بخشِ «تیمِ من» را می‌بیند؟
 *
 * ⚠️ تنها شرط داشتنِ دفترِ تحتِ مدیریت است — مثلِ `is_office_manager()` ِ
 * نسخهٔ قبلی. اول مدیرانِ پروژه را استثنا کرده بودم، ولی آن‌وقت منو و خودِ صفحه
 * دو جواب می‌دادند: منو پنهان بود و آدرس باز می‌شد.
 */
export async function hasTeamScope(actor: Actor): Promise<boolean> {
  return isOfficeManager(await managedOfficeIds(actor.id));
}

async function assertTeamScope(actor: Actor): Promise<number[]> {
  const offices = await managedOfficeIds(actor.id);
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

/** اعضای دفاترِ تحتِ مدیریت. */
async function officeMemberIds(offices: number[]): Promise<number[]> {
  if (offices.length === 0) return [];
  // پورتِ `office_member_ids`: فقط دارندگانِ نقشِ **عضو** — نه کارفرما/حسابدار/خودِ مدیر که به دفتر وصل‌اند.
  const rows = await db
    .selectDistinct({ userId: userOffices.userId })
    .from(userOffices)
    .innerJoin(userRoles, and(eq(userRoles.userId, userOffices.userId), eq(userRoles.role, 'member')))
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
    monitorable: monitorableUserIds({ officeMemberIds: members, projectWorkerIds: workers }),
  };
}

/* ------------------------------------------------------------------ *
 * نماها
 * ------------------------------------------------------------------ */

/** پروژه‌های تیم. */
export async function teamProjects(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return [];

  return db
    .select({
      id: projects.id,
      title: projects.title,
      deadline: projects.deadline,
      isArchived: projects.isArchived,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(inArray(projects.id, scope.projectIds))
    .orderBy(projects.title);
}

/** تسک‌های بازِ تیم. */
export interface TeamTaskFilter {
  /** تگِ وضعیتِ تسک. */
  statusTagId?: number | null;
  /** شناسهٔ مسئول؛ `0` = بدونِ مسئول. */
  assigneeId?: number | null;
  priorityTagId?: number | null;
  /** `overdue` | `today` | `week` | `none` */
  due?: string | null;
  page?: number;
  perPage?: number;
}

export const TEAM_PER_PAGE = [25, 50, 100, 200] as const;

/**
 * تسک‌های تیم — با فیلترهای بردِ نسخهٔ قبلی.
 *
 * ⚠️ فیلتر روی **سرور** است، نه در جدولِ کلاینت: دامنهٔ دفتر همین‌جا اعمال
 * می‌شود و فیلترِ کلاینتی روی ۳۰۰ ردیفِ بریده، نتیجهٔ گمراه‌کننده می‌داد —
 * کاربر فکر می‌کرد چیزی نیست در حالی که فقط بیرونِ برش بود.
 */
export async function teamTasks(actor: Actor, filter: TeamTaskFilter = {}) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const conditions = taskFilterConditions(filter, today);
  const perPage = TEAM_PER_PAGE.includes(filter.perPage as 25)
    ? (filter.perPage as number)
    : 50;
  const page = Math.max(1, Math.trunc(filter.page ?? 1) || 1);

  const assignee = users;
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      dueDate: tasks.dueDate,
      assigneeName: assignee.name,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
      isReview: tags.isReview,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, scope.projectIds),
      isNull(tasks.deletedAt),
      // پورتِ افزونه: مدیرِ دفتر مدیرِ پروژه است و تسکِ خصوصیِ پروژه‌های دفترش را هم می‌بیند.
      ...conditions,
    ))
    .orderBy(desc(tasks.id))
    .limit(perPage)
    .offset((page - 1) * perPage);
}

/** شمارِ کلِ تسک‌های تیم با همان فیلتر — برای صفحه‌بندی. */
export async function teamTaskCount(actor: Actor, filter: TeamTaskFilter = {}) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return 0;

  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(
      inArray(tasks.projectId, scope.projectIds),
      isNull(tasks.deletedAt),
      // پورتِ افزونه: مدیرِ دفتر مدیرِ پروژه است و تسکِ خصوصیِ پروژه‌های دفترش را هم می‌بیند.
      ...taskFilterConditions(filter, new Date().toISOString().slice(0, 10)),
    ));
  return rows[0]?.n ?? 0;
}

/**
 * شرط‌های فیلتر — جدا، چون هم فهرست و هم شمارش از آن استفاده می‌کنند و دو
 * کپی دیر یا زود واگرا می‌شد (شمارشی که با فهرست نخواند بدتر از نبودنش است).
 */
function taskFilterConditions(filter: TeamTaskFilter, today: string) {
  const out = [];
  if (filter.statusTagId) out.push(eq(tasks.statusTagId, filter.statusTagId));
  if (filter.priorityTagId) out.push(eq(tasks.priorityTagId, filter.priorityTagId));

  // ⚠️ صفر یعنی «بدونِ مسئول»، نه «همه» — این تفاوت را UI هم باید بداند.
  if (filter.assigneeId === 0) out.push(isNull(tasks.assignedTo));
  else if (filter.assigneeId) out.push(eq(tasks.assignedTo, filter.assigneeId));

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

/** کامنت‌های بازِ تیم — صفِ بازبینی. */
export async function teamComments(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return [];

  return db
    .select({
      id: comments.id,
      body: comments.body,
      type: comments.type,
      status: comments.status,
      projectId: comments.projectId,
      projectTitle: projects.title,
      authorName: users.name,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(projects, eq(projects.id, comments.projectId))
    .leftJoin(users, eq(users.id, comments.userId))
    .where(and(
      inArray(comments.projectId, scope.projectIds),
      // ⚠️ فقط رشته‌های **کامنت** و فقط بازها — کامنت با `needs_review` نوشته
      // می‌شود؛ با `open` این فهرست همیشه خالی بود.
      eq(comments.type, 'comment'),
      eq(comments.status, 'needs_review'),
    ))
    .orderBy(desc(comments.id))
    .limit(200);
}

/**
 * همهٔ تسک‌های **نیازمندِ بررسی** در دفاترِ تحتِ مدیریت — بدونِ صفحه‌بندی و
 * بدونِ فیلترِ تبِ تسک‌ها.
 *
 * ⚠️ پیش از این فهرستِ بازبینی از صفحهٔ فعلیِ فیلترِ فعلیِ تبِ تسک‌ها ساخته
 * می‌شد: با هر فیلتر یا صفحه عوض می‌شد و هیچ‌وقت کامل نبود.
 */
export async function teamReviewTasks(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) return [];
  const assignee = users;
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      dueDate: tasks.dueDate,
      assigneeName: assignee.name,
      statusName: tagName(await currentLocale()),
      isReview: tags.isReview,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .innerJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, scope.projectIds),
      isNull(tasks.deletedAt),
      // پورتِ افزونه: مدیرِ دفتر مدیرِ پروژه است و تسکِ خصوصیِ پروژه‌های دفترش را هم می‌بیند.
      eq(tags.isReview, true),
    ))
    .orderBy(desc(tasks.id));
}

/** اعضای تیم با جمعِ ساعتِ کاریِ بازه. */
export async function teamMembers(actor: Actor, input: { range?: string; from?: string; to?: string }) {
  const scope = await teamScope(actor);
  const period = resolveRange(input, new Date());

  if (scope.monitorable.length === 0) return { members: [], period };

  const conditions = [inArray(timelogs.userId, scope.monitorable)];
  if (scope.projectIds.length > 0) conditions.push(inArray(timelogs.projectId, scope.projectIds));
  if (period.from) conditions.push(gte(timelogs.logDate, period.from));
  if (period.to) conditions.push(lte(timelogs.logDate, period.to));

  const [people, hours] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(inArray(users.id, scope.monitorable), isNull(users.deletedAt)))
      .orderBy(users.name),

    db.select({
      userId: timelogs.userId,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .where(and(...conditions))
      .groupBy(timelogs.userId),
  ]);

  const byUser = new Map(hours.map((h) => [h.userId, h.minutes]));
  return {
    members: people.map((p) => ({ ...p, minutes: byUser.get(p.id) ?? 0 })),
    period,
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
        eq(tasks.assignedTo, userId),
        inArray(tasks.projectId, scope.projectIds),
        isNull(tasks.deletedAt),
        // پورتِ افزونه: مدیرِ دفتر مدیرِ پروژه است و تسکِ خصوصیِ پروژه‌های دفترش را هم می‌بیند.
      ))
      .limit(100),
  ]);

  return { person: person[0] ?? null, logs, openTasks, period };
}

export type { DateRange };

/**
 * گزینه‌های فیلترِ بردِ تسک — وضعیت، اولویت، و مسئول‌هایی که **واقعاً** روی
 * تسک‌های دامنه هستند.
 *
 * ⚠️ فهرستِ مسئول از خودِ تسک‌ها می‌آید، نه از کلِ اعضا: انتخابگری که ۵۰ نام
 * دارد و ۴۷تایشان هیچ تسکی ندارند، فیلتر را بی‌فایده می‌کند.
 */
export async function taskFilterOptions(actor: Actor) {
  const scope = await teamScope(actor);
  if (scope.projectIds.length === 0) {
    return { statuses: [], priorities: [], assignees: [] };
  }

  const assignee = users;
  const [statuses, priorities, assignees] = await Promise.all([
    db.selectDistinct({ id: tags.id, name: tagName(await currentLocale()) })
      .from(tasks)
      .innerJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(inArray(tasks.projectId, scope.projectIds), isNull(tasks.deletedAt)))
      .orderBy(tags.id),

    db.selectDistinct({ id: tags.id, name: tagName(await currentLocale()) })
      .from(tasks)
      .innerJoin(tags, eq(tags.id, tasks.priorityTagId))
      .where(and(inArray(tasks.projectId, scope.projectIds), isNull(tasks.deletedAt)))
      .orderBy(tags.id),

    db.selectDistinct({ id: assignee.id, name: assignee.name })
      .from(tasks)
      .innerJoin(assignee, eq(assignee.id, tasks.assignedTo))
      .where(and(inArray(tasks.projectId, scope.projectIds), isNull(tasks.deletedAt)))
      .orderBy(assignee.name),
  ]);

  return { statuses, priorities, assignees };
}
