import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  projects, projectMembers, projectClients, tasks, taskRoles,
  timelogs, ledger, projectPayments, paymentRequests, users, tags,
  currencies, offices, tagRelations, userRoles, comments, tenderBids,
  projectQa, qaItems, attachments, files,
} from '@/db/schema';
import type { ProjectImpact } from '@/domain/projects/lifecycle';

/**
 * لایهٔ داده — فقط خواندن و نوشتن، بدونِ قاعدهٔ کسب‌وکار.
 *
 * ⚠️ R-PERF-01 — هیچ کوئری‌ای داخلِ حلقه نیست. برای هر فهرست، تعدادِ کوئری
 * **ثابت** است، نه وابسته به تعدادِ ردیف. نسخهٔ قبلی یک ریفکتورِ کامل برای همین لازم داشت.
 */

export interface ProjectListRow {
  id: number;
  title: string;
  price: string;
  currencyId: number | null;
  statusTagId: number | null;
  statusName: string | null;
  statusGroup: string | null;
  statusColor: string | null;
  deadline: string | null;
  /** تصویرِ شاخص؛ null ← تک‌نگار نشان داده می‌شود. */
  thumbnailFileId: number | null;
  /** پروژهٔ سبک‌شده — خلاصه‌اش منجمد شده (R-PROJ-07). */
  isLightened: boolean;
  /** جمعِ هزینه‌های قابلِ‌صورتحساب؛ «مبلغ»ِ کارت = price + این. */
  billableExpenses: string;
  isArchived: boolean;
  isTender: boolean;
  scope: 'company' | 'private';
  memberCount: number;
  openTaskCount: number;
  /** تسکِ نیازمندِ ریویو — پایهٔ تبِ «نیازمند بررسی». */
  reviewCount: number;
  /** ددلاین گذشته و پروژه تمام‌نشده — پایهٔ تبِ «گذشته از ددلاین». */
  isOverdue: boolean;
  /** تاریخِ ثبت — مبدأ نوارِ ددلاین. */
  regDate: string | null;
  /** کامنت‌های نیازمندِ بررسی — شمارندهٔ دومِ کارت. */
  commentReviewCount: number;
  /** تسک‌های انجام‌شده و کل — نوارِ پیشرفت. */
  doneTaskCount: number;
  totalTaskCount: number;
  /** پیشنهادهای مناقصه — کنارِ نشانِ «مناقصه». */
  bidCount: number;
  /** والد و فرزندان — پیوندهای بالای کارت. */
  parentId: number | null;
  parentTitle: string | null;
  children: Array<{ id: number; title: string }>;
  /** چیپ‌های تیم و کارفرما. */
  members: Array<{ name: string; roleName: string | null }>;
  clients: string[];
}

