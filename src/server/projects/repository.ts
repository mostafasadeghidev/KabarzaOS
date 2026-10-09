import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { asc, and, desc, eq, inArray, isNull, sql, or, gte, lte } from 'drizzle-orm';
import { contractBalance, rowValueIn, summarizeProject } from '@/domain/team-money/payments';
import { rateSource } from '@/server/finance/rates';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  projects, projectMembers, projectClients, tasks, taskRoles,
  timelogs, ledger, projectPayments, paymentRequests, users, tags,
  currencies, offices, tagRelations, userRoles, comments, tenderBids,
  projectQa, qaItems, attachments, files, meetings, meetingAttendees, userOffices, reviews,
} from '@/db/schema';
import type { ProjectImpact } from '@/domain/projects/lifecycle';
import { isOverdueProject, isFrozenProject } from '@/domain/projects/lifecycle';
import { openThreads } from '@/domain/dashboard/focus';

/**
 * لایهٔ داده — فقط خواندن و نوشتن، بدونِ قاعدهٔ کسب‌وکار.
 *
 * ⚠️ R-PERF-01 — هیچ کوئری‌ای داخلِ حلقه نیست. برای هر فهرست، تعدادِ کوئری
 * **ثابت** است، نه وابسته به تعدادِ ردیف. نسخهٔ قبلی یک ریفکتورِ کامل برای همین لازم داشت.
 */

