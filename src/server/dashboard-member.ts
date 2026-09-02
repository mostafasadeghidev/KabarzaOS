import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { comments, currencies } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { isFrozenProject, isOpenProject } from '@/domain/projects/lifecycle';
import { taskProgress } from '@/domain/projects/deadline';
import { isOpenTask } from '@/domain/projects/visibility';
import { summarizeProject, type PaymentStatus } from '@/domain/team-money/payments';
import { membershipProjectIds } from '@/server/projects/authority';
import * as repo from '@/server/projects/repository';

/**
 * داشبوردِ عضو / کارفرما — پورتِ `member_overview()` / `client_overview()` /
 * `member_tenders_section()` / `meetings_overview_card()` ِ نسخهٔ قبلی.
 *
 * ⚠️ هر دو بخش با هم رندر می‌شوند اگر کاربر هر دو نقش را دارد؛ پیش از این
 * عضوی که کارفرمای پروژه‌ای هم بود کلِ بخشِ کارفرما را از دست می‌داد.
 * ⚠️ مناقصه‌هایی که عضو فقط «واجدِ شرایطشان» است، دیگر در «پروژه‌های باز» و
 * شمارنده‌ها نمی‌آیند — بخشِ جدای خودشان را دارند.
 */

export interface MemberDashboardRow {
  id: number;
  title: string;
  deadline: string | null;
  regDate: string | null;
  statusName: string | null;
  statusGroup: string | null;
  myRoles: string[];
  myMinutes: number;
  /** تسک‌های بازِ دیدنیِ کاربر (نه بسته، نه در انتظارِ بررسی). */
  myOpenTasks: number;
  percent: number;
}

export interface MemberSection {
  stats: { projects: number; openTasks: number; commentsToReview: number };
  /** فقط پروژه‌های **باز و غیرِمنجمد** — پورتِ «پروژه‌های باز شما». */
  rows: MemberDashboardRow[];
}

export interface ClientRow {
  id: number;
  title: string;
  regDate: string | null;
  deadline: string | null;
  statusName: string | null;
  statusGroup: string | null;
  price: string;
  currencyCode: string | null;
  paymentStatus: PaymentStatus;
  totalDue: number;
  paid: string;
  remaining: number;
  taskCount: number;
  percent: number;
  teamMinutes: number;
}

export interface ClientSection {
  stats: { projects: number; reviewTasks: number; commentsToReview: number };
  rows: ClientRow[];
}

export interface TenderRow {
  id: number;
  title: string;
  roleNames: string[];
  myBids: number;
}

export interface MeetingRow {
  id: number;
  title: string;
  meetAt: Date;
  location: string;
  projectTitle: string | null;
}

export interface MemberDashboard {
  member: MemberSection | null;
  client: ClientSection | null;
  tenders: TenderRow[];
  meetings: MeetingRow[];
  unread: number;
}

async function commentsNeedingReview(projectIds: number[]): Promise<number> {
  if (projectIds.length === 0) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(
      inArray(comments.projectId, projectIds),
      eq(comments.type, 'comment'),
      eq(comments.status, 'needs_review'),
    ));
  return rows[0]?.count ?? 0;
}

async function memberSection(actor: Actor): Promise<MemberSection> {
  const ids = await membershipProjectIds(actor.id, ['member']);
  if (ids.length === 0) return { stats: { projects: 0, openTasks: 0, commentsToReview: 0 }, rows: [] };

  const [listed, activeIds, visibleTasks, myRoleRows] = await Promise.all([
    repo.listProjects(['company', 'private'], ids),
    repo.nonFrozenProjectIds(ids),
    // پورتِ `count_open_for_user`: تسک‌های دیدنیِ من (نقشی‌های ادعانشده هم)، نه بسته، نه در بررسی.
    repo.openTasksForUser(actor.id, ['company', 'private']),
    repo.myRolesOn(actor.id, ids),
  ]);
  const openBy = new Map<number, number>();
  for (const t of visibleTasks) {
    if (!isOpenTask(t) || !ids.includes(t.projectId)) continue;
    openBy.set(t.projectId, (openBy.get(t.projectId) ?? 0) + 1);
  }
  const minutesRows = await db.execute(sql`
    select project_id as id, coalesce(sum(minutes), 0)::int as minutes
    from timelogs where user_id = ${actor.id} and project_id in ${sql.raw(`(${ids.join(',')})`)}
    group by project_id
  `) as unknown as Array<{ id: number; minutes: number }>;
  const minutesBy = new Map(minutesRows.map((r) => [Number(r.id), Number(r.minutes)]));

  const rows: MemberDashboardRow[] = listed
    // پورتِ «پروژه‌های باز شما»: `is_open` ∧ غیرِمنجمد؛ بسته/بایگانی/لغو/توقف بیرون می‌مانند.
    .filter((p) => isOpenProject({ isClosed: p.isClosed }) && !isFrozenProject(p))
    .map((p) => ({
      id: p.id,
      title: p.title,
      deadline: p.deadline,
      regDate: p.regDate,
      statusName: p.statusName,
      statusGroup: p.statusGroup,
      myRoles: myRoleRows.get(p.id) ?? [],
      myMinutes: minutesBy.get(p.id) ?? 0,
      myOpenTasks: openBy.get(p.id) ?? 0,
      percent: taskProgress(p.doneTaskCount, p.totalTaskCount),
    }));

  return {
    stats: {
      // شمارِ پروژه‌ها **همه** را می‌شمارد (بسته هم)، مثلِ افزونه.
      projects: ids.length,
      openTasks: [...openBy.values()].reduce((a, n) => a + n, 0),
      commentsToReview: await commentsNeedingReview(activeIds),
    },
    rows,
  };
}

