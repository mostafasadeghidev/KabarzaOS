import { and, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getSystemConfig } from '@/server/settings/system-service';
import { db } from '@/db/client';
import {
  projects, tasks, tags, projectMembers, users, timelogs, comments,
  paymentRequests, unitEntries, tenderBids, meetings, absences, availabilitySlots,
} from '@/db/schema';
import { assertCanView, visibleScopes } from '@/domain/access/guard';
import { canViewSection, type Actor } from '@/domain/access/permissions';
import { weekdayIndex } from '@/domain/availability/weekly';
import { getT } from '@/i18n/server';
import { isDeadlineSoon, isOverdueProject } from '@/domain/projects/lifecycle';

/**
 * دادهٔ داشبورد — ساختار عیناً از نسخهٔ قبلی گرفته شده:
 *   ۱) منتظرِ اقدام (گروه‌بندی‌شده)  ۲) پیشرفتِ این هفته با مقایسه
 *   ۳) امروز  ۴) ریسک و نیازمندِ توجه
 *
 * همهٔ شمارش‌ها از scopeهای مجازِ بازیگر می‌آیند
 * (R-RBAC-12: فیلدِ مشتق همان گاردِ رکورد را می‌خواهد).
 */

export interface ActionCard { value: number; label: string; href: string | null }
export interface ActionGroup { title: string; cards: ActionCard[] }
export interface ProgressCard { value: string; label: string; delta: number; href: string | null }
export interface RiskItem { id: number; title: string; badge: string }
export interface StatusSlice { status: string; count: number }
export interface MemberHours { name: string; hours: number }
export interface WeeklyPoint { label: string; hours: number }

/**
 * بازهٔ هفتهٔ جاری و هفتهٔ قبل — از روزِ شروعِ هفتهٔ **تنظیمات**.
 * ⚠️ پیش از این شنبه هاردکد بود و با نمای «در دسترس بودن» که تنظیم را
 * رعایت می‌کند، دو هفتهٔ متفاوت گزارش می‌شد. شاخصِ ایرانی: ۰ = شنبه.
 */
async function weekRanges() {
  const { weekStart } = await getSystemConfig();
  const start0 = weekStart >= 0 && weekStart <= 6 ? weekStart : 0;
  const now = new Date();
  const todayIdx = (now.getUTCDay() + 1) % 7; // ایرانی: شنبه = ۰
  const sinceStart = (todayIdx - start0 + 7) % 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceStart));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
  return {
    from: iso(start),
    to: iso(shift(start, 6)),
    prevFrom: iso(shift(start, -7)),
    prevTo: iso(shift(start, -1)),
  };
}

