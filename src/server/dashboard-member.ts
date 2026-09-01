import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { comments, projects, tags, tasks, timelogs } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { isFrozenProject } from '@/domain/projects/lifecycle';
import { taskProgress } from '@/domain/projects/deadline';
import { membershipProjectIds } from '@/server/projects/authority';
import * as repo from '@/server/projects/repository';

/**
 * داشبوردِ عضو و کارفرما — پورتِ `member_overview()` و `client_overview()`.
 *
 * ⚠️ چرا جداست: `getDashboard` با `assertCanView(actor, 'projects')` شروع
 * می‌شود، یعنی عضو و کارفرما — که مجوزِ **سراسری** ندارند و از راهِ عضویت
 * می‌آیند — به «دسترسی ندارید» می‌خوردند. در نسخهٔ قبلی این دو نقش اصلاً
 * وارد پنلِ ادمین نمی‌شوند؛ داشبوردِ خودشان را دارند با کارت‌های خودشان.
 *
 * ⚠️ تفاوتِ کلیدیِ دو نقش، **پول** است:
 *  - عضو: «Open projects only — minimal columns, **no price**»
 *  - کارفرما: قیمت، پرداختی و مانده را می‌بیند — صورت‌حسابِ خودش است.
 */

export interface MemberDashboardRow {
  id: number;
  title: string;
  deadline: string | null;
  regDate: string | null;
  statusName: string | null;
  statusGroup: string | null;
  /** نقش‌های خودِ کاربر روی این پروژه. */
  myRoles: string[];
  /** دقیقه‌های کاریِ خودِ کاربر روی این پروژه. */
  myMinutes: number;
  /** تسک‌های بازِ خودِ کاربر. */
  myOpenTasks: number;
  percent: number;
}

export interface MemberDashboard {
  kind: 'member' | 'client';
  stats: { projects: number; openTasks: number; commentsToReview: number; unread: number };
  rows: MemberDashboardRow[];
}

/**
 * پروژه‌های «منجمد» از جعبه‌های توجه بیرون می‌مانند — بایگانی/لغو/متوقف.
 * ⚠️ همان `non_frozen_ids()` نسخهٔ قبلی: تسکِ ریویوِ پروژهٔ بسته دیگر
 * کاری نیست که کسی بتواند انجامش دهد، و شمردنش فقط عدد را باد می‌کند.
 */
async function nonFrozenIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: projects.id,
      isArchived: projects.isArchived,
      statusGroup: tags.statusGroup,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(inArray(projects.id, ids), isNull(projects.deletedAt)));
  return rows.filter((r) => !isFrozenProject(r)).map((r) => r.id);
}

export async function getMemberDashboard(
  actor: Actor,
  kind: 'member' | 'client',
): Promise<MemberDashboard> {
  const ids = await membershipProjectIds(actor.id);
  if (ids.length === 0) {
    return {
      kind,
      stats: { projects: 0, openTasks: 0, commentsToReview: 0, unread: await unreadFor(actor) },
      rows: [],
    };
  }

  const activeIds = await nonFrozenIds(ids);
  const listed = await repo.listProjects(['company', 'private'], ids);

  const [myLogs, myOpen, reviewComments, unread] = await Promise.all([
    db.select({
      projectId: timelogs.projectId,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .where(and(eq(timelogs.userId, actor.id), inArray(timelogs.projectId, ids)))
      .groupBy(timelogs.projectId),

    /**
     * ⚠️ «تسکِ بازِ من» یعنی تسکی که به **خودم** اساین شده و تمام نشده —
     * نه هر تسکِ پروژه. نسخهٔ قبلی هم `count_open_for_user` را می‌شمارد.
     */
    db.select({
      projectId: tasks.projectId,
      count: sql<number>`count(*)::int`,
    })
      .from(tasks)
      .leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(
        inArray(tasks.projectId, ids),
        eq(tasks.assignedTo, actor.id),
        isNull(tasks.deletedAt),
        sql`coalesce(${tags.statusGroup}, '') <> 'complete'`,
      ))
      .groupBy(tasks.projectId),

    activeIds.length === 0 ? Promise.resolve([]) : db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(
        inArray(comments.projectId, activeIds),
        eq(comments.type, 'comment'),
        eq(comments.status, 'needs_review'),
      )),

    unreadFor(actor),
  ]);

  const minutesBy = new Map(myLogs.map((r) => [r.projectId, r.minutes]));
  const openBy = new Map(myOpen.map((r) => [r.projectId, r.count]));

  /**
   * نقشِ خودِ کاربر روی هر پروژه — از همان `members` ِ ردیفِ فهرست خوانده
   * می‌شود؛ کوئریِ جداگانه لازم نیست چون `listProjects` چیپ‌ها را می‌آورد.
   * ⚠️ ولی چیپ‌ها نامِ همه را دارند و ما فقط نقشِ خودمان را می‌خواهیم، پس
   * یک کوئریِ کوچکِ جدا می‌زنیم.
   */
  const myRoleRows = await repo.myRolesOn(actor.id, ids);

  const rows: MemberDashboardRow[] = listed.map((p) => ({
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
    kind,
    stats: {
      projects: rows.length,
      openTasks: [...openBy.values()].reduce((a, b) => a + b, 0),
      commentsToReview: reviewComments[0]?.count ?? 0,
      unread,
    },
    rows,
  };
}

/** همان تعریفِ صندوق: پیامی که بعد از رسیدِ خواندن آمده و از خودم نیست. */
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