/** فهرستِ پروژه‌ها — سه کوئریِ ثابت، مستقل از تعدادِ پروژه. */
export async function listProjects(
  scopes: Array<'company' | 'private'>,
  /** فقط این پروژه‌ها — مسیرِ عضویتیِ عضو/کارفرما. خالی یعنی هیچ. */
  onlyIds?: number[],
): Promise<ProjectListRow[]> {
  if (onlyIds !== undefined && onlyIds.length === 0) return [];
  // ۱) خودِ پروژه‌ها به‌همراهِ تگِ وضعیت.
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      price: projects.price,
      currencyId: projects.currencyId,
      statusTagId: projects.statusTagId,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
      statusColor: tags.color,
      deadline: projects.deadline,
      thumbnailFileId: projects.thumbnailFileId,
      lightenSummary: projects.lightenSummary,
      isArchived: projects.isArchived,
      isTender: projects.isTender,
      scope: projects.scope,
      regDate: projects.regDate,
      parentId: projects.parentId,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(
      isNull(projects.deletedAt),
      inArray(projects.scope, scopes),
      ...(onlyIds !== undefined ? [inArray(projects.id, onlyIds)] : []),
    ))
    .orderBy(projects.id);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // ۲) شمارشِ اعضا — یک کوئری برای همهٔ پروژه‌ها.
  const memberCounts = await db
    .select({ projectId: projectMembers.projectId, count: sql<number>`count(*)::int` })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, ids))
    .groupBy(projectMembers.projectId);

  // ۳) شمارشِ تسکِ باز — گروهِ وضعیت، نه نام (R-PROJ-16).
  const taskCounts = await db
    .select({ projectId: tasks.projectId, count: sql<number>`count(*)::int` })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, ids),
      isNull(tasks.deletedAt),
      sql`coalesce(${tags.statusGroup}, '') <> 'complete'`,
    ))
    .groupBy(tasks.projectId);

  // ۴) تسک‌های نیازمندِ ریویو — یک کوئریِ گروهی.
  const reviewCounts = await db
    .select({ projectId: tasks.projectId, count: sql<number>`count(*)::int` })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt), eq(tags.isReview, true)))
    .groupBy(tasks.projectId);

  // ۵) کلِ تسک‌ها و انجام‌شده‌ها — نوارِ پیشرفتِ کارت.
  const taskTotals = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where coalesce(${tags.statusGroup}, '') = 'complete')::int`,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt)))
    .groupBy(tasks.projectId);

  // ۶) کامنت‌های نیازمندِ بررسی — نوعِ `comment` با وضعیتِ `needs_review`
  // (؛ ریویو و یادداشتِ تسک شمرده نمی‌شوند).
  const commentReviews = await db
    .select({ projectId: comments.projectId, count: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(
      inArray(comments.projectId, ids),
      eq(comments.type, 'comment'),
      eq(comments.status, 'needs_review'),
    ))
    .groupBy(comments.projectId);

  // ۷) پیشنهادهای مناقصه.
  const bids = await db
    .select({ projectId: tenderBids.projectId, count: sql<number>`count(*)::int` })
    .from(tenderBids)
    .where(inArray(tenderBids.projectId, ids))
    .groupBy(tenderBids.projectId);

  // ۸) چیپ‌های اعضا — نام · نقش.
  const memberChips = await db
    .select({
      projectId: projectMembers.projectId,
      name: users.name,
      roleName: tagName(await currentLocale()),
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
    .where(inArray(projectMembers.projectId, ids));

  // ۹) هزینه‌های **قابلِ‌صورتحساب**.
  //
  // ⚠️ «مبلغ»ِ کارت = قیمت + هزینه‌های قابلِ‌صورتحساب ( ←
  // `total_due`)، نه قیمتِ تنها. نسخهٔ قبلی عمداً همین را نشان می‌دهد چون کارفرما
  // جمعِ این دو را بدهکار است. جهتِ `project_expense` یعنی قابلِ‌صورتحساب؛
  // هزینهٔ جذب‌شده جهتِ `project_cost` می‌گیرد و اینجا نمی‌آید.
  const expenseRows = await db
    .select({
      projectId: projectPayments.projectId,
      total: sql<string>`coalesce(sum(coalesce(${projectPayments.amountSettled}, ${projectPayments.amount})), 0)::text`,
    })
    .from(projectPayments)
    .where(
      and(
        inArray(projectPayments.projectId, ids),
        eq(projectPayments.direction, 'project_expense'),
      ),
    )
    .groupBy(projectPayments.projectId);

  // ۱۰) چیپ‌های کارفرما.
  const clientChips = await db
    .select({ projectId: projectClients.projectId, name: users.name })
    .from(projectClients)
    .innerJoin(users, eq(users.id, projectClients.userId))
    .where(inArray(projectClients.projectId, ids));

  const members = new Map(memberCounts.map((r) => [r.projectId, r.count]));
  const openTasks = new Map(taskCounts.map((r) => [r.projectId, r.count]));
  const reviews = new Map(reviewCounts.map((r) => [r.projectId, r.count]));
  const totals = new Map(taskTotals.map((r) => [r.projectId, r]));
  const commentReviews2 = new Map(commentReviews.map((r) => [r.projectId, r.count]));
  const bidCounts = new Map(bids.map((r) => [r.projectId, r.count]));
  const expenses = new Map(expenseRows.map((r) => [r.projectId, r.total]));
  const titleOf = new Map(rows.map((r) => [r.id, r.title]));

  const chipsByProject = new Map<number, Array<{ name: string; roleName: string | null }>>();
  for (const c of memberChips) {
    const list = chipsByProject.get(c.projectId) ?? [];
    list.push({ name: c.name, roleName: c.roleName });
    chipsByProject.set(c.projectId, list);
  }
  const clientsByProject = new Map<number, string[]>();
  for (const c of clientChips) {
    const list = clientsByProject.get(c.projectId) ?? [];
    list.push(c.name);
    clientsByProject.set(c.projectId, list);
  }
  // فرزندان از خودِ همین ردیف‌ها ساخته می‌شوند — بدونِ کوئریِ اضافه.
  const kidsByParent = new Map<number, Array<{ id: number; title: string }>>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const list = kidsByParent.get(r.parentId) ?? [];
    list.push({ id: r.id, title: r.title });
    kidsByParent.set(r.parentId, list);
  }

  const today = new Date().toISOString().slice(0, 10);

  return rows.map((r) => ({
    ...r,
    scope: r.scope as 'company' | 'private',
    // خلاصهٔ منجمد یعنی پروژه سبک شده.
    isLightened: r.lightenSummary !== null,
    memberCount: members.get(r.id) ?? 0,
    openTaskCount: openTasks.get(r.id) ?? 0,
    reviewCount: reviews.get(r.id) ?? 0,
    commentReviewCount: commentReviews2.get(r.id) ?? 0,
    doneTaskCount: totals.get(r.id)?.done ?? 0,
    totalTaskCount: totals.get(r.id)?.total ?? 0,
    bidCount: bidCounts.get(r.id) ?? 0,
    billableExpenses: expenses.get(r.id) ?? '0',
    parentTitle: r.parentId !== null ? (titleOf.get(r.parentId) ?? null) : null,
    children: kidsByParent.get(r.id) ?? [],
    members: chipsByProject.get(r.id) ?? [],
    clients: clientsByProject.get(r.id) ?? [],
    // همان تعریفِ داشبورد: ددلاینِ گذشته و پروژه تمام‌نشده.
    isOverdue: Boolean(r.deadline && r.deadline < today && r.statusGroup !== 'completed'),
  }));
}

export async function getProject(id: number) {
  const rows = await db.select().from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  return rows[0] ?? null;
}

export async function listMembers(projectId: number) {
  return db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      roleTagId: projectMembers.roleTagId,
      agreedAmount: projectMembers.agreedAmount,
      unitRate: projectMembers.unitRate,
      currencyId: projectMembers.currencyId,
      userName: users.name,
      roleName: tagName(await currentLocale()),
      /** دسترسیِ این نفر به این پروژه قطع است؟ (`setProjectAccess`) */
      accessBlocked: projectMembers.accessBlocked,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
    .where(eq(projectMembers.projectId, projectId));
}

/** کاربرانِ غیرفعال — لازمِ diff اعضا (R-PROJ-11). */
export async function inactiveUserIds(): Promise<Set<number>> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(sql`${users.memberState} <> 'active' or ${users.deletedAt} is not null`);
  return new Set(rows.map((r) => r.id));
}

/**
 * دادهٔ لازم برای تصمیمِ حذف (R-PROJ-01).
 * شمارش‌ها یک‌جا گرفته می‌شوند؛ وضعیتِ «ماندهٔ باز» را دامنه تعیین می‌کند.
 */
export async function projectImpact(
  projectId: number,
  balances: { clientPartiallyPaid: boolean; memberPartiallyPaid: boolean },
): Promise<ProjectImpact> {
  const [ledgerRows, paymentRows, timelogRows, openRequests] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(ledger).where(eq(ledger.projectId, projectId)),
    db.select({ n: sql<number>`count(*)::int` }).from(projectPayments).where(eq(projectPayments.projectId, projectId)),
    db.select({ n: sql<number>`count(*)::int` }).from(timelogs).where(eq(timelogs.projectId, projectId)),
    db.select({ n: sql<number>`count(*)::int` }).from(paymentRequests)
      .where(and(eq(paymentRequests.projectId, projectId), inArray(paymentRequests.status, ['pending', 'approved']))),
  ]);

  return {
    ledgerRows: ledgerRows[0]?.n ?? 0,
    paymentRows: paymentRows[0]?.n ?? 0,
    timelogRows: timelogRows[0]?.n ?? 0,
    openRequests: openRequests[0]?.n ?? 0,
    ...balances,
  };
}

export interface TaskRow {
  id: number;
  title: string;
  /** شناسهٔ تگِ وضعیت — تا منوی تغییرِ وضعیت گزینهٔ فعلی را تیک بزند. */
  statusTagId: number | null;
  statusName: string | null;
  statusGroup: string | null;
  statusColor: string | null;
  /** R-PROJ-13 — «نیاز به ریویو» پرچمِ خودِ تگ است، نه نامش. */
  isReview: boolean | null;
  dueDate: string | null;
  isPrivate: boolean;
  createdBy: number | null;
  assignedTo: number | null;
  assigneeName: string | null;
}

/** تسک‌های یک پروژه — دو کوئریِ ثابت (R-PERF-01). */
export async function listTasks(projectId: number): Promise<TaskRow[]> {
  const assignee = alias(users, 'assignee');
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      statusTagId: tasks.statusTagId,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
      statusColor: tags.color,
      /** R-PROJ-13 — «نیاز به ریویو» پرچمِ خودِ تگ است، نه نامش. */
      isReview: tags.isReview,
      dueDate: tasks.dueDate,
      isPrivate: tasks.isPrivate,
      createdBy: tasks.createdBy,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(tasks.id);
}

/** نقش‌های هر تسک — یک کوئری برای همهٔ تسک‌های پروژه. */
export async function taskRolesFor(taskIds: number[]) {
  if (taskIds.length === 0) return [];
  const claimer = alias(users, 'claimer');
  return db
    .select({
      taskId: taskRoles.taskId,
      roleTagId: taskRoles.roleTagId,
      roleName: tagName(await currentLocale()),
      claimedBy: taskRoles.claimedBy,
      claimedByName: claimer.name,
    })
    .from(taskRoles)
    .leftJoin(tags, eq(tags.id, taskRoles.roleTagId))
    .leftJoin(claimer, eq(claimer.id, taskRoles.claimedBy))
    .where(inArray(taskRoles.taskId, taskIds));
}

export { projects, projectMembers, projectClients, tasks, taskRoles };

/* ------------------------------------------------------------------ *
 * گزینه‌های فرم — هر کدام یک کوئریِ ساده.
 * ------------------------------------------------------------------ */

export async function statusTags() {
  return db
    .select({
      id: tags.id,
      name: tagName(await currentLocale()),
      group: tags.statusGroup,
      // رنگ: نقطهٔ کنارِ گزینه، تا سرگروه با آیتم اشتباه نشود (`kteam-dot`).
      color: tags.color,
    })
    .from(tags)
    .where(eq(tags.type, 'project_status'))
    .orderBy(tags.sortOrder, tags.id);
}

export async function currencyOptions() {
  return db
    .select({ id: currencies.id, code: currencies.code, isDefault: currencies.isDefault })
    .from(currencies)
    .where(eq(currencies.isActive, true))
    .orderBy(currencies.id);
}

export async function officeOptions() {
  return db
    .select({ id: offices.id, name: offices.name })
    .from(offices)
    .where(eq(offices.isActive, true))
    .orderBy(offices.name);
}

/**
 * پروژه‌هایی که می‌توانند والد باشند — R-PROJ-20: خودشان زیرپروژه نباشند.
 * در حالتِ ویرایش، خودِ پروژه و فرزندانش هم کنار گذاشته می‌شوند تا حلقه ساخته نشود.
 */
export async function parentOptions(scopes: Array<'company' | 'private'>, excludeId?: number) {
  const rows = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(isNull(projects.deletedAt), isNull(projects.parentId), inArray(projects.scope, scopes)))
    .orderBy(projects.title);

  if (!excludeId) return rows;

  const children = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.parentId, excludeId), isNull(projects.deletedAt)));
  const blocked = new Set([excludeId, ...children.map((c) => c.id)]);
  return rows.filter((r) => !blocked.has(r.id));
}

/**
 * نقشِ اصلیِ هر کاربر — اولین تگِ `member_role` که دارد (R-PROJ-10).
 * یک کوئری برای همهٔ کاربران، نه یکی به‌ازای هر ردیف (R-PERF-01).
 */
export async function primaryRoleOf(userIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (userIds.length === 0) return out;

  const rows = await db
    .select({ userId: tagRelations.objectId, tagId: tags.id })
    .from(tagRelations)
    .innerJoin(tags, eq(tags.id, tagRelations.tagId))
    .where(and(
      eq(tagRelations.objectType, 'user'),
      inArray(tagRelations.objectId, userIds),
      eq(tags.type, 'member_role'),
    ))
    .orderBy(tags.sortOrder, tags.id);

  for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, r.tagId);
  return out;
}

/**
 * ⚠️ کاربرانی که روی این پروژه هنوز طلب دارند (توافقی > پرداخت‌شده) — R-PROJ-23.
 * جمعِ پرداخت‌ها با `amount_settled` (اگر باشد) گرفته می‌شود، چون آنچه واقعاً
 * تسویه شد بر مبلغِ اسمی مقدم است (R-TEAM-01).
 */
export async function owedUserIds(projectId: number): Promise<Set<number>> {
  const rows = await db.execute(sql`
    select m.user_id
    from project_members m
    left join (
      select user_id, sum(coalesce(amount_settled, amount)) as paid
      from project_payments
      where project_id = ${projectId} and direction = 'member_payout'
      group by user_id
    ) p on p.user_id = m.user_id
    where m.project_id = ${projectId}
    group by m.user_id, p.paid
    having sum(m.agreed_amount) - coalesce(p.paid, 0) > 0.0001
  `);
  return new Set((rows as unknown as Array<{ user_id: number }>).map((r) => Number(r.user_id)));
}

/**
 * نقش‌های خودِ کاربر روی هر پروژه — `projectId → نامِ نقش‌ها`.
 * ستونِ «نقشِ شما» ِ داشبوردِ عضو (`Projects::user_role_names`).
 */
export async function myRolesOn(
  userId: number,
  projectIds: number[],
): Promise<Map<number, string[]>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: projectMembers.projectId, roleName: tagName(await currentLocale()) })
    .from(projectMembers)
    .leftJoin(tags, eq(tags.id, projectMembers.roleTagId))
    .where(and(
      eq(projectMembers.userId, userId),
      inArray(projectMembers.projectId, projectIds),
    ));

  const out = new Map<number, string[]>();
  for (const r of rows) {
    if (!r.roleName) continue;
    const list = out.get(r.projectId) ?? [];
    if (!list.includes(r.roleName)) list.push(r.roleName);
    out.set(r.projectId, list);
  }
  return out;
}

/**
 * از میانِ این پروژه‌ها، کدام‌ها را این کاربر **کارفرماست**.
 *
 * ⚠️ محدود به فهرستِ داده‌شده، تا برای کارفرمای صد پروژه هم کوئری کوچک
 * بماند. پایهٔ ماسکِ قیمت در `listProjects`.
 */
export async function clientProjectIds(
  userId: number,
  projectIds: number[],
): Promise<Set<number>> {
  if (projectIds.length === 0) return new Set();
  const rows = await db
    .select({ projectId: projectClients.projectId })
    .from(projectClients)
    .where(and(
      eq(projectClients.userId, userId),
      inArray(projectClients.projectId, projectIds),
    ));
  return new Set(rows.map((r) => r.projectId));
}

/** کاربرانی که می‌توانند عضوِ پروژه شوند — فعال و با نقشِ `member`. */
export async function memberCandidates() {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.memberState, 'active'), isNull(users.deletedAt), eq(userRoles.role, 'member')))
    .orderBy(users.name);
}

/**
 * نقش‌های امضاشده روی هر عضو — `{ userId: tagId[] }`.
 *
 * ⚠️ فرمِ افزودنِ عضو به پروژه باید فقط نقش‌های **خودِ آن فرد** را نشان
 * دهد. بدونِ این، فهرست همهٔ نقش‌های سامانه را می‌داد و می‌شد کسی را با
 * نقشی روی پروژه امضا کرد که اصلاً آن نقش را ندارد.
 */
export async function memberRoleMap(): Promise<Record<number, number[]>> {
  const rows = await db
    .select({ userId: tagRelations.objectId, tagId: tagRelations.tagId })
    .from(tagRelations)
    .innerJoin(tags, eq(tags.id, tagRelations.tagId))
    .where(and(eq(tagRelations.objectType, 'user'), eq(tags.type, 'member_role')));

  const out: Record<number, number[]> = {};
  for (const r of rows) (out[r.userId] ??= []).push(r.tagId);
  return out;
}

/** تگ‌های نقشِ عضو — ستونِ «نقش» در فرمِ اعضا. */
export async function memberRoleTags() {
  return db
    .select({ id: tags.id, name: tagName(await currentLocale()) })
    .from(tags)
    .where(eq(tags.type, 'member_role'))
    .orderBy(tags.sortOrder, tags.id);
}

/** تعدادِ زیرپروژه‌ها — R-PROJ-20: والد نمی‌تواند خودش فرزند شود. */
export async function childCount(projectId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.parentId, projectId), isNull(projects.deletedAt)));
  return rows[0]?.n ?? 0;
}

/** یک تگ با شناسه — برای اعتبارسنجیِ نوع پیش از نوشتن. */
export async function getTag(id: number) {
  const rows = await db.select({ id: tags.id, type: tags.type, name: tagName(await currentLocale()) })
    .from(tags).where(eq(tags.id, id));
  return rows[0] ?? null;
}

/**
 * آیا این تگِ وضعیت، حالتِ «نیاز به بررسی» است؟
 *
 * ⚠️ از ستونِ `is_review` خوانده می‌شود، نه از نامِ تگ (R-PROJ-16): نامِ
 * فارسیِ تگ قابلِ ویرایش است و منطق نباید به آن بند باشد.
 */
export async function isReviewTag(id: number): Promise<boolean> {
  const rows = await db.select({ isReview: tags.isReview })
    .from(tags).where(eq(tags.id, id));
  return rows[0]?.isReview === true;
}

/** شناسهٔ کارفرمایانِ پروژه. */
export async function listClientIds(projectId: number): Promise<Set<number>> {
  const rows = await db.select({ userId: projectClients.userId })
    .from(projectClients).where(eq(projectClients.projectId, projectId));
  return new Set(rows.map((r) => r.userId));
}

/** کاربرانِ فعالی که نقشِ `client` دارند — فهرستِ افزودنِ سریعِ کارفرما. */
export async function clientCandidates() {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.memberState, 'active'), isNull(users.deletedAt), eq(userRoles.role, 'client')))
    .orderBy(users.name);
}

/* ------------------------------------------------------------------ *
 * تب‌های صفحهٔ پروژه.
 * ------------------------------------------------------------------ */

/** کامنت‌های پروژه — همراهِ نامِ نویسنده و کسی که بست (R-PROJ ِ «انجام شد توسط»). */
export async function listComments(projectId: number) {
  const closer = alias(users, 'closer');
  return db
    .select({
      id: comments.id,
      body: comments.body,
      type: comments.type,
      status: comments.status,
      createdAt: comments.createdAt,
      // ⚠️ شناسه لازم است تا نام سمتِ سرور ماسک شود (viewer-names).
      userId: comments.userId,
      userName: users.name,
      closedAt: comments.closedAt,
      closedBy: comments.closedBy,
      closedByName: closer.name,
      taskId: comments.taskId,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .leftJoin(closer, eq(closer.id, comments.closedBy))
    .where(and(eq(comments.projectId, projectId), isNull(comments.taskId)))
    .orderBy(comments.id);
}

/** خلاصهٔ مالیِ پروژه — دریافتی از کارفرما، پرداختی به اعضا، هزینه‌ها. */
export async function financeSummary(projectId: number) {
  const rows = await db
    .select({
      direction: projectPayments.direction,
      total: sql<string>`coalesce(sum(coalesce(${projectPayments.amountSettled}, ${projectPayments.amount})), 0)::text`,
    })
    .from(projectPayments)
    .where(eq(projectPayments.projectId, projectId))
    .groupBy(projectPayments.direction);

  const by = new Map(rows.map((r) => [r.direction, r.total]));
  return {
    incoming: by.get('incoming') ?? '0',
    memberPayout: by.get('member_payout') ?? '0',
    projectExpense: by.get('project_expense') ?? '0',
  };
}

/**
 * تراکنش‌های پروژه — جدولِ تبِ مالی.
 *
 * ⚠️ رسید روی ردیفِ **دفتر** است، نه روی پرداخت: پرداخت آینهٔ همان ردیف
 * است (`ledgerId`) و رسید از آن‌جا می‌آید — همان کاری که `fin_receipt_link`
 * نسخهٔ قبلی با `receipt_attachment_id` ِ آینه می‌کرد.
 */
export async function listPayments(projectId: number) {
  return db
    .select({
      id: projectPayments.id,
      direction: projectPayments.direction,
      type: projectPayments.type,
      amount: projectPayments.amount,
      amountSettled: projectPayments.amountSettled,
      currencyId: projectPayments.currencyId,
      paidAt: projectPayments.paidAt,
      note: projectPayments.note,
      userId: projectPayments.userId,
      userName: users.name,
      receiptIds: ledger.receiptIds,
    })
    .from(projectPayments)
    .leftJoin(users, eq(users.id, projectPayments.userId))
    .leftJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
    .where(eq(projectPayments.projectId, projectId))
    .orderBy(projectPayments.id);
}

/** ساعتِ کاریِ اعضا روی پروژه — تبِ مدیریت. */
export async function memberHours(projectId: number) {
  return db
    .select({
      userId: timelogs.userId,
      userName: users.name,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
    .from(timelogs)
    .leftJoin(users, eq(users.id, timelogs.userId))
    .where(eq(timelogs.projectId, projectId))
    .groupBy(timelogs.userId, users.name)
    .orderBy(users.name);
}

/** پیشنهادهای مناقصه — تبِ مناقصه. */
export async function listBids(projectId: number) {
  return db
    .select({
      id: tenderBids.id,
      // شناسه‌ها هم لازم‌اند: نمای عضو باید پیشنهادِ خودش را روی نقشِ خودش
      // پیدا کند، و نامِ نمایشی برای این کار کافی نیست.
      userId: tenderBids.userId,
      roleTagId: tenderBids.roleTagId,
      amount: tenderBids.amount,
      currencyId: tenderBids.currencyId,
      status: tenderBids.status,
      note: tenderBids.note,
      createdAt: tenderBids.createdAt,
      userName: users.name,
      roleName: tagName(await currentLocale()),
    })
    .from(tenderBids)
    .leftJoin(users, eq(users.id, tenderBids.userId))
    .leftJoin(tags, eq(tags.id, tenderBids.roleTagId))
    .where(eq(tenderBids.projectId, projectId))
    .orderBy(tenderBids.id);
}

/** آیتم‌های چک‌لیستِ QA ِ پروژه. */
export async function listProjectQa(projectId: number) {
  return db
    .select({
      id: projectQa.id,
      /**
       * ⚠️ عنوان از **خودِ ردیفِ پروژه** خوانده می‌شود، نه از کتابخانه: عکسِ
       * لحظه‌ای است، پس تغییر یا حذفِ آیتمِ کتابخانه تاریخچهٔ پروژه را بازنویسی نمی‌کند.
       */
      title: projectQa.title,
      /** R-PROJ-18 — آیتمِ «تسک‌ساز» در برابر آیتمِ چک‌لیستِ ساده. */
      isTask: qaItems.isTask,
      roleTagId: projectQa.roleTagId,
      roleName: tagName(await currentLocale()),
      isDone: projectQa.isDone,
      doneAt: projectQa.doneAt,
      doneBy: projectQa.doneBy,
      doneByName: users.name,
    })
    .from(projectQa)
    .leftJoin(qaItems, eq(qaItems.id, projectQa.qaItemId))
    .leftJoin(tags, eq(tags.id, projectQa.roleTagId))
    .leftJoin(users, eq(users.id, projectQa.doneBy))
    .where(eq(projectQa.projectId, projectId))
    .orderBy(projectQa.id);
}

/**
 * پیوست‌های پروژه.
 *
 * ⚠️ شکل‌دهی اینجا **یک جا** انجام می‌شود و هم صفحهٔ پروژه و هم سرویسِ فایل از
 * همین می‌خوانند؛ وگرنه دو مسیر با هم فرق می‌کردند و یکی‌شان روزی آدرسِ خامِ
 * S3 را بیرون می‌داد (R-FILE-01).
 */
export async function listAttachments(projectId: number) {
  const rows = await db
    .select({
      id: attachments.id,
      label: attachments.label,
      externalUrl: attachments.externalUrl,
      fileId: attachments.fileId,
      kind: attachments.kind,
      createdAt: attachments.createdAt,
      uploaderName: users.name,
      mime: files.mime,
      size: files.size,
      originalName: files.originalName,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.userId))
    .leftJoin(files, eq(files.id, attachments.fileId))
    .where(eq(attachments.projectId, projectId))
    .orderBy(desc(attachments.id));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    mime: r.mime,
    size: r.size,
    uploaderName: r.uploaderName,
    isLink: r.kind === 'link',
    // فقط مسیرِ گیت‌شده — هرگز آدرسِ مستقیمِ شیء.
    href: r.kind === 'link' ? r.externalUrl! : `/api/files/${r.fileId}`,
    title: r.kind === 'link'
      ? (r.label || r.externalUrl!)
      : (r.label || r.originalName || `#${r.id}`),
  }));
}

