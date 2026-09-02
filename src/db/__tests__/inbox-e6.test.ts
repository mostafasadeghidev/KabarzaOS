import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  currencies, users, userRoles, tags, projects, projectMembers, projectClients, tasks, taskRoles,
  offices, userOffices,
} from '../schema';
import { getMemberDashboard } from '@/server/dashboard-member';
import { listProjects, myTasks } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/** صندوقِ تسک‌ها، داشبوردِ عضو/کارفرما و فهرستِ مدیرِ دفتر — پورتِ داشبوردِ افزونه. */

const ME = 1, OTHER = 2, CLIENT = 3, OFFICE_MGR = 4;
const actor = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

let DEV: number, todo: number, review: number, done: number;
let p1: number, tender: number, officeProject: number;
const ids: Record<string, number> = {};

beforeAll(async () => {
  await sql`truncate table audit_log, task_roles, tasks, tender_bids, project_members, project_clients,
    projects, user_offices, offices, tags, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  await db.insert(users).values([
    { email: 'me@t', name: 'من' },
    { email: 'o@t', name: 'دیگری' },
    { email: 'c@t', name: 'کارفرما' },
    { email: 'm@t', name: 'مدیرِ دفتر' },
  ]);
  await db.insert(userRoles).values([
    { userId: ME, role: 'member' }, { userId: OTHER, role: 'member' },
    { userId: CLIENT, role: 'client' }, { userId: OFFICE_MGR, role: 'member' },
  ]);

  const t = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'not_started' },
    { name: 'نیاز به ریویو', type: 'task_status', statusGroup: 'review', isReview: true },
    { name: 'انجام شد', type: 'task_status', statusGroup: 'complete', isClosed: true },
    { name: 'مذاکره', type: 'project_status', statusGroup: 'lead' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
  ]).returning({ id: tags.id });
  DEV = t[0]!.id; todo = t[1]!.id; review = t[2]!.id; done = t[3]!.id;
  const lead = t[4]!.id; const inProgress = t[5]!.id;

  const o = await db.insert(offices).values({ name: 'برلین' }).returning({ id: offices.id });
  await db.insert(userOffices).values({ userId: OFFICE_MGR, officeId: o[0]!.id, manages: true });

  const p = await db.insert(projects).values([
    { title: 'وب‌سایت', price: '1000', currencyId: c[0]!.id, statusTagId: inProgress },
    { title: 'مناقصهٔ اپ', price: '0', currencyId: c[0]!.id, statusTagId: lead, isTender: true, tenderRoles: { [String(DEV)]: '0' } },
    { title: 'پروژهٔ دفتر', price: '0', currencyId: c[0]!.id, statusTagId: inProgress, officeId: o[0]!.id },
  ]).returning({ id: projects.id });
  p1 = p[0]!.id; tender = p[1]!.id; officeProject = p[2]!.id;

  await db.insert(projectMembers).values([
    { projectId: p1, userId: ME, roleTagId: DEV, agreedAmount: '0' },
    { projectId: p1, userId: OTHER, roleTagId: DEV, agreedAmount: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: p1, userId: CLIENT });
  // تگِ نقشِ من (برای مناقصه).
  await sql`insert into tag_relations (tag_id, object_id, object_type) values (${DEV}, ${ME}, 'user')`;

  const rows = await db.insert(tasks).values([
    { projectId: p1, title: 'مالِ من', statusTagId: todo, assignedTo: ME, createdBy: OTHER },
    { projectId: p1, title: 'نقشیِ ادعانشده', statusTagId: todo, createdBy: OTHER },
    { projectId: p1, title: 'نقشیِ ادعاشده توسطِ دیگری', statusTagId: todo, createdBy: OTHER },
    { projectId: p1, title: 'خصوصیِ خودم', statusTagId: todo, createdBy: ME, isPrivate: true },
    { projectId: p1, title: 'خصوصیِ دیگری', statusTagId: todo, createdBy: OTHER, isPrivate: true },
    { projectId: p1, title: 'مالِ دیگری', statusTagId: todo, assignedTo: OTHER, createdBy: OTHER },
    { projectId: p1, title: 'منتظرِ بررسی (من)', statusTagId: review, assignedTo: ME, createdBy: OTHER },
    { projectId: p1, title: 'منتظرِ بررسی (بی‌مسئول)', statusTagId: review, createdBy: OTHER },
    { projectId: p1, title: 'تمام‌شده', statusTagId: done, assignedTo: ME, createdBy: OTHER },
  ]).returning({ id: tasks.id, title: tasks.title });
  for (const r of rows) ids[r.title] = r.id;
  await db.insert(taskRoles).values([
    { taskId: ids['نقشیِ ادعانشده']!, roleTagId: DEV },
    { taskId: ids['نقشیِ ادعاشده توسطِ دیگری']!, roleTagId: DEV, claimedBy: OTHER },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('صندوقِ تسک‌های عضو — پورتِ visible_to_user_sql', () => {
  it('مالِ من + نقشیِ ادعانشده + خصوصیِ خودم؛ نه ادعای دیگری، نه مالِ دیگری، نه خصوصیِ دیگری', async () => {
    const inbox = await myTasks(actor(ME, ['member']));
    expect(inbox.kind).toBe('member');
    expect(inbox.active.map((x) => x.title).sort()).toEqual(['خصوصیِ خودم', 'مالِ من', 'نقشیِ ادعانشده'].sort());
    expect(inbox.waiting.map((x) => x.title)).toEqual(['منتظرِ بررسی (من)']);
    // «برمی‌دارم» فقط روی تسکِ نقشیِ ادعانشده (دو دارندهٔ نقش).
    const claimable = inbox.active.filter((x) => x.claimable).map((x) => x.title);
    expect(claimable).toEqual(['نقشیِ ادعانشده']);
  });

  it('کارفرما: تسک‌های در انتظارِ بررسی روی پروژه‌هایش', async () => {
    const inbox = await myTasks(actor(CLIENT, ['client']));
    expect(inbox.kind).toBe('client');
    expect(inbox.review.map((x) => x.title).sort()).toEqual(['منتظرِ بررسی (بی‌مسئول)', 'منتظرِ بررسی (من)'].sort());
  });
});

describe('داشبوردِ عضو/کارفرما', () => {
  it('تسک‌های بازِ عضو = دیدنی ∧ نه بسته ∧ نه در بررسی؛ مناقصهٔ نقشِ من فهرست می‌شود، نه در پروژه‌ها', async () => {
    const d = await getMemberDashboard(actor(ME, ['member']));
    expect(d.client).toBeNull();
    expect(d.member!.stats.openTasks).toBe(3);
    expect(d.member!.stats.projects).toBe(1);
    expect(d.member!.rows.map((r) => r.id)).toEqual([p1]);
    expect(d.member!.rows[0]!.myOpenTasks).toBe(3);
    expect(d.tenders.map((x) => x.id)).toEqual([tender]);
    expect(d.tenders[0]!.roleNames).toEqual(['دولوپر']);
    expect(d.tenders[0]!.myBids).toBe(0);
  });

  it('کارفرما: شمارِ تسک‌های نیازمندِ بررسی و ردیف با قیمت/وضعیتِ پرداخت/تعدادِ تسک', async () => {
    const d = await getMemberDashboard(actor(CLIENT, ['client']));
    expect(d.member).toBeNull();
    expect(d.client!.stats.reviewTasks).toBe(2);
    const row = d.client!.rows[0]!;
    expect(row.id).toBe(p1);
    expect(row.price).toBe('1000.0000');
    expect(row.paymentStatus).toBe('unpaid');
    expect(row.taskCount).toBe(9);
    expect(row.currencyCode).toBe('EUR');
  });

  it('عضو + کارفرما هر دو بخش را می‌گیرد', async () => {
    const d = await getMemberDashboard(actor(ME, ['member', 'client']));
    expect(d.member).not.toBeNull();
    expect(d.client).not.toBeNull();
    expect(d.client!.stats.projects).toBe(0);
  });
});

describe('مدیرِ دفتر پروژه‌های دفترش را در فهرست می‌بیند', () => {
  it('بدونِ مجوزِ سراسری و بدونِ عضویت — پورتِ بخشِ «دفاترِ من»', async () => {
    const list = await listProjects(actor(OFFICE_MGR, ['member']));
    expect(list.map((p) => p.id)).toContain(officeProject);
    expect(list.map((p) => p.id)).not.toContain(p1);
  });
});
