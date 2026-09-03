import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  currencies, users, userRoles, tags, projects, tasks, offices, timelogs,
  recurringExpenses, meetings, meetingAttendees,
} from '../schema';
import { getDashboard } from '@/server/dashboard';
import type { Actor } from '@/domain/access/permissions';

/**
 * پنل‌های داشبوردِ مدیر — پورتِ افزونه: فیلترِ دفتر روی نمودارِ ساعت، سررسیدهای
 * هزینه (کارت + فهرست)، تسک‌های گیرکرده در ریویو، توزیع به نامِ تگ، جلساتِ خودِ بیننده.
 */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const today = new Date().toISOString().slice(0, 10);
const shift = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

let A = 0, P1 = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, timelogs, tasks, meeting_attendees, meetings, recurring_expenses,
    projects, tags, offices, user_roles, users, currencies restart identity cascade`;

  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const of = await db.insert(offices).values([{ name: 'برلین' }, { name: 'لندن' }]).returning({ id: offices.id });
  A = of[0]!.id;
  const B = of[1]!.id;
  const tg = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'در حال بررسی', type: 'project_status', statusGroup: 'in_progress', nameI18n: { en: 'Reviewing' } },
    { name: 'ریویو', type: 'task_status', statusGroup: 'review', isReview: true },
    { name: 'شروع', type: 'task_status', statusGroup: 'not_started' },
  ]).returning({ id: tags.id });
  const [doing, reviewing, review, start] = tg.map((r) => r.id) as number[];

  const p = await db.insert(projects).values([
    { title: 'آلفا', price: '0', currencyId: eur!.id, statusTagId: doing, officeId: A },
    { title: 'بتا', price: '0', currencyId: eur!.id, statusTagId: reviewing, officeId: B },
  ]).returning({ id: projects.id });
  P1 = p[0]!.id;
  const P2 = p[1]!.id;

  await db.insert(timelogs).values([
    { userId: M1, projectId: P1, logDate: today, minutes: 120 },
    { userId: M1, projectId: P2, logDate: today, minutes: 60 },
  ]);
  await db.insert(tasks).values([
    { projectId: P1, title: 'یک', statusTagId: review, createdBy: OWNER },
    { projectId: P1, title: 'دو', statusTagId: review, createdBy: OWNER },
    { projectId: P2, title: 'سه', statusTagId: start, createdBy: OWNER },
  ]);
  await db.insert(recurringExpenses).values([
    { title: 'هاستینگ', amount: '12.5', currencyId: eur!.id, startDate: shift(-1), nextDueDate: shift(-1) },
    { title: 'دامنه', amount: '9', currencyId: eur!.id, startDate: shift(3), nextDueDate: shift(3) },
    { title: 'بیمه', amount: '100', currencyId: eur!.id, startDate: shift(30), nextDueDate: shift(30) },
    { title: 'قدیمی', amount: '1', currencyId: eur!.id, startDate: shift(-5), nextDueDate: shift(-5), isActive: false },
  ]);
  const m = await db.insert(meetings).values([
    { title: 'جلسهٔ من', meetAt: new Date(Date.now() + 3600_000), createdBy: OWNER, meetingScope: 'general' },
    { title: 'جلسهٔ دیگران', meetAt: new Date(Date.now() + 7200_000), createdBy: M1, meetingScope: 'general' },
    { title: 'دور', meetAt: new Date(Date.now() + 10 * 86400_000), createdBy: OWNER, meetingScope: 'general' },
  ]).returning({ id: meetings.id });
  await db.insert(meetingAttendees).values({ meetingId: m[1]!.id, userId: M1 });
});

afterAll(async () => { await sql.end(); });

describe('پنل‌های داشبورد (پورتِ افزونه)', () => {
  it('فیلترِ دفتر فقط نمودارِ ساعت را محدود می‌کند؛ توزیع به نامِ تگ است', async () => {
    const all = await getDashboard(owner());
    expect(all.charts.memberHours).toEqual([{ name: 'سارا', hours: 3 }]);
    expect(all.charts.offices.map((o) => o.name)).toEqual(['برلین', 'لندن']);
    expect(all.charts.officeId).toBeNull();
    expect([...all.charts.statusDistribution].sort((a, b) => a.status.localeCompare(b.status)))
      .toEqual([{ status: 'در حال انجام', count: 1 }, { status: 'در حال بررسی', count: 1 }]);

    const berlin = await getDashboard(owner(), { officeId: A });
    expect(berlin.charts.memberHours).toEqual([{ name: 'سارا', hours: 2 }]);
    expect(berlin.charts.officeId).toBe(A);
    // شمارنده‌ها و ریسک‌ها با فیلتر عوض نمی‌شوند.
    expect(berlin.stats.openTasks).toBe(all.stats.openTasks);

    const bogus = await getDashboard(owner(), { officeId: 999 });
    expect(bogus.charts.officeId).toBeNull();
  });

  it('سررسیدهای هزینه: گذشته + ۷ روزِ آینده، فقط فعال‌ها؛ کارت و فهرست', async () => {
    const d = await getDashboard(owner());
    expect(d.risk.expenseDues.map((e) => [e.title, e.overdue])).toEqual([['هاستینگ', true], ['دامنه', false]]);
    expect(d.risk.expenseDues[0]!.amount).toBe('€ 12.50');
    const finance = d.actionGroups.find((g) => g.title === 'مالی')!;
    expect(finance.cards.find((c) => c.label === 'هزینه‌های سررسیدشده/نزدیک')?.value).toBe(2);
  });

  it('تسک‌های گیرکرده در ریویو به تفکیکِ پروژه، با پیوند به تبِ ریویو', async () => {
    const d = await getDashboard(owner());
    expect(d.risk.reviewStuck.map((r) => [r.id, r.href])).toEqual([[P1, `/projects/${P1}?tab=tasks&view=review`]]);
    expect(d.risk.reviewStuck[0]!.badge).toContain('2');
  });

  it('جلساتِ خودِ بیننده در ۷ روزِ آینده؛ آنلاین‌ها خالی وقتی حضوری ثبت نشده', async () => {
    const d = await getDashboard(owner());
    expect(d.today.meetings.map((m) => m.title)).toEqual(['جلسهٔ من']);
    expect(d.today.online).toEqual([]);
  });
});