export interface ProjectListRow {
  /** بسته‌بودنِ وضعیت — برای `isOpenProject`. */
  isClosed: boolean | null;
  id: number;
  title: string;
  price: string;
  currencyId: number | null;
  /** کدِ ارزِ پروژه — کنارِ «مبلغ» ِ کارت. */
  currencyCode: string | null;
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
  /** پروژهٔ تعدادی — افزودنِ سریعِ عضو «نرخِ هر واحد» می‌گیرد، نه مبلغ. */
  isUnitBased: boolean;
  scope: 'company' | 'private';
  /** دفترِ مالک — شاخهٔ «مدیرِ دفتر» در ماسکِ نام به آن نیاز دارد. */
  officeId: number | null;
  memberCount: number;
  openTaskCount: number;
  /** تسکِ نیازمندِ ریویو — پایهٔ تبِ «نیازمند بررسی». */
  reviewCount: number;
  /** ددلاین گذشته و پروژه تمام‌نشده — پایهٔ تبِ «گذشته از ددلاین». */
  isOverdue: boolean;
  /** مناقصهٔ **باز** (گروهِ «احتمالِ عقد قرارداد») — روبان و تبِ مناقصه فقط برای این. */
  tenderOpen: boolean;
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
  members: Array<{ userId: number; name: string; roleName: string | null }>;
  clients: Array<{ userId: number; name: string }>;
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
      currencyCode: currencies.code,
      statusTagId: projects.statusTagId,
      statusName: tagName(await currentLocale()),
      statusGroup: tags.statusGroup,
      statusColor: tags.color,
      /** بسته‌بودنِ وضعیت — برای `isOpenProject` (داشبوردِ عضو فقط بازها را می‌آورد). */
      isClosed: tags.isClosed,
      deadline: projects.deadline,
      thumbnailFileId: projects.thumbnailFileId,
      lightenSummary: projects.lightenSummary,
      isArchived: projects.isArchived,
      isTender: projects.isTender,
      isUnitBased: projects.isUnitBased,
      scope: projects.scope,
      officeId: projects.officeId,
      regDate: projects.regDate,
      parentId: projects.parentId,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .leftJoin(currencies, eq(currencies.id, projects.currencyId))
    .where(and(
      isNull(projects.deletedAt),
      inArray(projects.scope, scopes),
      ...(onlyIds !== undefined ? [inArray(projects.id, onlyIds)] : []),
    ))
    // تازه‌ترین پروژه اول — همان ترتیبِ نسخهٔ قبلی؛ با صعودی، پروژهٔ نو تهِ صفحهٔ آخر می‌افتاد.
    .orderBy(desc(projects.id));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // ۲) شمارشِ اعضا — یک کوئری برای همهٔ پروژه‌ها.
  const memberCounts = await db
    .select({ projectId: projectMembers.projectId, count: sql<number>`count(*)::int` })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, ids))
    .groupBy(projectMembers.projectId);

  /**
   * ۳) شمارشِ تسکِ باز — پرچمِ وضعیت، نه نام (R-PROJ-16). ⚠️ «باز» یعنی نه بسته
   * و نه در ریویو (`count_open`): پیش از این تسکِ منتظرِ بررسی هم «باز» شمرده
   * می‌شد و عددِ کارت با شمارِ «نیازمند بررسی» ِ کنارش هم‌پوشانی داشت.
   */
  const taskCounts = await db
    .select({ projectId: tasks.projectId, count: sql<number>`count(*)::int` })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, ids),
      isNull(tasks.deletedAt),
      sql`coalesce(${tags.statusGroup}, '') <> 'complete'`,
      sql`coalesce(${tags.isClosed}, false) = false`,
      sql`coalesce(${tags.isReview}, false) = false`,
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

  /**
   * ۶) کامنت‌های نیازمندِ بررسی — **رشته‌های** باز (`count_needs_review`):
   * رشته‌ای که تازه‌ترین پیامش «نیازمند بررسی» است. ⚠️ پیش از این ردیف‌ها شمرده
   * می‌شدند؛ ریشهٔ بسته با پاسخِ باز صفر بود و رشته با سه پاسخِ باز سه.
   */
  const commentRows = await db
    .select({ id: comments.id, parentId: comments.parentId, status: comments.status, projectId: comments.projectId })
    .from(comments)
    .where(and(
      inArray(comments.projectId, ids),
      eq(comments.type, 'comment'),
      isNull(comments.taskId),
    ))
    .orderBy(comments.id);
  const threadCount = new Map<number, number>();
  for (const { root } of openThreads(commentRows)) {
    threadCount.set(root.projectId!, (threadCount.get(root.projectId!) ?? 0) + 1);
  }
  const commentReviews = [...threadCount].map(([projectId, count]) => ({ projectId, count }));

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
      // ⚠️ شناسه لازم است: ماسکِ نام در سرویس به «این نفر کیست» نیاز دارد،
      // نه فقط به نامش. بدونِ آن، بیننده نامِ خودش را هم ماسک‌شده می‌دید.
      userId: projectMembers.userId,
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
  //
  // ⚠️ هر ردیف به **ارزِ پروژه** — پورتِ `total_project_expenses` (با
  // `row_value_in`). پیش از این جمعِ خام بود: هزینهٔ دلاری با عددِ خودش روی
  // قیمتِ یورویی می‌نشست. نبودِ نرخ عددِ خام را نگه می‌دارد تا هزینه پنهان نشود.
  const [expenseRows, fx] = await Promise.all([
    db.select({
      projectId: projectPayments.projectId,
      amount: projectPayments.amount,
      currencyId: projectPayments.currencyId,
      amountSettled: projectPayments.amountSettled,
      settledCurrencyId: projectPayments.settledCurrencyId,
    })
      .from(projectPayments)
      .where(
        and(
          inArray(projectPayments.projectId, ids),
          eq(projectPayments.direction, 'project_expense'),
        ),
      ),
    rateSource(),
  ]);
  const projectCurrency = new Map(rows.map((r) => [r.id, r.currencyId]));
  const expenseTotals = new Map<number, number>();
  for (const e of expenseRows) {
    if (e.projectId === null) continue;
    const target = projectCurrency.get(e.projectId) ?? null;
    const raw = Number(e.amountSettled ?? e.amount);
    const value = target && e.currencyId
      ? Number(rowValueIn(fx.source, {
        amount: e.amount,
        currencyId: e.currencyId,
        amountSettled: e.amountSettled,
        settledCurrencyId: e.settledCurrencyId,
      }, target) ?? raw)
      : raw;
    expenseTotals.set(e.projectId, (expenseTotals.get(e.projectId) ?? 0) + value);
  }

  // ۱۰) چیپ‌های کارفرما.
  const clientChips = await db
    .select({ projectId: projectClients.projectId, userId: projectClients.userId, name: users.name })
    .from(projectClients)
    .innerJoin(users, eq(users.id, projectClients.userId))
    .where(inArray(projectClients.projectId, ids));

  const members = new Map(memberCounts.map((r) => [r.projectId, r.count]));
  const openTasks = new Map(taskCounts.map((r) => [r.projectId, r.count]));
  const reviews = new Map(reviewCounts.map((r) => [r.projectId, r.count]));
  const totals = new Map(taskTotals.map((r) => [r.projectId, r]));
  const commentReviews2 = new Map(commentReviews.map((r) => [r.projectId, r.count]));
  const bidCounts = new Map(bids.map((r) => [r.projectId, r.count]));
  const expenses = new Map([...expenseTotals].map(([id, total]) => [id, total.toFixed(4)]));
  const titleOf = new Map(rows.map((r) => [r.id, r.title]));

  const chipsByProject = new Map<number, Array<{ userId: number; name: string; roleName: string | null }>>();
  for (const c of memberChips) {
    const list = chipsByProject.get(c.projectId) ?? [];
    list.push({ userId: c.userId, name: c.name, roleName: c.roleName });
    chipsByProject.set(c.projectId, list);
  }
  const clientsByProject = new Map<number, Array<{ userId: number; name: string }>>();
  for (const c of clientChips) {
    const list = clientsByProject.get(c.projectId) ?? [];
    list.push({ userId: c.userId, name: c.name });
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
    // پورتِ `overdue_ids()`: ددلاینِ گذشته و پروژه منجمد نیست (تکمیل‌شده شمرده می‌شود).
    isOverdue: isOverdueProject({ deadline: r.deadline, isArchived: r.isArchived, statusGroup: r.statusGroup }, today),
    tenderOpen: r.isTender && r.statusGroup === 'lead',
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
      /** رنگِ تگِ نقش — چیپِ نقش (پورتِ `role_color`). */
      roleColor: tags.color,
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
  /** برای نشانِ «منتظرِ…» — وضعیتِ وابستگی بسته است یا نه. */
  statusIsClosed: boolean | null;
  /** R-PROJ-13 — «نیاز به ریویو» پرچمِ خودِ تگ است، نه نامش. */
  isReview: boolean | null;
  /** پیوندِ «وابسته به» — شناسهٔ تسکی که این یکی پشتش در صف است. */
  dependsOn: number | null;
  dueDate: string | null;
  isPrivate: boolean;
  createdBy: number | null;
  assignedTo: number | null;
  assigneeName: string | null;
  /** کارتِ تسک — پورتِ چیپِ اولویت و `task_notes_summary`. */
  priorityName: string | null;
  priorityColor: string | null;
  description: string;
  notesCount: number;
  mediaCount: number;
  lastNote: string | null;
  /** آیتمِ QA ای که این تسک را ساخته — تبِ QA تسک‌هایش را با همین پیدا می‌کند. */
  qaItemId: number | null;
  /** پنهان از کارفرما (۱.۱۱۶.۰). */
  clientHidden: boolean;
  /** موردِ بازبینی — عنوان و زمانِ ویدئو برای چیپِ کارت. */
  reviewId: number | null;
  reviewTitle: string | null;
  reviewStart: number | null;
  area: string;
  /** شمارهٔ تسک در پروژه (۲.۱۶.۰) — برای کارفرما null (سرویس می‌گذارد). */
  number: number | null;
}