/** یک تسک — برای گاردِ پروژهٔ صاحبش. */
export async function getTask(id: number) {
  const rows = await db
    .select({
      id: tasks.id, projectId: tasks.projectId, statusTagId: tasks.statusTagId,
      isPrivate: tasks.isPrivate, createdBy: tasks.createdBy, assignedTo: tasks.assignedTo,
      // عنوان برای متنِ اعلانِ ریویو و برگشت از ریویو لازم است.
      title: tasks.title,
    })
    .from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  return rows[0] ?? null;
}

/** یک کامنت — برای تیکِ وضعیت. */
export async function getComment(id: number) {
  const rows = await db
    .select({ id: comments.id, projectId: comments.projectId, type: comments.type, status: comments.status })
    .from(comments).where(eq(comments.id, id));
  return rows[0] ?? null;
}

/** تگ‌های وضعیتِ تسک. */
export async function taskStatusTags() {
  return db
    .select({
      id: tags.id,
      name: tagName(await currentLocale()),
      group: tags.statusGroup,
      isReview: tags.isReview,
      color: tags.color,
    })
    .from(tags)
    .where(eq(tags.type, 'task_status'))
    .orderBy(tags.sortOrder, tags.id);
}

/** تگ‌های اولویتِ تسک. */
export async function taskPriorityTags() {
  return db
    .select({ id: tags.id, name: tagName(await currentLocale()), color: tags.color })
    .from(tags)
    .where(eq(tags.type, 'task_priority'))
    .orderBy(tags.sortOrder, tags.id);
}