async function clientSection(actor: Actor): Promise<ClientSection> {
  const ids = await membershipProjectIds(actor.id, ['client']);
  if (ids.length === 0) return { stats: { projects: 0, reviewTasks: 0, commentsToReview: 0 }, rows: [] };

  const [listed, activeIds, teamMinutes, currencyRows] = await Promise.all([
    repo.listProjects(['company', 'private'], ids),
    repo.nonFrozenProjectIds(ids),
    repo.teamMinutesFor(ids),
    db.select({ id: currencies.id, code: currencies.code }).from(currencies),
  ]);
  const codeOf = new Map(currencyRows.map((c) => [c.id, c.code]));
  const reviewCounts = await repo.reviewTaskCounts(activeIds);
  const summaries = await Promise.all(listed.map((p) => repo.financeSummary(p.id)));

  const rows: ClientRow[] = listed.map((p, i) => {
    const s = summaries[i]!;
    // پورتِ `Payments::summary`: بدهی = قیمت + هزینه‌های قابلِ صورتحساب؛ پرداختی = دریافتی‌ها.
    const summary = summarizeProject(p.price, s.projectExpense, s.incoming);
    return {
      id: p.id,
      title: p.title,
      regDate: p.regDate,
      deadline: p.deadline,
      statusName: p.statusName,
      statusGroup: p.statusGroup,
      price: p.price,
      currencyCode: p.currencyId ? (codeOf.get(p.currencyId) ?? null) : null,
      paymentStatus: summary.status,
      totalDue: summary.totalDue,
      paid: summary.paid,
      remaining: summary.remaining,
      taskCount: p.totalTaskCount,
      percent: taskProgress(p.doneTaskCount, p.totalTaskCount),
      teamMinutes: teamMinutes.get(p.id) ?? 0,
    };
  });

  return {
    stats: {
      projects: ids.length,
      // پورتِ `count_review_for_projects(active)`: تسک‌های در انتظارِ بررسیِ کارفرما — فراخوانِ اصلیِ او.
      reviewTasks: [...reviewCounts.values()].reduce((a, b) => a + b, 0),
      commentsToReview: await commentsNeedingReview(activeIds),
    },
    rows,
  };
}

/** پورتِ `member_tenders_section`: مناقصه‌های بازی که هنوز نقشِ بازی برای من دارند. */
async function tenderSection(actor: Actor): Promise<TenderRow[]> {
  const [tenders, myTags, roleTags] = await Promise.all([
    repo.tenderProjectsWithRoles(),
    repo.userTagIds(actor.id),
    repo.memberRoleTags(),
  ]);
  if (myTags.size === 0) return [];
  const open = tenders.filter((p) => p.statusGroup === 'lead');
  const approved = await repo.approvedBidRoles(open.map((p) => p.id));
  const roleName = new Map(roleTags.map((r) => [r.id, r.name]));
  const eligible = open
    .map((p) => ({
      p,
      roles: Object.keys((p.tenderRoles ?? {}) as Record<string, unknown>)
        .map(Number)
        .filter((rid) => myTags.has(rid) && !approved.has(`${p.id}:${rid}`)),
    }))
    .filter((x) => x.roles.length > 0);
  const bids = await repo.myBidCounts(actor.id, eligible.map((x) => x.p.id));
  return eligible.map(({ p, roles }) => ({
    id: p.id,
    title: p.title,
    roleNames: roles.map((rid) => roleName.get(rid) ?? String(rid)),
    myBids: bids.get(p.id) ?? 0,
  }));
}

export async function getMemberDashboard(actor: Actor): Promise<MemberDashboard> {
  const isMember = actor.roles.includes('member');
  const isClient = actor.roles.includes('client');
  const [member, client, tenders, meetings, unread] = await Promise.all([
    isMember ? memberSection(actor) : Promise.resolve(null),
    isClient ? clientSection(actor) : Promise.resolve(null),
    isMember ? tenderSection(actor) : Promise.resolve([] as TenderRow[]),
    // پورتِ «جلسات این هفته» — برای **همه**، هفت روزِ آینده، حداکثر شش تا.
    repo.upcomingMeetingsForUser(actor.id, 7, 6),
    unreadFor(actor),
  ]);
  return { member, client, tenders, meetings, unread };
}

async function unreadFor(actor: Actor): Promise<number> {
  const rows = await db.execute(sql`
    select count(m.id)::int as n
    from thread_users tu
    join messages m on m.thread_id = tu.thread_id
      and m.id > coalesce(tu.last_read_message_id, 0)
      and m.from_user_id <> ${actor.id}
    where tu.user_id = ${actor.id}
  `);
  return Number((rows as unknown as Array<{ n: number }>)[0]?.n ?? 0);
}