/** تسک‌های یک پروژه — دو کوئریِ ثابت (R-PERF-01). */
export async function listTasks(projectId: number): Promise<TaskRow[]> {
  const assignee = alias(users, 'assignee');
  const priority = alias(tags, 'priority_tag');
  const locale = await currentLocale();
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      statusTagId: tasks.statusTagId,
      statusName: tagName(locale),
      statusGroup: tags.statusGroup,
      statusColor: tags.color,
      /** برای نشانِ «منتظرِ…»: تسکِ وابستگی تمام شده یا نه. */
      statusIsClosed: tags.isClosed,
      /** R-PROJ-13 — «نیاز به ریویو» پرچمِ خودِ تگ است، نه نامش. */
      isReview: tags.isReview,
      dueDate: tasks.dueDate,
      isPrivate: tasks.isPrivate,
      createdBy: tasks.createdBy,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
      /** «وابسته به» — پیش از این ستونی مرده بود. */
      dependsOn: tasks.dependsOn,
      priorityName: tagName(locale, priority),
      priorityColor: priority.color,
      description: tasks.description,
      // پورتِ `task_notes_summary`: شمار و آخرین یادداشتِ گفتگو روی کارت.
      notesCount: sql<number>`(select count(*) from comments c where c.task_id = ${tasks.id})::int`,
      // تصویر و فایلِ تسک و یادداشت‌هایش — نشانِ «پیوست دارد» روی کارت.
      mediaCount: sql<number>`(select count(*) from attachments a where a.task_id = ${tasks.id})::int`,
      lastNote: sql<string | null>`(select c.body from comments c where c.task_id = ${tasks.id} order by c.id desc limit 1)`,
      qaItemId: tasks.qaItemId,
      clientHidden: tasks.clientHidden,
      reviewId: tasks.reviewId,
      reviewTitle: reviews.title,
      reviewStart: tasks.reviewStart,
      area: tasks.area,
      number: tasks.number,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(reviews, eq(reviews.id, tasks.reviewId))
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

/**
 * دفاترِ تحتِ مدیریتِ یک نفر — دامنهٔ ساختِ پروژهٔ مدیرِ دفتر.
 * (همان پرس‌وجوی «تیمِ من»؛ این‌جا تکرار شده تا سرویسِ پروژه به ماژولِ تیم وابسته نشود.)
 */
export async function managedOfficeIds(userId: number): Promise<number[]> {
  const rows = await db.select({ officeId: userOffices.officeId }).from(userOffices)
    .where(and(eq(userOffices.userId, userId), eq(userOffices.manages, true)));
  return rows.map((r) => r.officeId);
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
export async function parentOptions(
  scopes: Array<'company' | 'private'>,
  excludeId?: number,
  /**
   * ⚠️ مدیرِ دفتر فقط پروژه‌های دفاترِ خودش را به‌عنوانِ والد می‌بیند — فهرستِ
   * کامل، عنوانِ پروژه‌های شعبه‌های دیگر را به کسی نشان می‌داد که آن‌ها را نمی‌بیند.
   */
  onlyOffices?: readonly number[],
) {
  const rows = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(
      isNull(projects.deletedAt), isNull(projects.parentId), inArray(projects.scope, scopes),
      onlyOffices ? (onlyOffices.length > 0 ? inArray(projects.officeId, [...onlyOffices]) : sql`false`) : undefined,
    ))
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
  /**
   * ⚠️ طلب در **ارزِ قرارداد** سنجیده می‌شود (`contractBalance`، R-TEAM-05).
   * پیش از این توافقی و پرداختی بی‌توجه به ارز از هم کم می‌شدند: عضوی که به
   * ارزِ دیگر پرداخت گرفته بود یا به‌اشتباه طلبکار می‌ماند (و حذف نمی‌شد) یا
   * به‌اشتباه تسویه دیده می‌شد (و با ویرایشِ دسته‌جمعی حذف می‌شد).
   */
  const [memberRows, payoutRows, projectRows, fx] = await Promise.all([
    db.select({
      userId: projectMembers.userId,
      agreed: projectMembers.agreedAmount,
      currencyId: projectMembers.currencyId,
    })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(projectMembers.id)),
    db.select({
      userId: projectPayments.userId,
      amount: projectPayments.amount,
      currencyId: projectPayments.currencyId,
      amountSettled: projectPayments.amountSettled,
      settledCurrencyId: projectPayments.settledCurrencyId,
    })
      .from(projectPayments)
      .where(and(eq(projectPayments.projectId, projectId), eq(projectPayments.direction, 'member_payout'))),
    db.select({ currencyId: projects.currencyId }).from(projects).where(eq(projects.id, projectId)),
    rateSource(),
  ]);

  const owed = new Set<number>();
  for (const userId of new Set(memberRows.map((m) => m.userId))) {
    const { remaining } = contractBalance({
      memberRows: memberRows.filter((m) => m.userId === userId),
      payouts: payoutRows.filter((p) => p.userId === userId),
      projectCurrencyId: projectRows[0]?.currencyId ?? null,
      source: fx.source,
    });
    if (remaining > 0.0001) owed.add(userId);
  }
  return owed;
}

/**
 * کسانی که روی این پروژه یکی از این نقش‌ها را دارند.
 *
 * ⚠️ گیرندگانِ اعلانِ تسکِ **نقشی**. بدونِ این، تسکی که کارفرما می‌سازد به
 * هیچ‌کس اعلان نمی‌داد — او به شخص تخصیص نمی‌دهد، پس شرطِ `assignedTo`
 * هرگز برقرار نمی‌شد.
 */
export async function usersWithRolesOnProject(
  projectId: number,
  roleTagIds: readonly number[],
): Promise<number[]> {
  if (roleTagIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      inArray(projectMembers.roleTagId, [...roleTagIds]),
      eq(projectMembers.accessBlocked, false),
    ));
  return rows.map((r) => r.userId);
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
    // پورتِ `People::member_role_map`: فقط اعضای **فعال** — همان فهرستِ انتخابگرها.
    .innerJoin(users, and(eq(users.id, tagRelations.objectId), eq(users.memberState, 'active'), isNull(users.deletedAt)))
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

/**
 * همکارانِ ادمین — نقشِ `admin` و **نه** مالک.
 * نامِ این‌ها برای عضو و کارفرما «دستیارِ مدیر» می‌شود (R-MASK-04).
 */
export async function assistantUserIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.role, 'admin'));
  return rows.map((r) => r.userId);
}

/**
 * مالک و همکارانِ ادمین — کاندیدای «تخصیص به» برای مدیرِ پروژه.
 * ⚠️ این‌ها عضوِ پروژه نیستند، ولی مدیرِ پروژه/دفتر باید بتواند کاری را به
 * مدیرِ کل بسپارد (تأیید، تصمیم، امضا) — پیش از این نامشان در فهرست نبود.
 */