/** نامِ چند کاربر با یک کوئری (R-PERF-01). */
export async function userNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name })
    .from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** گفتگوی یک تسک. */
export async function taskNotes(taskId: number) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userName: users.name,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.taskId, taskId))
    .orderBy(comments.id);
}

/** تسکِ کامل — مودالِ تسک. */
export async function getTaskFull(id: number) {
  const assignee = alias(users, 'task_assignee');
  const editor = alias(users, 'task_editor');
  const priority = alias(tags, 'task_priority_tag');
  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      statusTagId: tasks.statusTagId,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
      isReview: tags.isReview,
      priorityTagId: tasks.priorityTagId,
      priorityName: priority.name,
      dueDate: tasks.dueDate,
      isPrivate: tasks.isPrivate,
      createdBy: tasks.createdBy,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
      updatedAt: tasks.updatedAt,
      updatedByName: editor.name,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(editor, eq(editor.id, tasks.updatedBy))
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  return rows[0] ?? null;
}

/** کتابخانهٔ آیتم‌های QA. */
export async function qaLibrary() {
  const rows = await db
    .select({
      id: qaItems.id,
      title: qaItems.title,
      description: qaItems.description,
      roleTagId: qaItems.roleTagId,
      isTask: qaItems.isTask,
    })
    .from(qaItems)
    .orderBy(qaItems.sortOrder, qaItems.id);
  // شناسهٔ نقشِ خالی یعنی «کارفرما» (R-QA-02 — نگهبانِ صفر).
  return rows.map((r) => ({ ...r, roleTagId: r.roleTagId ?? 0 }));
}

