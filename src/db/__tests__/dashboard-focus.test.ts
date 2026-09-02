import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { currencies, users, userRoles, tags, projects, tasks, comments, tenderBids } from '../schema';
import { getFocusList } from '@/server/dashboard-focus';
import type { Actor } from '@/domain/access/permissions';

/** فهرست‌های متمرکزِ داشبورد — پورتِ Focus_Page::render / render_review. */

const OWNER = 1, M1 = 2, M2 = 3;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const TODAY = '2026-09-03';

let T1 = 0, P1 = 0, P3 = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, comments, tasks, tender_bids, projects, tags, user_roles, users, currencies
    restart identity cascade`;

  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }, { email: 'm2@t', name: 'علی' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }, { userId: M2, role: 'member' },
  ]);
  const tg = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'مذاکره', type: 'project_status', statusGroup: 'lead' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'not_started' },
    { name: 'نیاز به ریویو', type: 'task_status', statusGroup: 'review', isReview: true },
    { name: 'بالا', type: 'task_priority', sortOrder: 0 },
    { name: 'پایین', type: 'task_priority', sortOrder: 2 },
  ]).returning({ id: tags.id });
  const [dev, lead, inProgress, notStarted, review, high, low] = tg.map((r) => r.id) as number[];

  const p = await db.insert(projects).values([
    { title: 'مناقصهٔ باز', price: '0', currencyId: eur!.id, isTender: true, statusTagId: lead },
    { title: 'مناقصهٔ برنده‌دار', price: '0', currencyId: eur!.id, isTender: true, statusTagId: lead },
    { title: 'سه روز مانده', price: '0', currencyId: eur!.id, statusTagId: inProgress, deadline: '2026-09-06' },
    { title: 'بایگانی', price: '0', currencyId: eur!.id, statusTagId: inProgress, deadline: '2026-09-04', isArchived: true },
    { title: 'امروز', price: '0', currencyId: eur!.id, statusTagId: inProgress, deadline: TODAY },
    { title: 'دور', price: '0', currencyId: eur!.id, statusTagId: inProgress, deadline: '2026-10-01' },
  ]).returning({ id: projects.id });
  const [t1, t2, p1, , p3] = p.map((r) => r.id) as number[];
  T1 = t1!; P1 = p1!; P3 = p3!;

  await db.insert(tenderBids).values([
    { projectId: T1, userId: M1, roleTagId: dev!, amount: '100', status: 'pending' },
    { projectId: T1, userId: M2, roleTagId: dev!, amount: '90', status: 'archived' },
    { projectId: t2!, userId: M1, roleTagId: dev!, amount: '100', status: 'approved' },
  ]);
  await db.insert(tasks).values([
    { projectId: P1, title: 'تسکِ کم‌اولویت', statusTagId: review, priorityTagId: low, assignedTo: M1, createdBy: OWNER },
    { projectId: P1, title: 'تسکِ پراولویت', statusTagId: review, priorityTagId: high, createdBy: OWNER },
    { projectId: P1, title: 'شروع‌نشده', statusTagId: notStarted, priorityTagId: high, createdBy: OWNER },
    { projectId: P3, title: 'بی‌اولویت', statusTagId: review, createdBy: OWNER },
  ]);
  const [rootA] = await db.insert(comments).values({ projectId: P1, userId: M1, body: 'سؤالِ اول', status: 'needs_review' })
    .returning({ id: comments.id });
  await db.insert(comments).values([
    { projectId: P1, userId: M2, parentId: rootA!.id, body: 'پاسخِ علی به سؤالِ اول که کمی طولانی‌تر از دوازده کلمه است تا بریده شود بله', status: 'needs_review' },
    { projectId: P1, userId: M1, body: 'بسته‌شده', status: 'done' },
    { projectId: T1, userId: M2, body: 'کامنتِ مناقصه', status: 'needs_review' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('پروژه‌محور', () => {
  it('مناقصه‌های منتظرِ تصمیم: باز، با پیشنهادِ در انتظار، بی‌برنده؛ نشان = شمارِ پیشنهادها', async () => {
    const d = await getFocusList(owner(), 'bids_pending', TODAY);
    expect(d.projects.map((p) => [p.id, p.badge])).toEqual([[T1, '2 پیشنهاد']]);
    expect(d.projects[0]!.statusName).toBe('مذاکره');
  });

  it('ددلاینِ نزدیک: ۷ روز، بایگانی بیرون، نزدیک‌تر اول', async () => {
    const d = await getFocusList(owner(), 'deadline_soon', TODAY);
    expect(d.projects.map((p) => [p.id, p.badge])).toEqual([[P3, 'امروز'], [P1, '3 روز مانده']]);
  });
});

describe('موردمحور', () => {
  it('تسک‌های ریویو: گروهِ هر پروژه، اولویتِ بالا اول، مسئول یا «بدون مسئول»', async () => {
    const d = await getFocusList(owner(), 'tasks_review', TODAY);
    const p1 = d.groups.find((g) => g.id === P1)!;
    expect(p1.items.map((i) => [i.label, i.who])).toEqual([['تسکِ پراولویت', 'بدون مسئول'], ['تسکِ کم‌اولویت', 'سارا']]);
    expect(d.groups.find((g) => g.id === P3)!.items).toEqual([{ label: 'بی‌اولویت', who: 'بدون مسئول' }]);
  });

  it('کامنت‌های باز: گزیدهٔ تازه‌ترین پیام + نویسنده‌اش؛ رشتهٔ بسته نمی‌آید', async () => {
    const d = await getFocusList(owner(), 'comments_review', TODAY);
    const p1 = d.groups.find((g) => g.id === P1)!;
    expect(p1.items).toHaveLength(1);
    expect(p1.items[0]!.who).toBe('علی');
    expect(p1.items[0]!.label.endsWith('…')).toBe(true);
    expect(d.groups.find((g) => g.id === T1)!.items).toEqual([{ label: 'کامنتِ مناقصه', who: 'علی' }]);
  });
});