export async function adminCandidates() {
  return db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['owner', 'admin']), isNull(users.deletedAt)))
    .orderBy(users.name);
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
  const rows = await db.select({
    id: tags.id, type: tags.type, name: tagName(await currentLocale()),
    // برای قاعدهٔ «انجام‌شده» ِ تسک (پورتِ `is_done` = پرچمِ بسته / گروهِ complete).
    isClosed: tags.isClosed, statusGroup: tags.statusGroup,
  })
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

/**
 * کارفرمای **اصلی** = قدیمی‌ترین انتساب (کوچک‌ترین شناسهٔ ردیفِ
 * `project_clients`) — پورتِ `Projects::primary_client_id()`.
 *
 * ⚠️ نه کوچک‌ترین شناسهٔ **کاربر**: کارفرمایی که دیرتر به پروژه اضافه شده
 * ولی حسابِ قدیمی‌تری دارد، اصلی نیست. با `Math.min(userIds)` تسکِ QA و
 * فاکتور به کارفرمای اشتباه می‌رفت.
 */
export async function primaryClientId(projectId: number): Promise<number | null> {
  const rows = await db.select({ userId: projectClients.userId })
    .from(projectClients)
    .where(eq(projectClients.projectId, projectId))
    .orderBy(asc(projectClients.id))
    .limit(1);
  return rows[0]?.userId ?? null;
}

/**
 * ماندهٔ باز — ورودیِ گاردِ حذف (R-PROJ-04): پروژه‌ای که کارفرما یا عضوش
 * پرداختِ **ناتمام** دارد، هرگز حذف نمی‌شود.
 *
 * ⚠️ این تابع نبود؛ فراخوان هر دو مانده را `false` هاردکد کرده بود، پس
 * حالتِ «قفل» هیچ‌وقت رخ نمی‌داد و پروژه با پولِ تسویه‌نشده حذف می‌شد.
 * پورتِ `Projects::impact()`: کارفرما = `Payments::summary()` در حالتِ
 * PARTIAL؛ عضو = هر پرداختِ عضوی که PARTIAL باشد. مبلغِ تسویه‌شده بر مبلغِ
 * اسمی مقدم است (R-TEAM-01).
 */
export async function openBalances(
  projectId: number,
): Promise<{ clientPartiallyPaid: boolean; memberPartiallyPaid: boolean }> {
  const settled = sql<string>`coalesce(sum(coalesce(${projectPayments.amountSettled}, ${projectPayments.amount})), 0)::text`;
  const [projectRow, byDirection, members, paidByUser] = await Promise.all([
    db.select({ price: projects.price }).from(projects).where(eq(projects.id, projectId)),
    db.select({ direction: projectPayments.direction, total: settled })
      .from(projectPayments)
      .where(eq(projectPayments.projectId, projectId))
      .groupBy(projectPayments.direction),
    db.select({ userId: projectMembers.userId, agreed: projectMembers.agreedAmount })
      .from(projectMembers).where(eq(projectMembers.projectId, projectId)),
    db.select({ userId: projectPayments.userId, total: settled })
      .from(projectPayments)
      .where(and(eq(projectPayments.projectId, projectId), eq(projectPayments.direction, 'member_payout')))
      .groupBy(projectPayments.userId),
  ]);
  const by = new Map(byDirection.map((r) => [r.direction, r.total]));
  const client = summarizeProject(
    projectRow[0]?.price ?? '0',
    // ⚠️ `project_expense` = قابلِ صورتحساب (نامِ آینه گمراه‌کننده است).
    by.get('project_expense') ?? '0',
    by.get('incoming') ?? '0',
  );
  const paid = new Map(paidByUser.map((r) => [r.userId, r.total]));
  /**
   * ⚠️ «ماندهٔ باز» یعنی چیزی پرداخت شده **و** چیزی هنوز مانده — 0 < paid < due.
   * پروژهٔ بی‌قیمت با یک دریافتی مانده ندارد؛ پرداختِ کامل هم مانده ندارد.
   * `paymentStatus` برای due=0 «ناتمام» می‌گوید و اینجا گمراه‌کننده بود.
   */
  const open = (paidAmount: string, due: number) => {
    const p = Number(paidAmount);
    return Number.isFinite(p) && p > 0 && due > 0 && p < due - 0.005;
  };
  return {
    clientPartiallyPaid: open(client.paid, client.totalDue),
    memberPartiallyPaid: members.some(
      (m) => open(paid.get(m.userId) ?? '0', Number(m.agreed)),
    ),
  };
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
      /** رشته‌بندی — پاسخ زیرِ والدش می‌نشیند (پورتِ `parent_id`). */
      parentId: comments.parentId,
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
      settledCurrencyId: projectPayments.settledCurrencyId,
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
  const locale = await currentLocale();
  return db
    .select({
      userId: timelogs.userId,
      userName: users.name,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
      /** «تعداد ثبت» — ستونِ جدولِ ساعتِ اعضای نسخهٔ قبلی. */
      entries: sql<number>`count(*)::int`,
      /** «نقش در پروژه» — نقش‌های همین نفر روی همین پروژه (ستونِ جدولِ نسخهٔ قبلی). */
      roleNames: sql<string | null>`(
        select string_agg(coalesce(nullif(rt.name_i18n ->> ${locale}, ''), rt.name), '، ' order by rt.sort_order, rt.id)
        from project_members pm join tags rt on rt.id = pm.role_tag_id
        where pm.project_id = ${projectId} and pm.user_id = ${timelogs.userId}
      )`,
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
      // کدِ ارزِ پیشنهاد — عددِ بی‌ارز در جدولِ مدیر معلوم نمی‌کرد یورو است یا ریال.
      currencyCode: currencies.code,
    })
    .from(tenderBids)
    .leftJoin(users, eq(users.id, tenderBids.userId))
    .leftJoin(tags, eq(tags.id, tenderBids.roleTagId))
    .leftJoin(currencies, eq(currencies.id, tenderBids.currencyId))
    .where(eq(tenderBids.projectId, projectId))
    // پورتِ `Bids::for_project`: نقش → برنده اول → ارزان‌تر اول → شناسه.
    .orderBy(
      tenderBids.roleTagId,
      sql`(${tenderBids.status} = 'approved') desc`,
      sql`${tenderBids.amount}::numeric asc`,
      tenderBids.id,
    );
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
      /** «چه‌طور بررسی شود» — همان عکسِ لحظه‌ایِ کتابخانه، کنارِ عنوان. */
      description: projectQa.description,
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
    // پورتِ `QA::items`: نقش، بعد ترتیبِ کتابخانه، بعد شناسه — فهرست به‌ازای نقش گروه می‌شود.
    .orderBy(sql`(${projectQa.roleTagId} is null)`, projectQa.roleTagId, qaItems.sortOrder, projectQa.id);
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
      uploaderId: attachments.userId,
      mime: files.mime,
      size: files.size,
      originalName: files.originalName,
      pinned: attachments.pinned,
    })
    .from(attachments)
    .leftJoin(users, eq(users.id, attachments.userId))
    .leftJoin(files, eq(files.id, attachments.fileId))
    // ⚠️ فقط فایلِ خودِ پروژه — رسانهٔ تسک و کامنت گاردِ خودش را دارد (تسکِ خصوصی).
    .where(and(
      eq(attachments.projectId, projectId),
      isNull(attachments.taskId), isNull(attachments.commentId), isNull(attachments.reviewId),
    ))
    // سنجاق‌شده‌ها بالا (۲.۳.۰)؛ بقیه تازه‌ترین بالا، مثلِ قبل.
    .orderBy(desc(attachments.pinned), desc(attachments.id));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    pinned: r.pinned,
    kind: r.kind,
    mime: r.mime,
    size: r.size,
    uploaderName: r.uploaderName,
    /** برای دکمهٔ حذف: فقط بارگذارنده یا مدیر (R-FILE-09). */
    uploaderId: r.uploaderId,
    isLink: r.kind === 'link',
    // فقط مسیرِ گیت‌شده — هرگز آدرسِ مستقیمِ شیء.
    href: r.kind === 'link' ? r.externalUrl! : `/api/files/${r.fileId}`,
    title: r.kind === 'link'
      ? (r.label || r.externalUrl!)
      : (r.label || r.originalName || `#${r.id}`),
  }));
}

