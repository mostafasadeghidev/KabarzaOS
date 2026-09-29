import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { comments, currencies, projectClients, projectMembers, projects, tags, userRoles, users } from '../schema';
import { listProjects, myOpenCommentThreads } from '@/server/projects/service';
import { getMemberDashboard } from '@/server/dashboard-member';
import type { Actor } from '@/domain/access/permissions';

/**
 * «کامنت‌های نیازمند بررسی» ِ عضو و کارفرما — پورتِ `view_thread_list` و
 * `count_needs_review`: یک ردیف برای هر رشته‌ای که تازه‌ترین پیامش باز است،
 * با ماسکِ نامِ نویسنده، و کارتِ داشبورد با همان شمار.
 */

const M = 1, C = 2, X = 3;
const member = (): Actor => ({ id: M, roles: ['member'], permissions: [], privateAccess: false });
const client = (): Actor => ({ id: C, roles: ['client'], permissions: [], privateAccess: false });
let P = 0, FROZEN = 0, OTHER = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, comments, project_clients, project_members, projects, tags,
    user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([
    { email: 'm@t', name: 'سارا' }, { email: 'c@t', name: 'شرکتِ آلفا' }, { email: 'x@t', name: 'بیگانه' },
  ]);
  await db.insert(userRoles).values([
    { userId: M, role: 'member' }, { userId: C, role: 'client' }, { userId: X, role: 'member' },
  ]);
  const tg = await db.insert(tags).values([
    { name: 'طراح', type: 'member_role' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'نگه‌داشته', type: 'project_status', statusGroup: 'on_hold' },
  ]).returning({ id: tags.id });
  const [designer, inp, hold] = tg.map((r) => r.id) as number[];
  const p = await db.insert(projects).values([
    { title: 'سایت', price: '0', statusTagId: inp },
    { title: 'منجمد', price: '0', statusTagId: hold },
    { title: 'دیگری', price: '0', statusTagId: inp },
  ]).returning({ id: projects.id });
  [P, FROZEN, OTHER] = [p[0]!.id, p[1]!.id, p[2]!.id];
  await db.insert(projectMembers).values([
    { projectId: P, userId: M, roleTagId: designer, agreedAmount: '0' },
    { projectId: FROZEN, userId: M, roleTagId: designer, agreedAmount: '0' },
    { projectId: OTHER, userId: X, roleTagId: designer, agreedAmount: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: P, userId: C });

  // رشتهٔ ۱ — کارفرما پرسید، عضو دو بار پاسخ داد؛ هنوز باز → یک ردیف با پاسخِ آخر.
  const [a] = await db.insert(comments).values({ projectId: P, userId: C, type: 'comment', status: 'needs_review', body: 'لوگو کجاست؟' }).returning({ id: comments.id });
  await db.insert(comments).values([
    { projectId: P, userId: M, parentId: a!.id, type: 'comment', status: 'needs_review', body: 'فردا' },
    { projectId: P, userId: M, parentId: a!.id, type: 'comment', status: 'needs_review', body: 'امروز عصر می‌فرستم' },
  ]);
  // رشتهٔ ۲ — عضو پرسید، کارفرما پاسخ داد؛ باز.
  const [b] = await db.insert(comments).values({ projectId: P, userId: M, type: 'comment', status: 'done', body: 'رنگ؟' }).returning({ id: comments.id });
  await db.insert(comments).values({ projectId: P, userId: C, parentId: b!.id, type: 'comment', status: 'needs_review', body: 'آبی' });
  // رشتهٔ ۳ — آخرین پیام بسته‌اش کرده → نمی‌آید.
  const [c] = await db.insert(comments).values({ projectId: P, userId: C, type: 'comment', status: 'needs_review', body: 'قدیمی' }).returning({ id: comments.id });
  await db.insert(comments).values({ projectId: P, userId: M, parentId: c!.id, type: 'comment', status: 'done', body: 'انجام شد' });
  // پروژهٔ منجمد و پروژهٔ دیگران → نمی‌آیند.
  await db.insert(comments).values([
    { projectId: FROZEN, userId: M, type: 'comment', status: 'needs_review', body: 'منجمد' },
    { projectId: OTHER, userId: X, type: 'comment', status: 'needs_review', body: 'مالِ دیگری' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('رشته‌های بازِ پروژه‌های من', () => {
  it('عضو: یک ردیف برای هر رشتهٔ باز، با آخرین پیام؛ نامِ کارفرما ماسک می‌شود', async () => {
    const list = await myOpenCommentThreads(member());
    expect(list.map((t) => [t.excerpt, t.authorName])).toEqual([
      ['آبی', 'کارفرما'],
      ['امروز عصر می‌فرستم', 'سارا'],
    ]);
    expect(list.every((t) => t.projectId === P)).toBe(true);
  });

  it('کارفرما: نامِ عضو به نامِ نقشش ماسک می‌شود', async () => {
    const list = await myOpenCommentThreads(client());
    expect(list.map((t) => t.authorName)).toEqual(['شرکتِ آلفا', 'طراح']);
  });

  it('کسی که روی پروژه‌ای نیست چیزی نمی‌بیند', async () => {
    const list = await myOpenCommentThreads({ id: X, roles: ['member'], permissions: [], privateAccess: false });
    expect(list.map((t) => t.projectId)).toEqual([OTHER]);
  });

  it('⚠️ کارتِ داشبورد رشته‌ها را می‌شمارد، نه ردیف‌ها — همان عددِ فهرست', async () => {
    const d = await getMemberDashboard(member());
    expect(d.member?.stats.commentsToReview).toBe(2);
    const dc = await getMemberDashboard(client());
    expect(dc.client?.stats.commentsToReview).toBe(2);
  });
});

describe('بخش‌های «همهٔ پروژه‌های شما»', () => {
  it('هر پروژه رابطهٔ من با آن را دارد — عضو، کارفرما', async () => {
    const [y] = await db.insert(users).values({ email: 'y@t', name: 'دوگانه' }).returning({ id: users.id });
    await db.insert(userRoles).values([{ userId: y!.id, role: 'member' }, { userId: y!.id, role: 'client' }]);
    await db.insert(projectMembers).values({ projectId: P, userId: y!.id, agreedAmount: '0' });
    await db.insert(projectClients).values({ projectId: OTHER, userId: y!.id });

    const rows = await listProjects({ id: y!.id, roles: ['member', 'client'], permissions: [], privateAccess: false });
    const byId = new Map(rows.map((r) => [r.id, r.relations]));
    expect(byId.get(P)).toEqual(['member']);
    expect(byId.get(OTHER)).toEqual(['client']);
  });
});

describe('شمارنده‌های کارتِ پروژه', () => {
  it('⚠️ کامنتِ کارت رشته‌های باز را می‌شمارد، نه پیام‌ها — همان عددِ فهرست', async () => {
    const rows = await listProjects({ id: M, roles: ['member'], permissions: [], privateAccess: false });
    expect(rows.find((r) => r.id === P)!.commentReviewCount).toBe(2);
  });
});