/** آیتم‌هایی که از قبل روی این پروژه اعمال شده‌اند — جلوگیری از تکرار. */
/**
 * آیتم‌های کتابخانه که روی این پروژه **قبلاً اعمال شده‌اند**.
 *
 * ⚠️ از **دو** منبع خوانده می‌شود: ردیف‌های چک‌لیست، و تسک‌هایی که از آیتمِ
 * تسک‌ساز زاده شده‌اند. اگر فقط چک‌لیست خوانده شود، هر بار اعمالِ دوبارهٔ یک
 * نقش تسک‌های تکراری می‌سازد.
 *
 * ⚠️ تسکِ **حذف‌شده** شمرده نمی‌شود — همان رفتارِ:
 * آیتمی که تسکش پاک شده باید دوباره قابلِ اعمال باشد.
 */
export async function appliedQaItemIds(projectId: number): Promise<Set<number>> {
  const [checklist, taskRows] = await Promise.all([
    db.select({ qaItemId: projectQa.qaItemId })
      .from(projectQa)
      .where(eq(projectQa.projectId, projectId)),
    db.select({ qaItemId: tasks.qaItemId })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))),
  ]);

  return new Set(
    [...checklist, ...taskRows]
      .map((r) => r.qaItemId)
      .filter((v): v is number => v !== null),
  );
}