/** یک قلمِ رسانهٔ تسک یا کامنت — همان شکلی که گالری می‌خواهد. */
export interface MediaItem {
  id: number;
  fileId: number;
  taskId: number | null;
  commentId: number | null;
  reviewId: number | null;
  userId: number;
  kind: string;
  mime: string;
  size: number;
  name: string;
}

/**
 * رسانهٔ چند تسک و/یا کامنت — یک کوئری (R-PERF-01).
 * ⚠️ گاردی اینجا نیست؛ فراخوان فقط شناسهٔ تسک‌ها و کامنت‌هایی را می‌دهد که
 * بیننده می‌بیند. `/api/files` هم برای هر فایل جدا گارد دارد.
 */
export async function mediaFor(filter: {
  taskIds?: readonly number[];
  commentIds?: readonly number[];
  reviewIds?: readonly number[];
}): Promise<MediaItem[]> {
  const taskIds = [...(filter.taskIds ?? [])];
  const commentIds = [...(filter.commentIds ?? [])];
  const reviewIds = [...(filter.reviewIds ?? [])];
  const conditions = [
    ...(taskIds.length > 0 ? [inArray(attachments.taskId, taskIds)] : []),
    ...(commentIds.length > 0 ? [inArray(attachments.commentId, commentIds)] : []),
    ...(reviewIds.length > 0 ? [inArray(attachments.reviewId, reviewIds)] : []),
  ];
  if (conditions.length === 0) return [];
  const rows = await db
    .select({
      id: attachments.id,
      fileId: attachments.fileId,
      taskId: attachments.taskId,
      commentId: attachments.commentId,
      reviewId: attachments.reviewId,
      userId: attachments.userId,
      kind: attachments.kind,
      mime: files.mime,
      size: files.size,
      name: files.originalName,
    })
    .from(attachments)
    .innerJoin(files, eq(files.id, attachments.fileId))
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .orderBy(attachments.id);
  return rows.map((r) => ({ ...r, fileId: r.fileId!, name: r.name ?? '' }));
}

