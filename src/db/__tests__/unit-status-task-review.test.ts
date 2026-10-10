import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, projectMembers, projects, tags, tasks, unitEntries, userRoles, users } from '../schema';
import { addUnitEntry, listUnitEntries, MemberMoneyError, setUnitEntryStatus } from '@/server/finance/member-service';
import { createProject, createTask, getTaskFormOptions, updateTask } from '@/server/projects/service';
import { createReview, listReviews } from '@/server/projects/reviews';
import { loggableTargets } from '@/server/timelogs/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * ۲.۲۲.۰ — وضعیتِ کارِ ردیف (بی‌اثر روی پروژه)، تسکِ وصل به ردیف، و مخاطبِ شخصیِ بازبینی.
 */

let OWNER = 0, ALI = 0, BOB = 0, DEV = 0, EUR = 0, P = 0, Q = 0;
let NOT_STARTED = 0, DONE = 0, IN_PROGRESS = 0, TASK_TODO = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => as(OWNER, ['owner']);
const ali = () => as(ALI, ['member']);
const bob = () => as(BOB, ['member']);

const base = {
  description: '', regDate: null, deadline: null, price: '0', currencyId: null,
  officeId: null, parentId: null, isTender: false, scope: 'company' as const,
};
const task = (title: string, extra: Record<string, unknown> = {}) => ({
  title, description: '', statusTagId: TASK_TODO, priorityTagId: null, assignedTo: null, dueDate: null, isPrivate: false, ...extra,
});
const reason = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e) { return e instanceof MemberMoneyError ? e.reason : (e as { required?: string }).required ?? 'other'; }
};