/** یک ردیفِ چک‌لیستِ پروژه. */
export async function getProjectQa(id: number) {
  const rows = await db
    .select({ id: projectQa.id, projectId: projectQa.projectId, isDone: projectQa.isDone, roleTagId: projectQa.roleTagId })
    .from(projectQa).where(eq(projectQa.id, id));
  return rows[0] ?? null;
}

/** یک پیشنهادِ مناقصه. */
export async function getBid(id: number) {
  const rows = await db
    .select({
      id: tenderBids.id,
      projectId: tenderBids.projectId,
      userId: tenderBids.userId,
      roleTagId: tenderBids.roleTagId,
      amount: tenderBids.amount,
      currencyId: tenderBids.currencyId,
      status: tenderBids.status,
    })
    .from(tenderBids).where(eq(tenderBids.id, id));
  return rows[0] ?? null;
}

/** همهٔ پیشنهادهای یک پروژه — برای یافتنِ برندهٔ فعلیِ هر نقش. */
export async function projectBids(projectId: number) {
  return db
    .select({
      id: tenderBids.id,
      projectId: tenderBids.projectId,
      userId: tenderBids.userId,
      roleTagId: tenderBids.roleTagId,
      amount: tenderBids.amount,
      currencyId: tenderBids.currencyId,
      status: tenderBids.status,
    })
    .from(tenderBids).where(eq(tenderBids.projectId, projectId));
}