/** یک تسک — برای گاردِ پروژهٔ صاحبش. */
export async function getTask(id: number) {
  const rows = await db
    .select({
      id: tasks.id, projectId: tasks.projectId, statusTagId: tasks.statusTagId,
      isPrivate: tasks.isPrivate, createdBy: tasks.createdBy, assignedTo: tasks.assignedTo,
      // عنوان برای متنِ اعلانِ ریویو و برگشت از ریویو لازم است.
      title: tasks.title,
      // حالتِ قبلِ «ویرایشِ تسک» در لاگ — بدونِ این‌ها جزئیاتِ رویداد «ثبت نشده» می‌گفت.
      description: tasks.description, dueDate: tasks.dueDate,
      priorityTagId: tasks.priorityTagId, dependsOn: tasks.dependsOn,
      // پنهان از کارفرما و پیوندِ بازبینی — گاردِ دیدن و حالتِ قبلِ ویرایش.
      clientHidden: tasks.clientHidden, reviewId: tasks.reviewId,
      reviewStart: tasks.reviewStart, reviewEnd: tasks.reviewEnd, area: tasks.area,
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
      // اسلاگ برای قاعدهٔ وابستگی لازم است: «در نوبت» با `next-up` شناخته می‌شود.
      slug: tags.slug,
      isClosed: tags.isClosed,
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
      userId: comments.userId,
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
      // رنگِ تگِ وضعیت — چیپِ مودالِ تسک با همین رنگ کشیده می‌شود.
      statusColor: tags.color,
      statusGroup: tags.statusGroup,
      isReview: tags.isReview,
      priorityTagId: tasks.priorityTagId,
      priorityName: tagName(await currentLocale(), priority),
      priorityColor: priority.color,
      dueDate: tasks.dueDate,
      isPrivate: tasks.isPrivate,
      createdBy: tasks.createdBy,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
      updatedAt: tasks.updatedAt,
      // ⚠️ شناسه لازم است تا نام سمتِ سرور ماسک شود (viewer-names).
      updatedBy: tasks.updatedBy,
      updatedByName: editor.name,
      dependsOn: tasks.dependsOn,
      clientHidden: tasks.clientHidden,
      reviewId: tasks.reviewId,
      reviewTitle: reviews.title,
      reviewStart: tasks.reviewStart,
      reviewEnd: tasks.reviewEnd,
      area: tasks.area,
      number: tasks.number,
      projectCode: projects.code,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(editor, eq(editor.id, tasks.updatedBy))
    .leftJoin(reviews, eq(reviews.id, tasks.reviewId))
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
      /** شماره و کدِ پروژه (۲.۱۶.۰) — «ALZ-325»؛ صندوقِ کارفرما null می‌کند. */
      number: tasks.number,
      projectCode: projects.code,
      dueDate: tasks.dueDate,
      statusName: tagName(await currentLocale()),
      statusColor: tags.color,
      isReview: tags.isReview,
      statusGroup: tags.statusGroup,
      isPrivate: tasks.isPrivate,
      assignedTo: tasks.assignedTo,
      createdBy: tasks.createdBy,
      priorityName: tagName(await currentLocale(), priority),
      priorityColor: priority.color,
      prioritySort: priority.sortOrder,
      // پورتِ `task_notes_summary` روی ردیفِ صندوق: شمار و آخرین یادداشتِ گفتگو.
      notesCount: sql<number>`(select count(*) from comments c where c.task_id = ${tasks.id})::int`,
      lastNote: sql<string | null>`(select c.body from comments c where c.task_id = ${tasks.id} order by c.id desc limit 1)`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .where(and(
      // پورتِ `visible_to_user_sql`: مالِ من، خصوصیِ خودم، یا تسکِ نقشیِ بی‌مسئول با نقشِ من (ادعانشده/ادعای خودم).
      visibleToUserSql(userId),
      isNull(tasks.deletedAt),
      inArray(projects.scope, scopes),
      sql`coalesce(${tags.statusGroup}, '') <> 'complete'`,
      notBlockedOnProjectSql(userId),
    ))
    .orderBy(priority.sortOrder, desc(tasks.id));
}

/**
 * ⚠️ «قطعِ دسترسی» روی پروژه (۲.۹.۰): تسکِ آن پروژه در صندوقِ کاربر نمی‌آید، حتی
 * اگر به نامِ خودش باشد — همان قاعدهٔ `projectRelation` (همهٔ رابطه‌ها قطع ← قطع).
 * پیش از این عنوانِ تسک و نامِ پروژه در «تسک‌های من» (و ربات/MCP) می‌ماند.
 */
function notBlockedOnProjectSql(userId: number) {
  return sql`not (
    exists (
      select 1 from project_members pm where pm.project_id = ${tasks.projectId} and pm.user_id = ${userId} and pm.access_blocked
      union all
      select 1 from project_clients pc where pc.project_id = ${tasks.projectId} and pc.user_id = ${userId} and pc.access_blocked
    )
    and not exists (
      select 1 from project_members pm where pm.project_id = ${tasks.projectId} and pm.user_id = ${userId} and not pm.access_blocked
      union all
      select 1 from project_clients pc where pc.project_id = ${tasks.projectId} and pc.user_id = ${userId} and not pc.access_blocked
    )
  )`;
}

/* ------------------------------------------------------------------ *
 * دیدِ عضو، صندوقِ کارفرما، مناقصه‌ها — پورتِ داشبوردِ عضو/کارفرما
 * ------------------------------------------------------------------ */

/**
 * پورتِ `Tasks::visible_to_user_sql()` — همان قاعدهٔ `domain/projects/visibility`
 * در SQL: مسئولِ مستقیم؛ سازندهٔ تسکِ خصوصی؛ یا تسکِ نقشیِ **بی‌مسئولِ** غیرِخصوصی
 * که یکی از نقش‌های کاربر روی همان پروژه است و ادعانشده یا ادعای خودِ اوست.
 * ⚠️ پیش از این فقط `assigned_to = me` بود: تسکِ نقشیِ ادعانشده هرگز در صندوق نمی‌آمد.
 */
export function visibleToUserSql(userId: number) {
  return sql`(
    ${tasks.assignedTo} = ${userId}
    or (${tasks.isPrivate} = true and ${tasks.createdBy} = ${userId})
    or (${tasks.isPrivate} = false and ${tasks.assignedTo} is null and exists (
      select 1 from task_roles tr
      join project_members pm
        on pm.project_id = ${tasks.projectId} and pm.user_id = ${userId} and pm.role_tag_id = tr.role_tag_id
      where tr.task_id = ${tasks.id} and (tr.claimed_by is null or tr.claimed_by = ${userId})
    ))
  )`;
}

/** تسک‌های در انتظارِ بررسی روی پروژه‌ها — صندوقِ کارفرما (پورتِ `review_for_projects`). */
export async function reviewTasksForProjects(
  projectIds: number[],
  scopes: Array<'company' | 'private'>,
  /**
   * صندوقِ کارفرما: تسکِ «پنهان از کارفرما» نمی‌آید، مگر به خودِ همین کاربر
   * سپرده شده باشد (۱.۱۱۶.۰). فهرستِ ریویوی مدیر این را نمی‌دهد.
   */
  clientViewerId: number | null = null,
) {
  if (projectIds.length === 0) return [];
  const priority = alias(tags, 'review_priority_tag');
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      projectTitle: projects.title,
      number: tasks.number,
      projectCode: projects.code,
      dueDate: tasks.dueDate,
      statusName: tagName(await currentLocale()),
      statusColor: tags.color,
      isReview: tags.isReview,
      statusGroup: tags.statusGroup,
      isPrivate: tasks.isPrivate,
      assignedTo: tasks.assignedTo,
      createdBy: tasks.createdBy,
      priorityName: tagName(await currentLocale(), priority),
      priorityColor: priority.color,
      prioritySort: priority.sortOrder,
      notesCount: sql<number>`(select count(*) from comments c where c.task_id = ${tasks.id})::int`,
      lastNote: sql<string | null>`(select c.body from comments c where c.task_id = ${tasks.id} order by c.id desc limit 1)`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(priority, eq(priority.id, tasks.priorityTagId))
    .where(and(
      inArray(tasks.projectId, projectIds),
      isNull(tasks.deletedAt),
      eq(tasks.isPrivate, false),
      eq(tags.isReview, true),
      inArray(projects.scope, scopes),
      ...(clientViewerId !== null ? [or(eq(tasks.clientHidden, false), eq(tasks.assignedTo, clientViewerId))!] : []),
    ))
    .orderBy(priority.sortOrder, desc(tasks.id));
}

/** دارندگانِ هر نقش روی پروژه‌ها — برای قاعدهٔ «برمی‌دارم» در صندوق و مودال. */
export async function roleHoldersFor(projectIds: number[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({ projectId: projectMembers.projectId, userId: projectMembers.userId, roleTagId: projectMembers.roleTagId })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, projectIds));
}

/**
 * تسک‌های **بازِ** یک پروژه با نقش‌هایشان — برای واگذاریِ خودکار.
 * «باز» یعنی وضعیتش در گروهِ `complete` نیست و حذف نشده.
 */
export async function openTasksWithRoles(projectId: number) {
  const rows = await db
    .select({
      taskId: tasks.id,
      assignedTo: tasks.assignedTo,
      roleTagId: taskRoles.roleTagId,
      claimedBy: taskRoles.claimedBy,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .leftJoin(taskRoles, eq(taskRoles.taskId, tasks.id))
    .where(and(
      eq(tasks.projectId, projectId),
      isNull(tasks.deletedAt),
      sql`coalesce(${tags.statusGroup}, '') <> 'complete'`,
    ));
  return rows;
}

/**
 * پروژه‌های **باز** (نه بایگانی، نه بسته/لغو/متوقف) برای انتخابگرها.
 * `ids = null` یعنی بدونِ محدودیتِ عضویت (مالک/مدیرِ پروژه‌ها).
 */
export async function openProjects(
  scopes: Array<'company' | 'private'>,
  ids: number[] | null,
): Promise<Array<{ id: number; title: string }>> {
  return db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(
      isNull(projects.deletedAt),
      eq(projects.isArchived, false),
      inArray(projects.scope, scopes),
      sql`coalesce(${tags.isClosed}, false) = false`,
      sql`coalesce(${tags.statusGroup}, '') not in ('cancelled', 'on_hold')`,
      ids === null ? sql`true` : inArray(projects.id, ids),
    ))
    .orderBy(projects.title);
}

/** پروژه‌های غیرِمنجمد از میانِ شناسه‌ها — جعبه‌های «نیازمندِ توجه» فقط این‌ها را می‌شمارند. */
export async function nonFrozenProjectIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: projects.id, isArchived: projects.isArchived, statusGroup: tags.statusGroup })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(inArray(projects.id, ids), isNull(projects.deletedAt)));
  return rows.filter((r) => !isFrozenProject(r)).map((r) => r.id);
}

