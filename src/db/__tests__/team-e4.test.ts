import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  absences, currencies, offices, projectMembers, projects, tagRelations, tags, tasks, timelogs, userOffices, userRoles, users,
} from '../schema';
import { teamMember, teamMembers } from '@/server/team/service';
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
