import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { offices, projectMembers, projects, tags, timelogs, userOffices, userRoles, users } from '../schema';
import {
  canLogGeneral, canLogTime, canUseTimesheet, loggableProjects, loggedProjectTitles, myLogs, myTotals, updateLog,
} from '@/server/timelogs/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** حقوقِ ثبتِ ساعت، فهرستِ پروژه‌های قابلِ ثبت، فیلتر/صفحه‌بندیِ صفحهٔ ساعت — پورتِ can_log_time / view_hours. */

const OWNER = 1, M1 = 2, MGR = 3, FIN = 4;
const actor = (id: number, roles: Actor['roles'], permissions: string[] = []): Actor =>
  ({ id, roles, permissions: permissions as Actor['permissions'], privateAccess: false });

let OPEN = 0, CLOSED = 0, ONHOLD = 0, OTHER = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, work_timers, timelogs, project_members, projects, tags, user_offices, offices,
    user_roles, users restart identity cascade`;
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'عضو' }, { email: 'mgr@t', name: 'مدیرِ دفتر' }, { email: 'fin@t', name: 'مالی' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }, { userId: MGR, role: 'member' }, { userId: FIN, role: 'finance' },
  ]);
  const [o] = await db.insert(offices).values({ name: 'تهران' }).returning({ id: offices.id });
  await db.insert(userOffices).values({ userId: MGR, officeId: o!.id, manages: true });
  const tg = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'تکمیل', type: 'project_status', statusGroup: 'complete', isClosed: true },
    { name: 'متوقف', type: 'project_status', statusGroup: 'on_hold' },
  ]).returning({ id: tags.id });
  const p = await db.insert(projects).values([
    { title: 'بازِ دفتر', price: '0', statusTagId: tg[0]!.id, officeId: o!.id },
    { title: 'بسته', price: '0', statusTagId: tg[1]!.id, officeId: o!.id },
    { title: 'متوقف', price: '0', statusTagId: tg[2]!.id, officeId: o!.id },
    { title: 'دفترِ دیگر', price: '0', statusTagId: tg[0]!.id },
  ]).returning({ id: projects.id });
  [OPEN, CLOSED, ONHOLD, OTHER] = [p[0]!.id, p[1]!.id, p[2]!.id, p[3]!.id];
  await db.insert(projectMembers).values([
    { projectId: OPEN, userId: M1, agreedAmount: '0' },
    { projectId: CLOSED, userId: M1, agreedAmount: '0' },
    { projectId: OTHER, userId: M1, agreedAmount: '0' },
  ]);
  await db.insert(timelogs).values([
    { projectId: OPEN, userId: M1, logDate: '2026-09-01', minutes: 60, description: 'الف' },
    { projectId: OTHER, userId: M1, logDate: '2026-09-02', minutes: 30, description: 'ب' },
    { projectId: null, userId: M1, logDate: '2026-08-20', minutes: 15, description: 'عمومی' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('حقوقِ ثبتِ ساعت (پورتِ can_log_time / can_log_general)', () => {
  it('مالک و مالی ساعتِ عمومی می‌زنند؛ مدیرِ دفتر بی‌امضا روی پروژهٔ دفترش؛ عضو فقط روی پروژهٔ خودش', async () => {
    expect(canLogGeneral(actor(OWNER, ['owner']))).toBe(true);
    expect(canLogGeneral(actor(FIN, ['finance'], ['finance.view']))).toBe(true);
    expect(await canLogTime(actor(OWNER, ['owner']), OPEN)).toBe(true);
    expect(await canLogTime(actor(MGR, ['member']), OPEN)).toBe(true);
    expect(await canLogTime(actor(MGR, ['member']), OTHER)).toBe(false);
    expect(await canLogTime(actor(M1, ['member']), OPEN)).toBe(true);
    // منجمد (توقف) و بسته ساعتِ تازه نمی‌پذیرند.
    expect(await canLogTime(actor(OWNER, ['owner']), ONHOLD)).toBe(false);
    expect(await canUseTimesheet(actor(OWNER, ['owner']))).toBe(true);
    expect(await canUseTimesheet(actor(MGR, ['member']))).toBe(true);
  });

  it('پروژه‌های قابلِ ثبت: عضویت ∪ دفترِ مدیریت‌شده؛ فقط باز و غیرمنجمد', async () => {
    expect((await loggableProjects(actor(M1, ['member']))).map((p) => p.id).sort()).toEqual([OPEN, OTHER].sort());
    expect((await loggableProjects(actor(MGR, ['member']))).map((p) => p.id)).toEqual([OPEN]);
    expect((await loggableProjects(actor(OWNER, ['owner']))).map((p) => p.id).sort()).toEqual([OPEN, OTHER].sort());
  });
});

describe('صفحهٔ ساعت (پورتِ view_hours)', () => {
  it('فیلترِ بازه/نامِ پروژه، جمعِ بازه، صفحه‌بندی', async () => {
    const m = actor(M1, ['member']);
    const all = await myLogs(m, {});
    expect(all.total).toBe(3);
    expect(all.rows.map((r) => r.description)).toEqual(['ب', 'الف', 'عمومی']);

    const named = await myLogs(m, { project: 'دفتر' });
    // «شامل»: هر دو عنوانی که «دفتر» دارند؛ ساعتِ عمومی عنوان ندارد.
    expect(named.rows.map((r) => r.description).sort()).toEqual(['الف', 'ب']);
    expect(named.rangeMinutes).toBe(90);

    const paged = await myLogs(m, { perPage: 2, page: 9 });
    expect([paged.page, paged.pages, paged.rows.length]).toEqual([2, 2, 1]);

    expect(await loggedProjectTitles(m)).toEqual(['بازِ دفتر', 'دفترِ دیگر']);
  });

  it('آمارِ هفتهٔ تقویمی (شنبه‌آغاز) و این ماه', async () => {
    // چهارشنبه ۲ سپتامبر: هفته از شنبه ۲۹ اوت؛ ماه از ۱ سپتامبر.
    const totals = await myTotals(actor(M1, ['member']), new Date('2026-09-02T12:00:00'), 0);
    expect(totals.week).toBe(90);
    expect(totals.month).toBe(90);
    expect(totals.total).toBe(105);
  });

  it('ویرایش: تاریخ و پروژه هم عوض می‌شوند؛ پروژهٔ بی‌مجوز رد می‌شود', async () => {
    const m = actor(M1, ['member']);
    const [row] = await db.select({ id: timelogs.id }).from(timelogs).where(eq(timelogs.description, 'الف'));
    await updateLog(m, row!.id, { minutes: 45, description: 'الف۲', logDate: '2026-09-03', projectId: OTHER }, new Date('2026-09-03T00:00:00'));
    const [after] = await db.select().from(timelogs).where(eq(timelogs.id, row!.id));
    expect([after!.minutes, after!.logDate, after!.projectId]).toEqual([45, '2026-09-03', OTHER]);
    await expect(updateLog(m, row!.id, { minutes: 45, description: '', projectId: ONHOLD }, new Date('2026-09-03T00:00:00')))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