/** تسک‌هایی که به این تسک وابسته‌اند — برای آزادکردنِ صف. */
export async function dependentsOf(taskId: number) {
  return db
    .select({ id: tasks.id, statusTagId: tasks.statusTagId, title: tasks.title, projectId: tasks.projectId })
    .from(tasks)
    .where(and(eq(tasks.dependsOn, taskId), isNull(tasks.deletedAt)));
}

/** شمارِ تسک‌های در انتظارِ بررسی به‌ازای پروژه. */
export async function reviewTaskCounts(
  projectIds: number[],
  /**
   * شمارِ کارتِ کارفرما: فقط آنچه خودش در صندوق می‌بیند — نه تسکِ خصوصی، نه
   * «پنهان از کارفرما» (مگر سپرده به خودش). ⚠️ پیش از این همه شمرده می‌شد و
   * عددِ کارت با فهرستِ صندوق نمی‌خواند.
   */
  clientViewerId: number | null = null,
): Promise<Map<number, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: tasks.projectId, n: sql<number>`count(*)::int` })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt), eq(tags.isReview, true),
      ...(clientViewerId !== null ? [
        eq(tasks.isPrivate, false),
        or(eq(tasks.clientHidden, false), eq(tasks.assignedTo, clientViewerId))!,
      ] : []),
    ))
    .groupBy(tasks.projectId);
  return new Map(rows.map((r) => [r.projectId, r.n]));
}

/** جمعِ دقیقه‌های کلِ تیم روی هر پروژه — ستونِ «ساعتِ تیم» ِ جدولِ کارفرما. */
export async function teamMinutesFor(projectIds: number[]): Promise<Map<number, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: timelogs.projectId, minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
    .from(timelogs)
    .where(inArray(timelogs.projectId, projectIds))
    .groupBy(timelogs.projectId);
  return new Map(rows.map((r) => [r.projectId!, r.minutes]));
}

/** مناقصه‌های موجود با نقش‌های اعلام‌شده و گروهِ وضعیت. */
export async function tenderProjectsWithRoles() {
  return db
    .select({
      id: projects.id,
      title: projects.title,
      tenderRoles: projects.tenderRoles,
      statusGroup: tags.statusGroup,
      scope: projects.scope,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(eq(projects.isTender, true), isNull(projects.deletedAt)));
}

/** نقش‌هایی که برنده دارند — `Bids::has_approved_for_role`. */
export async function approvedBidRoles(projectIds: number[]): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const rows = await db
    .select({ projectId: tenderBids.projectId, roleTagId: tenderBids.roleTagId })
    .from(tenderBids)
    .where(and(inArray(tenderBids.projectId, projectIds), eq(tenderBids.status, 'approved')));
  return new Set(rows.map((r) => `${r.projectId}:${r.roleTagId}`));
}

