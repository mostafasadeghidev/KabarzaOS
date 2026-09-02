import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { comments, currencies, projectMembers, projects, tags, userRoles, users } from '../schema';
import { addComment, getProjectTabs, NotFoundError } from '@/server/projects/service';
import { getDashboard } from '@/server/dashboard';
import type { Actor } from '@/domain/access/permissions';

/** پاسخ‌های رشته‌ای + شمارندهٔ داشبورد به‌ازای رشته — پورتِ parent_id / count_needs_review. */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const member = (): Actor => ({ id: M1, roles: ['member'], permissions: [], privateAccess: false });

let P = 0, INP = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, comments, task_roles, tasks, timelogs, project_members,
    project_clients, projects, tags, user_roles, users, currencies restart identity cascade`;
  const [eur] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true }).returning({ id: currencies.id });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const [inp] = await db.insert(tags).values({ name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' }).returning({ id: tags.id });
  INP = inp!.id;
  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0', currencyId: eur!.id, statusTagId: INP }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: M1, agreedAmount: '0' });
});

afterAll(async () => { await sql.end(); });

describe('پاسخِ رشته‌ای', () => {
  it('پاسخ زیرِ والدِ همان پروژه و همان رشته؛ والدِ غریبه رد می‌شود', async () => {
    await addComment(owner(), P, 'ریشه', 'comment');
    const [root] = await db.select({ id: comments.id }).from(comments).where(eq(comments.projectId, P));
    await addComment(member(), P, 'پاسخ', 'comment', root!.id);
    const rows = await db.select({ parentId: comments.parentId, body: comments.body }).from(comments).where(eq(comments.projectId, P));
    expect(rows.find((r) => r.body === 'پاسخ')!.parentId).toBe(root!.id);

    // والد از رشتهٔ «بازبینی» نیست → رد.
    await expect(addComment(member(), P, 'پاسخ', 'review', root!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addComment(member(), P, 'پاسخ', 'comment', 99999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('⚠️ شمارندهٔ داشبورد رشته می‌شمارد (وضعیتِ تازه‌ترین پیام)، نه ردیف؛ تبِ پروژه parentId می‌دهد', async () => {
    // ریشه + پاسخ = یک رشتهٔ باز (پیش از این دو ردیفِ needs_review شمرده می‌شد).
    const dash = await getDashboard(owner());
    const card = dash.actionGroups.flatMap((g) => g.cards).find((c) => c.label === 'کامنت‌های نیازمند بررسی')!;
    expect(card.value).toBe(1);

    // بستنِ تازه‌ترین پیام رشته را می‌بندد.
    const [reply] = await db.select({ id: comments.id }).from(comments).where(eq(comments.body, 'پاسخ'));
    await db.update(comments).set({ status: 'done' }).where(eq(comments.id, reply!.id));
    expect((await getDashboard(owner())).actionGroups.flatMap((g) => g.cards)
      .find((c) => c.label === 'کامنت‌های نیازمند بررسی')!.value).toBe(0);

    const tabs = await getProjectTabs(owner(), P);
    expect(tabs.comments.some((c) => c.parentId !== null)).toBe(true);
    expect(tabs.currencyCode).toBe('EUR');
  });
});
