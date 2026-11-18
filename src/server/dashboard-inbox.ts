import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { projects, tags, tasks, users } from '@/db/schema';
import { visibleScopes } from '@/domain/access/guard';
import { canViewSection, type Actor } from '@/domain/access/permissions';
import { listRequests, payoutLevel } from '@/server/finance/payouts';
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

  let money: Money | null = null;
  if (canViewSection(actor, 'reports')) {
    const o = await getOverall(actor);
    money = { clientDue: o.clientDue, memberDebt: o.memberDebt, profit: o.profit, projectCount: o.projectCount };
  }

  return { review, requests, comments, money };
}