export async function getDashboard(actor: Actor) {
  assertCanView(actor, 'projects');
  /**
   * ⚠️ getT() و نه t() ِ همگام: اینجا **واکشیِ داده** است، نه رندر. در
   * App Router چیدمان و صفحه موازی اجرا می‌شوند، پس ظرفِ ترجمهٔ چیدمان
   * هنوز پر نشده و t() فارسیِ مبدأ می‌داد — همان باگی که برچسب‌های
   * «۳۹ روز مانده» را در پنلِ انگلیسی فارسی نگه می‌داشت.
   */
  const t = await getT();
  const scopes = visibleScopes(actor);
  const week = await weekRanges();
  const today = new Date().toISOString().slice(0, 10);

  const projectRows = await db
    .select({
      id: projects.id,
      title: projects.title,
      deadline: projects.deadline,
      statusGroup: tags.statusGroup,
      isArchived: projects.isArchived,
      isTender: projects.isTender,
    })
    .from(projects)
    .leftJoin(tags, eq(tags.id, projects.statusTagId))
    .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes)));

  const active = projectRows.filter((p) => !p.isArchived);
  const ids = active.map((p) => p.id);
  const inProjects = ids.length ? inArray(tasks.projectId, ids) : sql`false`;
  const inComments = ids.length ? inArray(comments.projectId, ids) : sql`false`;
  const n = sql<number>`count(*)::int`;
  const one = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;

  const canFinance = canViewSection(actor, 'finance');
  const canMessages = canViewSection(actor, 'messages');

  /* ---------------- منتظرِ اقدام ---------------- */
  const [pendingPayouts, unpaidUnits, tasksInReview, commentsOpen, pendingBids] = await Promise.all([
    // ⚠️ R-RBAC-06 — بدونِ دسترسیِ مالی حتی **شمارش** هم خوانده نمی‌شود:
    // «۳ درخواستِ پرداختِ در انتظار» خودش داده است، نه فقط یک لینک.
    canFinance
      ? one(db.select({ n }).from(paymentRequests).where(eq(paymentRequests.status, 'pending')))
      : Promise.resolve(0),
    canFinance
      ? one(db.select({ n }).from(unitEntries).where(eq(unitEntries.status, 'unpaid')))
      : Promise.resolve(0),
    one(db.select({ n }).from(tasks).leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(inProjects, isNull(tasks.deletedAt), eq(tags.isReview, true)))),
    one(db.select({ n }).from(comments)
      // ⚠️ کامنت با `needs_review` نوشته می‌شود، نه `open` — با `open` این کارت همیشه صفر بود.
      .where(and(inComments, eq(comments.type, 'comment'), eq(comments.status, 'needs_review')))),
    // پورتِ `bids_pending_ids()`: مناقصه‌های **باز** (گروهِ lead) با دستِ‌کم یک پیشنهادِ
    // در انتظار و بدونِ برنده — نه شمارِ پیشنهادها روی هر مناقصه‌ای.
    one(db.execute(sql`
      select count(*)::int as n from projects p
      join tags s on s.id = p.status_tag_id
      where p.deleted_at is null and p.is_tender = true and s.status_group = 'lead'
        and exists (select 1 from tender_bids b where b.project_id = p.id and b.status = 'pending')
        and not exists (select 1 from tender_bids b where b.project_id = p.id and b.status = 'approved')
    `) as unknown as Promise<Array<{ n: number }>>),
  ]);

  const actionGroups: ActionGroup[] = [
    {
      title: 'نیازمند بررسی',
      cards: [
        // معادلِ `class-focus-page.php` — هر کارت به تبِ متناظرِ پروژه‌ها می‌رود،
        // نه به فهرستِ کامل.
        { value: tasksInReview, label: 'تسک‌های نیاز به ریویو', href: '/tasks' },
        { value: commentsOpen, label: 'کامنت‌های نیازمند بررسی', href: '/projects?tab=review' },
        { value: pendingBids, label: 'مناقصه‌های منتظرِ تصمیم', href: '/projects?tab=tender' },
      ],
    },
  ];
  if (canFinance) {
    actionGroups.unshift({
      title: 'مالی',
      cards: [
        { value: pendingPayouts, label: 'درخواست‌های پرداختِ در انتظار', href: '/finance' },
        { value: unpaidUnits, label: 'کارکردهای پرداخت‌نشده', href: '/finance' },
      ],
    });
  }
  if (canMessages) {
    /**
     * پیام‌های خوانده‌نشده — همان تعریفِ صندوق: پیامی که بعد از رسیدِ خواندن
     * آمده و **فرستنده‌اش خودم نیستم**.
     * ⚠️ بدونِ شرطِ فرستنده، پیامِ خودِ کاربر هم خوانده‌نشده شمرده می‌شد.
     */
    const unreadRows = await db.execute(sql`
      select count(m.id)::int as n
      from thread_users tu
      join messages m on m.thread_id = tu.thread_id
        and m.id > coalesce(tu.last_read_message_id, 0)
        and m.from_user_id <> ${actor.id}
      where tu.user_id = ${actor.id}
    `);
    const unread = Number(
      (unreadRows as unknown as Array<{ n: number }>)[0]?.n ?? 0,
    );

    actionGroups.push({
      title: 'پیام‌ها',
      cards: [{ value: unread, label: 'پیام‌های خوانده‌نشده', href: '/messages' }],
    });
  }

  /* ---------------- پیشرفتِ این هفته ---------------- */
  const doneTasks = (from: string, to: string) =>
    one(db.select({ n }).from(tasks).leftJoin(tags, eq(tags.id, tasks.statusTagId))
      .where(and(inProjects, isNull(tasks.deletedAt), eq(tags.statusGroup, 'complete'),
        between(sql`${tasks.updatedAt}::date`, from, to))));

  const resolvedComments = (from: string, to: string) =>
    one(db.select({ n }).from(comments)
      .where(and(inComments, eq(comments.status, 'done'),
        between(sql`${comments.closedAt}::date`, from, to))));

  const loggedMinutes = async (from: string, to: string) => {
    const rows = await db
      .select({ n: sql<number>`coalesce(sum(${timelogs.minutes}),0)::int` })
      .from(timelogs)
      .where(and(ids.length ? inArray(timelogs.projectId, ids) : sql`false`,
        between(timelogs.logDate, from, to)));
    return rows[0]?.n ?? 0;
  };

  const [tNow, tPrev, cNow, cPrev, mNow, mPrev] = await Promise.all([
    doneTasks(week.from, week.to), doneTasks(week.prevFrom, week.prevTo),
    resolvedComments(week.from, week.to), resolvedComments(week.prevFrom, week.prevTo),
    loggedMinutes(week.from, week.to), loggedMinutes(week.prevFrom, week.prevTo),
  ]);

  const progress: ProgressCard[] = [
    { value: String(tNow), label: 'تسکِ تمام‌شده', delta: tNow - tPrev, href: '/projects' },
    { value: String(cNow), label: 'کامنتِ حل‌شده', delta: cNow - cPrev, href: null },
    { value: String(Math.round(mNow / 60)), label: 'ساعتِ کارِ ثبت‌شده', delta: Math.round((mNow - mPrev) / 60), href: '/hours' },
  ];

  /* ---------------- امروز ---------------- */
  /**
   * کسانی که **امروز** برنامهٔ کاری دارند — پورتِ `users_available_on()`.
   * ⚠️ روزِ هفته ایرانی است (۰ = شنبه)، نه `getDay()` ِ جاوااسکریپت.
   */
  const todayWeekday = weekdayIndex(new Date());

  const [weekMeetings, awayToday, activeTeam, assignedMembers, scheduledToday] = await Promise.all([
    canViewSection(actor, 'meetings')
      ? db.select({ id: meetings.id, title: meetings.title, meetAt: meetings.meetAt })
          .from(meetings)
          .where(between(sql`${meetings.meetAt}::date`, week.from, week.to))
          .orderBy(meetings.meetAt).limit(5)
      : Promise.resolve([]),
    db.select({ userId: absences.userId, name: users.name })
      .from(absences).innerJoin(users, eq(users.id, absences.userId))
      .where(and(sql`${absences.fromDate} <= ${today}`, sql`${absences.toDate} >= ${today}`)),
    one(db.select({ n }).from(users).where(and(eq(users.memberState, 'active'), isNull(users.deletedAt)))),
    one(db.select({ n: sql<number>`count(distinct ${projectMembers.userId})::int` })
      .from(projectMembers)
      .where(ids.length ? inArray(projectMembers.projectId, ids) : sql`false`)),
    db.selectDistinct({ userId: availabilitySlots.userId, name: users.name })
      .from(availabilitySlots)
      .innerJoin(users, eq(users.id, availabilitySlots.userId))
      .where(and(
        eq(availabilitySlots.weekday, todayWeekday),
        eq(users.memberState, 'active'),
        isNull(users.deletedAt),
      ))
      .orderBy(users.name),
  ]);

  /**
   * ⚠️ «در دسترس» = برنامه دارد **و** مرخصی نیست. بدونِ کسرِ مرخصی، کسی که
   * امروز مرخصی گرفته هم «در دسترس» نشان داده می‌شد — دقیقاً همان اشتباهی
   * که نسخهٔ قبلی با `array_diff` جلویش را می‌گیرد.
   */
  const awayIds = new Set(awayToday.map((a) => a.userId));
  const availableToday = scheduledToday.filter((u) => !awayIds.has(u.userId));

  /* ---------------- ریسک و نیازمندِ توجه ---------------- */
  const openTaskRows = ids.length
    ? await db.select({ projectId: tasks.projectId, n })
        .from(tasks).leftJoin(tags, eq(tags.id, tasks.statusTagId))
        .where(and(inProjects, isNull(tasks.deletedAt), sql`coalesce(${tags.statusGroup},'') <> 'complete'`))
        .groupBy(tasks.projectId)
    : [];
  const openByProject = new Map(openTaskRows.map((r) => [r.projectId, r.n]));
  const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

  // پورتِ `overdue_ids()` / `deadline_soon_ids()`: منجمد (کنسل/نگه‌داشته) بیرون، تکمیل‌شده داخل.
  const overdue: RiskItem[] = active
    .filter((p) => isOverdueProject(p, today))
    .map((p) => ({ id: p.id, title: p.title, badge: t('{n} روز تأخیر', { n: dayDiff(today, p.deadline!) }) }));

  const soon: RiskItem[] = active
    .filter((p) => isDeadlineSoon(p, today))
    .map((p) => {
      const d = dayDiff(p.deadline!, today);
      return { id: p.id, title: p.title, badge: d === 0 ? t('امروز') : t('{n} روز مانده', { n: d }) };
    });

  /** پروژهٔ راکد: در حال انجام ولی بدونِ تسکِ باز. */
  const stalled: RiskItem[] = active
    .filter((p) => p.statusGroup === 'in_progress' && (openByProject.get(p.id) ?? 0) === 0)
    .map((p) => ({ id: p.id, title: p.title, badge: t('بدونِ تسکِ باز') }));

  const openTenders: RiskItem[] = active
    .filter((p) => p.isTender && p.statusGroup === 'lead')
    .map((p) => ({ id: p.id, title: p.title, badge: 'مناقصهٔ باز' }));

  /* ---------------- نمودارها ---------------- */

  /** توزیعِ وضعیتِ پروژه‌ها. */
  const statusCounts = new Map<string, number>();
  for (const p of active) {
    const key = p.statusGroup ?? 'unknown';
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const STATUS_LABELS: Record<string, string> = {
    not_started: 'شروع نشده',
    lead: 'احتمالِ قرارداد',
    in_progress: 'در حال انجام',
    completed: 'تکمیل‌شده',
    on_hold: 'نگه‌داشته',
    cancelled: 'کنسل',
    unknown: 'بدونِ وضعیت',
  };
  const statusDistribution: StatusSlice[] = [...statusCounts.entries()]
    .map(([key, count]) => ({ status: t(STATUS_LABELS[key] ?? key), count }))
    .sort((a, b) => b.count - a.count);

  /** ساعتِ کاریِ اعضا در ۳۰ روزِ گذشته — یک کوئریِ گروهی (R-PERF-01). */
  const from30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const memberRows = ids.length
    ? await db
        .select({ name: users.name, minutes: sql<number>`coalesce(sum(${timelogs.minutes}),0)::int` })
        .from(timelogs)
        .innerJoin(users, eq(users.id, timelogs.userId))
        .where(and(inArray(timelogs.projectId, ids), between(timelogs.logDate, from30, today)))
        .groupBy(users.name)
    : [];
  const memberHours: MemberHours[] = memberRows
    .map((r) => ({ name: r.name, hours: Math.round((r.minutes / 60) * 10) / 10 }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  /**
   * روندِ هفتگیِ ساعتِ تیم — شش پنجرهٔ ۷روزه.
   * همهٔ بازه‌ها در یک کوئری گرفته می‌شوند، نه شش کوئریِ جدا.
   */
  const from42 = new Date(Date.now() - 41 * 86400000).toISOString().slice(0, 10);
  const dailyRows = ids.length
    ? await db
        .select({ day: timelogs.logDate, minutes: sql<number>`coalesce(sum(${timelogs.minutes}),0)::int` })
        .from(timelogs)
        .where(and(inArray(timelogs.projectId, ids), between(timelogs.logDate, from42, today)))
        .groupBy(timelogs.logDate)
    : [];
  const byDay = new Map(dailyRows.map((r) => [r.day, r.minutes]));

  const weeklyTrend: WeeklyPoint[] = [];
  for (let w = 5; w >= 0; w -= 1) {
    let minutes = 0;
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(Date.now() - (w * 7 + d) * 86400000).toISOString().slice(0, 10);
      minutes += byDay.get(day) ?? 0;
    }
    weeklyTrend.push({
      label: w === 0 ? t('این هفته') : t('{n} هفته قبل', { n: w }),
      hours: Math.round((minutes / 60) * 10) / 10,
    });
  }

  return {
    actionGroups,
    progress,
    today: {
      meetings: weekMeetings, away: awayToday, available: availableToday,
      activeTeam, assignedMembers,
    },
    risk: { overdue, soon, stalled, openTenders },
    charts: { statusDistribution, memberHours, weeklyTrend },
    stats: {
      inProgress: active.filter((p) => p.statusGroup === 'in_progress').length,
      lead: active.filter((p) => p.statusGroup === 'lead').length,
      openTasks: openTaskRows.reduce((s, r) => s + r.n, 0),
    },
  };
}
