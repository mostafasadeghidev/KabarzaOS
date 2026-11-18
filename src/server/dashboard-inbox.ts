import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lte, ne, notExists, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { projects, tags, tasks, taskRoles, tenderBids, timelogs, userRoles, users } from '@/db/schema';
import { visibleScopes } from '@/domain/access/guard';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { listRequests, listUnpaidUnits, payoutLevel } from '@/server/finance/payouts';
import { myOpenCommentThreads } from '@/server/projects/service';
import { getOverall } from '@/server/reports/service';

/**
 * داشبوردِ «اول کار» (نمونهٔ محلی) — صفِ کارهایی که منتظرِ تصمیمِ همین بیننده‌اند، با خودِ موارد
 * (نه فقط شمار) تا از همان‌جا انجام شوند، و «پول در یک نگاه».
 *
 * ⚠️ هر بخش از همان سرویس و گاردِ صفحهٔ خودش می‌آید (درخواستِ پرداخت ← listRequests با سطحِ
 * پرداخت، کامنت ← myOpenCommentThreads، پول ← getOverall)؛ بخشی که بیننده حقش را ندارد خالی می‌ماند.
 */

export interface InboxReviewTask {
  id: number; number: number | null; title: string; projectId: number; projectTitle: string;
  assigneeName: string | null; since: string | null;
}
export interface InboxRequest {
  id: number; userId: number; userName: string | null; projectId: number | null; projectTitle: string | null;
  amount: string; currencyCode: string | null; createdAt: string | null;
}
export interface InboxComment {
  rootId: number; projectId: number; projectTitle: string; authorName: string | null; excerpt: string; createdAt: string | null;
}
export interface InboxUnit { id: number; userId: number; userName: string | null; projectId: number; projectTitle: string | null; amount: string; currencyCode: string | null; date: string }
export interface InboxTender { projectId: number; title: string; bids: number }
export interface InboxUnassigned { id: number; number: number | null; title: string; projectId: number; projectTitle: string; dueDate: string | null }
export interface InboxNoLog { userId: number; name: string }
export interface WeekItem { date: string; kind: 'project' | 'task'; id: number; title: string; projectId: number; projectTitle?: string; overdue: boolean }
export interface Capacity { userId: number; name: string; openTasks: number; minutes: number }
export interface Money { clientDue: string; memberDebt: string; profit: string; projectCount: number }

