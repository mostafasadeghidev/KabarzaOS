import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  absences, currencies, offices, projectMembers, projects, schedulerStamps, tagRelations, tags, tasks, timelogs,
  userOffices, userRoles, users,
} from '../schema';
import { hasTeamScope, teamMember, teamMembers, teamScope } from '@/server/team/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** «تیمِ من» — کارت‌های اعضا و پروفایلِ عضو (پورتِ view_team_members / view_team_member). */

const MGR = 1, M1 = 2;
const manager = (): Actor => ({ id: MGR, roles: ['member'], permissions: [], privateAccess: false });
let P_OPEN = 0, P_DONE = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, absences, timelogs, task_roles, tasks, project_members, projects, tag_relations, tags,
    user_offices, offices, user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([{ email: 'mgr@t', name: 'مدیر' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: MGR, role: 'member' }, { userId: M1, role: 'member' }]);
  const [o] = await db.insert(offices).values({ name: 'تهران' }).returning({ id: offices.id });
  await db.insert(userOffices).values([{ userId: MGR, officeId: o!.id, manages: true }, { userId: M1, officeId: o!.id }]);
  const tg = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'تکمیل', type: 'project_status', statusGroup: 'complete', isClosed: true },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'todo' },
    { name: 'انجام شد', type: 'task_status', statusGroup: 'complete', isClosed: true },
  ]).returning({ id: tags.id });
  const [dev, inp, done, todo, taskDone] = tg.map((r) => r.id) as number[];
  await db.insert(tagRelations).values({ objectType: 'user', objectId: M1, tagId: dev! });
  const p = await db.insert(projects).values([
    { title: 'باز', price: '0', statusTagId: inp, officeId: o!.id },
    { title: 'تمام', price: '0', statusTagId: done, officeId: o!.id },
  ]).returning({ id: projects.id });
  [P_OPEN, P_DONE] = [p[0]!.id, p[1]!.id];
  await db.insert(projectMembers).values([
    { projectId: P_OPEN, userId: M1, roleTagId: dev, agreedAmount: '0' },
    { projectId: P_DONE, userId: M1, roleTagId: dev, agreedAmount: '0' },
  ]);
  await db.insert(tasks).values([
    { projectId: P_OPEN, title: 'باز۱', statusTagId: todo, assignedTo: M1, createdBy: MGR },
    { projectId: P_OPEN, title: 'تمام۱', statusTagId: taskDone, assignedTo: M1, createdBy: MGR },
  ]);
  await db.insert(timelogs).values([
    { projectId: P_OPEN, userId: M1, logDate: '2020-01-01', minutes: 90 },
    { projectId: P_DONE, userId: M1, logDate: '2020-01-02', minutes: 30 },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(absences).values({ userId: M1, fromDate: today, toDate: today, note: 'امروز' });
});

afterAll(async () => { await sql.end(); });

describe('کارت‌های اعضا', () => {
  it('نقش‌ها، 🌴 مرخصیِ امروز، شمارِ تسکِ باز (نه بسته)', async () => {
    const { members } = await teamMembers(manager(), { range: 'all' });
    const sara = members.find((m) => m.id === M1)!;
    expect(sara.roleNames).toEqual(['دولوپر']);
    expect(sara.onLeave).toBe(true);
    expect(sara.openTasks).toBe(1);
  });
});

describe('پروفایلِ عضو', () => {
  it('آمار، پروژه‌های در حال اجرا با پیشرفت/ساعت/تسکِ باز، کارکردِ همهٔ زمان، ماتریس، مرخصی', async () => {
    const d = await teamMember(manager(), M1, { range: 'all' });
    expect(d.person?.roleNames).toEqual(['دولوپر']);
    expect(d.stats).toEqual({ projects: 2, openProjects: 1, minutes: 120, openTasks: 1 });
    expect(d.openProjects).toEqual([{ id: P_OPEN, title: 'باز', roles: ['دولوپر'], progress: 50, minutes: 90, openTasks: 1 }]);
    expect(d.hoursAllTime.map((h) => [h.projectTitle, h.minutes])).toEqual([['باز', 90], ['تمام', 30]]);
    expect(d.matrix).toHaveLength(1);
    expect(d.matrix[0]!.cells).toHaveLength(7);
    expect(d.dayLabels).toHaveLength(7);
    expect(d.canLeave).toBe(true);
    expect(d.absences.map((a) => a.note)).toEqual(['امروز']);
  });
});

/**
 * «تیمِ من» برای مدیرِ کل — تنظیمِ سامانه، بی‌آنکه مدیرِ دفتری شود.
 * ⚠️ تنظیمِ سامانه در `scheduler_stamps` است و میانِ فایل‌های تست مشترک؛ مقدارِ
 * قبلی برمی‌گردد تا تست‌های دیگر همان را ببینند.
 */
describe('«تیمِ من» برای مدیرِ کل', () => {
  const KEY = 'system:config';
  let OWNER = 0;
  let previous: string | undefined;
  const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: true });
  const setOwnerTeamView = async (on: boolean) => {
    const value = JSON.stringify({ ownerTeamView: on });
    await db.insert(schedulerStamps).values({ key: KEY, value })
      .onConflictDoUpdate({ target: schedulerStamps.key, set: { value } });
  };

  beforeAll(async () => {
    previous = (await db.select({ value: schedulerStamps.value }).from(schedulerStamps)
      .where(eq(schedulerStamps.key, KEY)))[0]?.value;
    const [u] = await db.insert(users).values({ email: 'owner@t', name: 'مالک' }).returning({ id: users.id });
    OWNER = u!.id;
    await db.insert(userRoles).values({ userId: OWNER, role: 'owner' });
    // دفترِ غیرفعال هم در دامنه است، مثلِ مدیرِ دفتری که به آن وصل است.
    await db.insert(offices).values({ name: 'قدیمی', isActive: false });
  });

  afterAll(async () => {
    if (previous === undefined) await db.delete(schedulerStamps).where(eq(schedulerStamps.key, KEY));
    else await db.update(schedulerStamps).set({ value: previous }).where(eq(schedulerStamps.key, KEY));
  });

  it('خاموش: مدیرِ کلی که مدیرِ دفتری نیست، منو و صفحه ندارد', async () => {
    await setOwnerTeamView(false);
    expect(await hasTeamScope(owner())).toBe(false);
    await expect(teamScope(owner())).rejects.toThrow(ForbiddenError);
  });

  it('روشن: همهٔ دفاتر و پروژه‌هایشان — بی‌آنکه ردیفِ مدیریتی ساخته شود', async () => {
    await setOwnerTeamView(true);
    expect(await hasTeamScope(owner())).toBe(true);
    const all = (await db.select({ id: offices.id }).from(offices).orderBy(offices.id)).map((r) => r.id);
    const scope = await teamScope(owner());
    expect(scope.offices).toEqual(all);
    expect(all).toHaveLength(2);
    expect([...scope.projectIds].sort((a, b) => a - b)).toEqual([P_OPEN, P_DONE].sort((a, b) => a - b));
    expect(await db.select().from(userOffices).where(eq(userOffices.userId, OWNER))).toEqual([]);
  });

  it('روشن بودنش برای غیرِ مدیرِ کل اثری ندارد', async () => {
    await setOwnerTeamView(true);
    expect(await hasTeamScope({ id: M1, roles: ['member'], permissions: [], privateAccess: false })).toBe(false);
  });
});