beforeAll(async () => {
  await sql`truncate table review_users, review_roles, reviews, tasks, timelogs, work_timers, unit_entries, project_members, projects, user_roles, tags, currencies, audit_log, notifications, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'o@n', name: 'مالک' }, { email: 'a@n', name: 'علی' }, { email: 'b@n', name: 'بابک' },
  ]).returning({ id: users.id });
  [OWNER, ALI, BOB] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: ALI, role: 'member' }, { userId: BOB, role: 'member' },
  ]);
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'Euro', isDefault: true }).returning({ id: currencies.id });
  EUR = c!.id;
  const st = await db.insert(tags).values([
    { name: 'شروع نشده', type: 'project_status', statusGroup: 'not_started', sortOrder: 1 },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress', sortOrder: 2 },
    { name: 'تکمیل شده', type: 'project_status', statusGroup: 'completed', isClosed: true, sortOrder: 3 },
    { name: 'انجام نشده', type: 'task_status', statusGroup: 'todo', sortOrder: 1 },
    { name: 'دولوپر', type: 'member_role' },
  ]).returning({ id: tags.id });
  [NOT_STARTED, IN_PROGRESS, DONE, TASK_TODO, DEV] = st.map((r) => r.id) as [number, number, number, number, number];

  P = await createProject(owner(), { ...base, title: 'Simon Zickert media', statusTagId: IN_PROGRESS, isUnitBased: true });
  Q = await createProject(owner(), { ...base, title: 'Other', statusTagId: IN_PROGRESS, isUnitBased: true });
  for (const p of [P, Q]) {
    await db.insert(projectMembers).values([
      { projectId: p, userId: ALI, roleTagId: DEV, unitRate: '10', currencyId: EUR },
      { projectId: p, userId: BOB, roleTagId: DEV, unitRate: '10', currencyId: EUR },
    ]);
  }
});

const entry = (projectId: number, userId: number, name: string, workStatusTagId?: number) =>
  addUnitEntry(owner(), { projectId, userId, entryDate: '2026-10-11', quantity: 1, note: '', name, workStatusTagId });

describe('وضعیتِ کارِ ردیف', () => {
  it('پیش‌فرض «شروع نشده» است و فهرست نام و رنگِ وضعیت را می‌دهد', async () => {
    const id = await entry(P, ALI, 'CAT');
    const row = (await listUnitEntries(owner(), P)).find((r) => r.id === id)!;
    expect(row.workStatusTagId).toBe(NOT_STARTED);
    expect(row.workStatusName).toBe('شروع نشده');
    expect(row.workStatusGroup).toBe('not_started');
  });

  it('تغییرِ وضعیتِ ردیف، وضعیتِ خودِ پروژه را عوض نمی‌کند', async () => {
    const id = await entry(P, ALI, 'GSH');
    await setUnitEntryStatus(owner(), id, DONE);
    const [p] = await db.select({ s: projects.statusTagId }).from(projects).where(eq(projects.id, P));
    expect(p!.s).toBe(IN_PROGRESS);
    expect((await db.select({ s: unitEntries.workStatusTagId }).from(unitEntries).where(eq(unitEntries.id, id)))[0]!.s).toBe(DONE);
  });

  it('صاحبِ ردیف می‌تواند، دیگری نه؛ تگِ غیرِ وضعیت رد می‌شود؛ null بی‌وضعیت می‌کند', async () => {
    const id = await entry(P, ALI, 'LTH');
    await setUnitEntryStatus(ali(), id, IN_PROGRESS);
    expect(await reason(setUnitEntryStatus(bob(), id, DONE))).toBe('not_yours');
    expect(await reason(setUnitEntryStatus(owner(), id, DEV))).toBe('status_invalid');
    expect(await reason(entry(P, ALI, 'BAD', DEV))).toBe('status_invalid');
    await setUnitEntryStatus(owner(), id, null);
    expect((await db.select({ s: unitEntries.workStatusTagId }).from(unitEntries).where(eq(unitEntries.id, id)))[0]!.s).toBeNull();
  });

  it('ردیفِ تکمیل‌شده از گزینه‌های ثبتِ ساعت بیرون می‌رود', async () => {
    const labels = (await loggableTargets(ali())).map((t) => t.title);
    expect(labels).toContain('Simon Zickert media - CAT');
    expect(labels).not.toContain('Simon Zickert media - GSH');
  });
});

describe('تسکِ وصل به ردیف', () => {
  it('تسک ردیفِ همین پروژه را می‌گیرد و نامش را نشان می‌دهد؛ ردیفِ پروژهٔ دیگر رد می‌شود', async () => {
    const [cat] = await db.select({ id: unitEntries.id }).from(unitEntries).where(and(eq(unitEntries.projectId, P), eq(unitEntries.name, 'CAT')));
    const other = await entry(Q, ALI, 'X1');
    const id = await createTask(owner(), P, task('کارِ CAT', { unitEntryId: cat!.id }));
    const [row] = await db.select({ u: tasks.unitEntryId }).from(tasks).where(eq(tasks.id, id));
    expect(row!.u).toBe(cat!.id);
    await expect(createTask(owner(), P, task('اشتباه', { unitEntryId: other }))).rejects.toThrow();

    // ویرایش: نیامده دست‌نخورده، null پاک.
    await updateTask(owner(), id, task('کارِ CAT'));
    expect((await db.select({ u: tasks.unitEntryId }).from(tasks).where(eq(tasks.id, id)))[0]!.u).toBe(cat!.id);
    await updateTask(owner(), id, task('کارِ CAT', { unitEntryId: null }));
    expect((await db.select({ u: tasks.unitEntryId }).from(tasks).where(eq(tasks.id, id)))[0]!.u).toBeNull();
  });

  it('گزینه‌ها: مدیر همهٔ ردیف‌های نام‌دار، عضو فقط ردیف‌های خودش', async () => {
    await entry(P, BOB, 'BOBS');
    const forOwner = (await getTaskFormOptions(owner(), P)).unitEntries.map((u) => u.name);
    expect(forOwner).toEqual(expect.arrayContaining(['CAT', 'GSH', 'LTH', 'BOBS']));
    const forAli = (await getTaskFormOptions(ali(), P)).unitEntries.map((u) => u.name);
    expect(forAli).toContain('CAT');
    expect(forAli).not.toContain('BOBS');
  });
});

describe('مخاطبِ شخصیِ بازبینی', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    title: 'بازبینی', videoUrl: '', source: null, notes: '', roleTagIds: [] as number[], clientVisible: false, ...over,
  });
  const titles = async (actor: Actor) => (await listReviews(actor, P)).map((r) => r.title);

  it('بی‌نقش و بی‌شخص: کلِ تیم می‌بیند (پیش‌فرض)', async () => {
    await createReview(owner(), P, input({ title: 'همه' }));
    expect(await titles(ali())).toContain('همه');
    expect(await titles(bob())).toContain('همه');
  });

  it('فقط علی: بابک با همان نقش نمی‌بیند', async () => {
    await createReview(owner(), P, input({ title: 'فقط علی', userIds: [ALI] }));
    expect(await titles(ali())).toContain('فقط علی');
    expect(await titles(bob())).not.toContain('فقط علی');
    const review = (await listReviews(owner(), P)).find((r) => r.title === 'فقط علی')!;
    expect(review.people.map((p) => p.id)).toEqual([ALI]);
  });

  it('نقش و شخص با هم جمع می‌شوند', async () => {
    await createReview(owner(), P, input({ title: 'نقش', roleTagIds: [DEV] }));
    expect(await titles(bob())).toContain('نقش');
  });

  it('شخصِ بیرون از پروژه مخاطب نمی‌شود', async () => {
    const [x] = await db.insert(users).values({ email: 'x@n', name: 'غریبه' }).returning({ id: users.id });
    await expect(createReview(owner(), P, input({ title: 'بد', userIds: [x!.id] }))).rejects.toThrow();
  });
});