export async function getDashboardInbox(actor: Actor) {
  const scopes = visibleScopes(actor);

  const reviewRows = await db
    .select({
      id: tasks.id, number: tasks.number, title: tasks.title, projectId: tasks.projectId,
      projectTitle: projects.title, assigneeName: users.name, updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(tags, eq(tags.id, tasks.statusTagId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .where(and(
      eq(tags.isReview, true), isNull(tasks.deletedAt), isNull(projects.deletedAt),
      eq(projects.isArchived, false), inArray(projects.scope, scopes),
    ))
    // قدیمی‌ترین اول — همان که بیشتر منتظر مانده.
    .orderBy(asc(tasks.updatedAt))
    .limit(30);

  const review: InboxReviewTask[] = reviewRows.map((r) => ({
    id: r.id, number: r.number, title: r.title, projectId: r.projectId, projectTitle: r.projectTitle,
    assigneeName: r.assigneeName, since: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));

  // تصمیمِ درخواستِ پرداخت فقط با سطحِ «کامل» (همان قاعدهٔ صفحهٔ مالی).
  const requests: InboxRequest[] = canViewSection(actor, 'finance') && payoutLevel(actor) === 'full'
    ? (await listRequests(actor, 'pending')).map((r) => ({
      id: r.id, userId: r.userId, userName: r.userName, projectId: r.projectId, projectTitle: r.projectTitle,
      amount: String(r.amount), currencyCode: r.currencyCode, createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    }))
    : [];

  const comments: InboxComment[] = (await myOpenCommentThreads(actor)).slice(0, 12).map((c) => ({
    rootId: c.rootId, projectId: c.projectId, projectTitle: c.projectTitle, authorName: c.authorName,
    excerpt: c.excerpt, createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
  }));

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayIso = iso(new Date());
  const yesterday = iso(new Date(Date.now() - 86400000));
  const in7 = iso(new Date(Date.now() + 7 * 86400000));
  const weekAgo = iso(new Date(Date.now() - 6 * 86400000));

  const visibleProjects = await db
    .select({ id: projects.id, title: projects.title, deadline: projects.deadline, isTender: projects.isTender })
    .from(projects)
    .where(and(isNull(projects.deletedAt), eq(projects.isArchived, false), inArray(projects.scope, scopes)));
  const pids = visibleProjects.map((p) => p.id);
  const titleOf = new Map(visibleProjects.map((p) => [p.id, p.title]));
  const managesProjects = canManageSection(actor, 'projects');

  // ۱) کارکردهای پرداخت‌نشده — همان فهرستِ صفحهٔ مالی.
  const units: InboxUnit[] = canViewSection(actor, 'finance')
    ? (await listUnpaidUnits(actor)).slice(0, 15).map((u) => ({
      id: u.id, userId: u.userId, userName: u.userName, projectId: u.projectId, projectTitle: u.projectTitle,
      amount: u.remaining ?? String(u.amount), currencyCode: u.currencyCode, date: u.entryDate,
    }))
    : [];

  // ۲) مناقصهٔ باز با پیشنهادِ در انتظار.
  const tenderIds = visibleProjects.filter((p) => p.isTender).map((p) => p.id);
  const tenders: InboxTender[] = tenderIds.length === 0 || !managesProjects ? [] : (await db
    .select({ projectId: tenderBids.projectId, n: sql<number>`count(*)::int` })
    .from(tenderBids)
    .where(and(inArray(tenderBids.projectId, tenderIds), eq(tenderBids.status, 'pending')))
    .groupBy(tenderBids.projectId))
    .map((row) => ({ projectId: row.projectId, title: titleOf.get(row.projectId) ?? '', bids: row.n }));

  // ۳) تسکِ باز بی‌مسئول و بی‌نقش.
  const openTask = or(isNull(tags.statusGroup), ne(tags.statusGroup, 'complete'));
  const unassignedRows = pids.length === 0 || !managesProjects ? [] : await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, projectId: tasks.projectId, dueDate: tasks.dueDate })
    .from(tasks)
    .leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(
      inArray(tasks.projectId, pids), isNull(tasks.deletedAt), isNull(tasks.assignedTo), openTask,
      notExists(db.select({ x: sql`1` }).from(taskRoles).where(eq(taskRoles.taskId, tasks.id))),
    ))
    .orderBy(asc(tasks.id))
    .limit(15);
  const unassigned: InboxUnassigned[] = unassignedRows.map((row) => ({ ...row, projectTitle: titleOf.get(row.projectId) ?? '' }));

  // ۴) اعضای فعالی که دیروز ساعتی ثبت نکرده‌اند — یادآوری فقط از مدیرِ اعضا.
  const activeMembers = await db.select({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'member')))
    .where(and(eq(users.memberState, 'active'), isNull(users.deletedAt)));
  const memberIds = activeMembers.map((m) => m.userId);
  const loggedYesterday = new Set(memberIds.length === 0 ? [] : (await db
    .selectDistinct({ userId: timelogs.userId }).from(timelogs)
    .where(and(inArray(timelogs.userId, memberIds), eq(timelogs.logDate, yesterday)))).map((row) => row.userId));
  const noLog: InboxNoLog[] = canManageSection(actor, 'members')
    ? activeMembers.filter((m) => !loggedYesterday.has(m.userId)).map((m) => ({ userId: m.userId, name: m.name }))
    : [];

  // ۵) این هفتهٔ من: ددلاینِ پروژه‌ها و تسک‌های باز تا ۷ روزِ آینده (و گذشته‌های ۶ روزِ اخیر).
  const taskDues = pids.length === 0 ? [] : await db
    .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, dueDate: tasks.dueDate })
    .from(tasks).leftJoin(tags, eq(tags.id, tasks.statusTagId))
    .where(and(inArray(tasks.projectId, pids), isNull(tasks.deletedAt), gte(tasks.dueDate, weekAgo), lte(tasks.dueDate, in7), openTask))
    .limit(40);
  const week: WeekItem[] = [
    ...visibleProjects.filter((p) => p.deadline && p.deadline <= in7 && p.deadline >= weekAgo)
      .map((p) => ({ date: p.deadline!, kind: 'project' as const, id: p.id, title: p.title, projectId: p.id, overdue: p.deadline! < todayIso })),
    ...taskDues.map((tk) => ({
      date: tk.dueDate!, kind: 'task' as const, id: tk.id, title: tk.title, projectId: tk.projectId,
      projectTitle: titleOf.get(tk.projectId), overdue: tk.dueDate! < todayIso,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // ۶) ظرفیتِ تیم: تسکِ باز و ساعتِ ۷ روزِ اخیرِ هر عضوِ فعال.
  const [openByUser, minutesByUser] = memberIds.length === 0 ? [[], []] : await Promise.all([
    db.select({ userId: tasks.assignedTo, n: sql<number>`count(*)::int` }).from(tasks)
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(inArray(tasks.assignedTo, memberIds), isNull(tasks.deletedAt), openTask))
      .groupBy(tasks.assignedTo),
    db.select({ userId: timelogs.userId, m: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` }).from(timelogs)
      .where(and(inArray(timelogs.userId, memberIds), gte(timelogs.logDate, weekAgo)))
      .groupBy(timelogs.userId),
  ]);
  const openOf = new Map(openByUser.map((row) => [row.userId, row.n]));
  const minOf = new Map(minutesByUser.map((row) => [row.userId, row.m]));
  const capacity: Capacity[] = canViewSection(actor, 'members') || managesProjects
    ? activeMembers
      .map((m) => ({ userId: m.userId, name: m.name, openTasks: openOf.get(m.userId) ?? 0, minutes: minOf.get(m.userId) ?? 0 }))
      .sort((a, b) => b.openTasks - a.openTasks || b.minutes - a.minutes)
    : [];

  // ۷) کامنت‌هایی که آخرین پیامشان از کارفرماست — «کارفرما منتظرِ پاسخ».
  const clientIds = new Set((await db.select({ userId: userRoles.userId }).from(userRoles)
    .where(eq(userRoles.role, 'client'))).map((row) => row.userId));
  const clientWaiting: InboxComment[] = (await myOpenCommentThreads(actor))
    .filter((c) => c.authorId !== null && clientIds.has(c.authorId))
    .slice(0, 8)
    .map((c) => ({
      rootId: c.rootId, projectId: c.projectId, projectTitle: c.projectTitle, authorName: c.authorName, excerpt: c.excerpt,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    }));

  let money: Money | null = null;
  if (canViewSection(actor, 'reports')) {
    const o = await getOverall(actor);
    money = { clientDue: o.clientDue, memberDebt: o.memberDebt, profit: o.profit, projectCount: o.projectCount };
  }

  return { review, requests, comments, money, units, tenders, unassigned, noLog, week, capacity, clientWaiting };
}

/**
 * شمارِ سبکِ «منتظرِ شما» برای نشانِ روی منوی «نمای کلی» — فقط بازبینی‌ها و درخواست‌های پرداختِ در
 * انتظار (دو شمارشِ سبک)، نه کلِ داده‌های داشبورد؛ روی **هر** صفحه اجرا می‌شود.
 */
export async function inboxCount(actor: Actor): Promise<number> {
  if (!canViewSection(actor, 'projects')) return 0;
  const scopes = visibleScopes(actor);
  const [review] = await db.select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(tags, eq(tags.id, tasks.statusTagId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tags.isReview, true), isNull(tasks.deletedAt), isNull(projects.deletedAt),
      eq(projects.isArchived, false), inArray(projects.scope, scopes)));
  let requests = 0;
  if (canViewSection(actor, 'finance') && payoutLevel(actor) === 'full') {
    requests = (await listRequests(actor, 'pending')).length;
  }
  return (review?.n ?? 0) + requests;
}