/** گروهِ وضعیتِ پروژه — فازِ مناقصه از همین مشتق می‌شود (R-TENDER-01). */
export async function projectStatusGroup(projectId: number): Promise<string | null> {
  const rows = await db
    .select({ group: tags.statusGroup })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(eq(projects.id, projectId));
  return rows[0]?.group ?? null;
}

/** مجموع‌های لازم برای عکسِ سبک‌سازی — پیش از پاک‌شدنِ جزئیات گرفته می‌شوند. */
export async function lightenTotals(projectId: number) {
  const [minutesRow, paidRows] = await Promise.all([
    db.select({ minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs).where(eq(timelogs.projectId, projectId)),
    db.select({
      direction: projectPayments.direction,
      total: sql<string>`coalesce(sum(${projectPayments.amountEur}), 0)::text`,
    })
      .from(projectPayments)
      .where(eq(projectPayments.projectId, projectId))
      .groupBy(projectPayments.direction),
  ]);

  const by = new Map(paidRows.map((r) => [r.direction, r.total]));
  return {
    minutes: minutesRow[0]?.minutes ?? 0,
    clientPaidEur: by.get('incoming') ?? '0',
    memberPaidEur: by.get('member_payout') ?? '0',
  };
}

/**
 * تسک‌های **بازِ** یک کاربر روی همهٔ پروژه‌ها — پایهٔ نمای «تسک‌های شما».
 *
 * ⚠️ «باز» یعنی گروهِ وضعیتش `complete` نیست. تسکِ بی‌وضعیت هم باز است —
 * وگرنه تسکِ تازه‌ساخته‌شده که هنوز وضعیت نگرفته از فهرست می‌افتاد.
 *
 * ⚠️ ترتیب بر اساسِ **اولویت** است (بالا→پایین)، همان `order_priority()`؛
 * فهرستی که با شناسه مرتب شود عملاً بی‌ترتیب است.
 */
export async function openTasksForUser(userId: number, scopes: Array<'company' | 'private'>) {
  const priority = alias(tags, 'my_priority_tag');

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      dueDate: tasks.dueDate,
      statusName: tagName(await currentLocale()),
      statusColor: tags.color,
      isReview: tags.isReview,
      priorityName: priority.name,
      priorityColor: priority.color,
      prioritySort: priority.sortOrder,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .where(and(
      eq(tasks.assignedTo, userId),
      isNull(tasks.deletedAt),
      inArray(projects.scope, scopes),
      sql`coalesce(${tags.statusGroup}, '') <> 'complete'`,
    ))
    .orderBy(priority.sortOrder, desc(tasks.id));
}