/** شمارِ پیشنهادهای زندهٔ کاربر روی هر پروژه — `Bids::count_for_user`. */
export async function myBidCounts(userId: number, projectIds: number[]): Promise<Map<number, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: tenderBids.projectId, n: sql<number>`count(*)::int` })
    .from(tenderBids)
    .where(and(
      inArray(tenderBids.projectId, projectIds),
      eq(tenderBids.userId, userId),
      inArray(tenderBids.status, ['pending', 'approved']),
    ))
    .groupBy(tenderBids.projectId);
  return new Map(rows.map((r) => [r.projectId, r.n]));
}

/** تگ‌های نقشِ کاربر. */
export async function userTagIds(userId: number): Promise<Set<number>> {
  const rows = await db.select({ tagId: tagRelations.tagId }).from(tagRelations)
    .where(and(eq(tagRelations.objectType, 'user'), eq(tagRelations.objectId, userId)));
  return new Set(rows.map((r) => r.tagId));
}

/**
 * جلساتِ پیشِ‌روی کاربر — پورتِ `Meetings::upcoming_for_user(uid, limit, days)`:
 * دعوت‌شده **یا** سازنده، از اکنون تا N روزِ بعد.
 */
export async function upcomingMeetingsForUser(userId: number, days: number, limit: number) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const rows = await db
    .selectDistinct({
      id: meetings.id,
      title: meetings.title,
      meetAt: meetings.meetAt,
      location: meetings.location,
      projectTitle: projects.title,
    })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(meetingAttendees, eq(meetingAttendees.meetingId, meetings.id))
    .where(and(
      or(eq(meetingAttendees.userId, userId), eq(meetings.createdBy, userId)),
      // ⚠️ عملگرهای drizzle، نه sql خام: تاریخ در sql خام به درایور می‌رسد و «Received an instance of Date» می‌دهد.
      gte(meetings.meetAt, now),
      lte(meetings.meetAt, until),
    ))
    .orderBy(meetings.meetAt)
    .limit(limit);
  return rows;
}

/* ------------------------------------------------------------------ *
 * متای صفحهٔ پروژه و پولِ عضو
 * ------------------------------------------------------------------ */

/** دقیقه‌های کاریِ یک کاربر روی پروژه — «ساعت کاری شما». */
export async function userMinutesOn(userId: number, projectId: number): Promise<number> {
  const rows = await db
    .select({ minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
    .from(timelogs)
    .where(and(eq(timelogs.userId, userId), eq(timelogs.projectId, projectId)));
  return rows[0]?.minutes ?? 0;
}

export async function projectTitles(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: projects.id, title: projects.title }).from(projects).where(inArray(projects.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** زیرپروژه‌ها (تغییر/نگهداری) — پورتِ `Projects::children`. */
export async function childProjects(projectId: number) {
  return db.select({ id: projects.id, title: projects.title }).from(projects)
    .where(and(eq(projects.parentId, projectId), isNull(projects.deletedAt)))
    .orderBy(projects.id);
}

/** پیشرفتِ پروژه روی **همهٔ** تسک‌ها — پورتِ `Tasks::progress` (نه فقط دیدنی‌های بیننده). */
export async function taskProgressFor(projectId: number): Promise<{ done: number; total: number }> {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where coalesce(${tags.statusGroup}, '') = 'complete')::int`,
    })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
  return { done: rows[0]?.done ?? 0, total: rows[0]?.total ?? 0 };
}

/** ردیف‌های پرداخت به یک عضو روی پروژه — پورتِ فهرستِ `member_payout` ِ تبِ مالیِ عضو. */
export async function myPayoutsOn(userId: number, projectId: number) {
  return db
    .select({
      id: projectPayments.id,
      paidAt: projectPayments.paidAt,
      amount: projectPayments.amount,
      amountSettled: projectPayments.amountSettled,
      currencyCode: currencies.code,
      note: projectPayments.note,
      receiptIds: ledger.receiptIds,
    })
    .from(projectPayments)
    .leftJoin(currencies, eq(currencies.id, projectPayments.currencyId))
    .leftJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
    .where(and(
      eq(projectPayments.projectId, projectId),
      eq(projectPayments.userId, userId),
      eq(projectPayments.direction, 'member_payout'),
    ))
    .orderBy(desc(projectPayments.id));
}

/**
 * پروژه‌هایی که از `since` به بعد فعالیت داشته‌اند — پورتِ
 * `Timelogs::project_ids_with_logs_since` + `Tasks/Comments::project_ids_with_activity_since`
 * + `post_modified`: ساعتِ ثبت‌شده، تسکِ ساخته/ویرایش‌شده، کامنتِ تازه، یا ویرایشِ خودِ پروژه.
 */
export async function activeProjectIdsSince(since: string): Promise<Set<number>> {
  const sinceAt = new Date(`${since}T00:00:00Z`);
  const [logs, taskRows, commentRows, edited] = await Promise.all([
    db.selectDistinct({ id: timelogs.projectId }).from(timelogs).where(gte(timelogs.logDate, since)),
    db.selectDistinct({ id: tasks.projectId }).from(tasks)
      .where(or(gte(tasks.updatedAt, sinceAt), gte(tasks.createdAt, sinceAt))),
    db.selectDistinct({ id: comments.projectId }).from(comments).where(gte(comments.createdAt, sinceAt)),
    db.select({ id: projects.id }).from(projects).where(gte(projects.updatedAt, sinceAt)),
  ]);
  const out = new Set<number>();
  for (const r of [...logs, ...taskRows, ...commentRows, ...edited]) if (r.id !== null) out.add(r.id);
  return out;
}

/** ریزِ ثبت‌های ساعتِ پروژه — پورتِ `Timelogs::for_project` (تازه‌تر اول، سقفِ ۵۰۰). */
export async function projectLogs(projectId: number, limit = 500) {
  return db
    .select({
      id: timelogs.id,
      logDate: timelogs.logDate,
      userId: timelogs.userId,
      userName: users.name,
      minutes: timelogs.minutes,
      description: timelogs.description,
    })
    .from(timelogs)
    .leftJoin(users, eq(users.id, timelogs.userId))
    .where(eq(timelogs.projectId, projectId))
    .orderBy(desc(timelogs.logDate), desc(timelogs.id))
    .limit(limit);
}
