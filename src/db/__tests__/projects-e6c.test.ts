import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  comments, currencies, notifications, projectMembers, projects, tags, tasks, tenderBids, timelogs,
  unitEntries, userRoles, users,
} from '../schema';
import {
  addProjectMember, approveBid, createProject, deleteComment, removeProjectMember, setTaskStatus,
} from '@/server/projects/service';
import { activeProjectIdsSince, listBids } from '@/server/projects/repository';
import { addUnitEntry, MemberMoneyError } from '@/server/finance/member-service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** قواعدِ سرورِ صفحهٔ پروژه — پورتِ add_member / approve / remove_member / set_status_tag / clean_date. */

const OWNER = 1, M1 = 2, M2 = 3, OFF = 4;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const member = (id: number): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });

let EUR = 0, DEV = 0, REVIEW = 0, DONE = 0, TODO = 0, LEAD = 0, INP = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, comments, task_roles, tasks, tender_bids, timelogs, unit_entries,
    project_members, project_clients, projects, tags, user_roles, users, currencies restart identity cascade`;

  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال', decimals: 0 },
  ]).returning({ id: currencies.id });
  EUR = c[0]!.id;
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }, { email: 'm2@t', name: 'علی' },
    { email: 'off@t', name: 'سابق', memberState: 'locked' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }, { userId: M2, role: 'member' }, { userId: OFF, role: 'member' },
  ]);
  const tg = await db.insert(tags).values([
    { name: 'دولوپر', type: 'member_role' },
    { name: 'شروع نشده', type: 'task_status', statusGroup: 'todo' },
    { name: 'نیاز به ریویو', type: 'task_status', statusGroup: 'review', isReview: true },
    { name: 'انجام شد', type: 'task_status', statusGroup: 'complete', isClosed: true },
    { name: 'مذاکره', type: 'project_status', statusGroup: 'lead' },
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
  ]).returning({ id: tags.id });
  const ids = tg.map((r) => r.id);
  [DEV, TODO, REVIEW, DONE, LEAD, INP] = [ids[0]!, ids[1]!, ids[2]!, ids[3]!, ids[4]!, ids[5]!];
});

afterAll(async () => { await sql.end(); });

describe('ارزِ پیش‌فرض و افزودنِ عضو', () => {
  it('پروژهٔ بی‌ارز ارزِ پیش‌فرضِ شرکت را می‌گیرد (پورتِ currency_id)', async () => {
    const id = await createProject(owner(), {
      title: 'بی‌ارز', description: '', regDate: '2026-09-01', deadline: null, statusTagId: INP,
      price: '100', currencyId: null, officeId: null, parentId: null, isUnitBased: true, isTender: false, scope: 'company',
    } as Parameters<typeof createProject>[1]);
    const [row] = await db.select({ currencyId: projects.currencyId }).from(projects).where(eq(projects.id, id));
    expect(row!.currencyId).toBe(EUR);
  });

  it('افزودن از کارت نرخِ واحد و ارزِ فراخوان را می‌نویسد؛ افزایش هم', async () => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, 'بی‌ارز'));
    await addProjectMember(owner(), p!.id, { userId: M1, roleTagId: DEV, agreedAmount: '100', unitRate: '5', currencyId: EUR });
    let [m] = await db.select().from(projectMembers).where(eq(projectMembers.userId, M1));
    expect([m!.unitRate, m!.currencyId]).toEqual(['5.0000', EUR]);
    await addProjectMember(owner(), p!.id, { userId: M1, roleTagId: DEV, agreedAmount: '150', unitRate: '7' });
    [m] = await db.select().from(projectMembers).where(eq(projectMembers.userId, M1));
    expect([m!.agreedAmount, m!.unitRate]).toEqual(['150.0000', '7.0000']);
  });

  it('ردیفِ کارکرد: فقط پروژهٔ تعدادی؛ تاریخِ نامعتبر → امروز', async () => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, 'بی‌ارز'));
    const id = await addUnitEntry(member(M1), { projectId: p!.id, userId: M1, entryDate: 'bad-date', quantity: 2, note: '' });
    const [row] = await db.select().from(unitEntries).where(eq(unitEntries.id, id));
    expect(row!.entryDate).toBe(new Date().toISOString().slice(0, 10));

    await db.update(projects).set({ isUnitBased: false }).where(eq(projects.id, p!.id));
    await expect(addUnitEntry(member(M1), { projectId: p!.id, userId: M1, entryDate: '2026-09-01', quantity: 1, note: '' }))
      .rejects.toMatchObject({ reason: 'not_unit_based' } satisfies Partial<MemberMoneyError>);
  });

  it('حذفِ صریحِ ردیفِ عضویت — فقط مدیرِ پروژه', async () => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, 'بی‌ارز'));
    const [m] = await db.select({ id: projectMembers.id }).from(projectMembers).where(eq(projectMembers.userId, M1));
    // غیرعضو پروژه را نمی‌بیند (NotFound)؛ عضوِ عادی مدیر نیست (Forbidden) — هر دو رد می‌شوند.
    await expect(removeProjectMember(member(M2), p!.id, m!.id)).rejects.toThrow();
    expect(await removeProjectMember(owner(), p!.id, m!.id)).toBe(M1);
    expect(await db.select().from(projectMembers).where(eq(projectMembers.userId, M1))).toHaveLength(0);
  });
});

describe('وضعیتِ تسک (پورتِ set_status_tag)', () => {
  it('⚠️ updated_by مهر می‌خورد؛ تأییدِ ریویو → انجام‌شده اعلانِ «برگشت» نمی‌فرستد', async () => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, 'بی‌ارز'));
    const [task] = await db.insert(tasks).values({ projectId: p!.id, title: 'تسک', statusTagId: REVIEW, assignedTo: M2, createdBy: OWNER })
      .returning({ id: tasks.id });
    await db.delete(notifications);

    await setTaskStatus(owner(), task!.id, DONE);
    const [row] = await db.select({ updatedBy: tasks.updatedBy, statusTagId: tasks.statusTagId }).from(tasks).where(eq(tasks.id, task!.id));
    expect(row!.updatedBy).toBe(OWNER);
    expect(await db.select().from(notifications).where(eq(notifications.userId, M2))).toHaveLength(0);

    // ریویو → شروع‌نشده = برگشت: اعلان می‌رود.
    await db.update(tasks).set({ statusTagId: REVIEW }).where(eq(tasks.id, task!.id));
    await setTaskStatus(owner(), task!.id, TODO);
    expect((await db.select().from(notifications).where(eq(notifications.userId, M2))).map((n) => n.type)).toEqual(['task.back']);
  });
});

describe('تأییدِ پیشنهاد (پورتِ approve → add_member)', () => {
  let T = 0;
  beforeAll(async () => {
    const [t] = await db.insert(projects).values({
      title: 'مناقصه', price: '1000', currencyId: EUR, isTender: true, statusTagId: LEAD,
      tenderRoles: { [String(DEV)]: '1000' },
    }).returning({ id: projects.id });
    T = t!.id;
  });

  it('برندهٔ تازه‌وارد اعلانِ امضا می‌گیرد؛ عضوِ غیرفعال امضا نمی‌شود؛ فهرستِ پیشنهادها نقش→برنده→ارزان', async () => {
    const b = await db.insert(tenderBids).values([
      { projectId: T, userId: M2, roleTagId: DEV, amount: '900', status: 'pending' },
      { projectId: T, userId: M1, roleTagId: DEV, amount: '700', status: 'pending' },
      { projectId: T, userId: OFF, roleTagId: DEV, amount: '100', status: 'pending' },
    ]).returning({ id: tenderBids.id });
    await db.delete(notifications);

    await expect(approveBid(owner(), b[2]!.id)).rejects.toBeInstanceOf(ForbiddenError);

    await approveBid(owner(), b[0]!.id);
    expect((await db.select().from(notifications).where(eq(notifications.userId, M2))).map((n) => n.type)).toEqual(['project.signed']);

    const bids = await listBids(T);
    // برنده اول، بعد ارزان‌تر.
    expect(bids.map((x) => [x.userId, x.status])).toEqual([[M2, 'approved'], [OFF, 'pending'], [M1, 'pending']]);
  });

  it('⚠️ ادغامِ همان (کاربر، نقش): فقط مبلغِ بزرگ‌تر می‌نشیند', async () => {
    await db.update(projectMembers).set({ agreedAmount: '950' }).where(eq(projectMembers.userId, M2));
    const [again] = await db.select({ id: tenderBids.id }).from(tenderBids).where(eq(tenderBids.userId, M2));
    await db.update(tenderBids).set({ status: 'pending' }).where(eq(tenderBids.id, again!.id));
    await approveBid(owner(), again!.id);
    const [m] = await db.select({ agreed: projectMembers.agreedAmount }).from(projectMembers).where(eq(projectMembers.userId, M2));
    expect(Number(m!.agreed)).toBe(950);
  });
});

describe('کامنت و فعالیت', () => {
  it('حذفِ کامنت همهٔ پاسخ‌های زیرِ آن را هم می‌برد', async () => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, 'بی‌ارز'));
    const [root] = await db.insert(comments).values({ projectId: p!.id, userId: OWNER, body: 'ریشه', status: 'needs_review' }).returning({ id: comments.id });
    const [child] = await db.insert(comments).values({ projectId: p!.id, userId: M2, parentId: root!.id, body: 'پاسخ', status: 'needs_review' }).returning({ id: comments.id });
    await db.insert(comments).values({ projectId: p!.id, userId: M2, parentId: child!.id, body: 'پاسخِ پاسخ', status: 'needs_review' });
    await db.insert(comments).values({ projectId: p!.id, userId: M2, body: 'جدا', status: 'needs_review' });

    await deleteComment(owner(), root!.id);
    const left = await db.select({ body: comments.body }).from(comments).where(eq(comments.projectId, p!.id));
    expect(left.map((c) => c.body)).toEqual(['جدا']);
  });

  it('پروژهٔ فعال = ساعت/تسک/کامنت/ویرایش از تاریخ به بعد', async () => {
    const [a] = await db.insert(projects).values({ title: 'کهنه', price: '0', currencyId: EUR, statusTagId: INP, updatedAt: new Date('2026-01-01T00:00:00Z') }).returning({ id: projects.id });
    const [b] = await db.insert(projects).values({ title: 'با ساعت', price: '0', currencyId: EUR, statusTagId: INP, updatedAt: new Date('2026-01-01T00:00:00Z') }).returning({ id: projects.id });
    await db.insert(timelogs).values({ projectId: b!.id, userId: M1, logDate: '2026-09-01', minutes: 30 });
    const active = await activeProjectIdsSince('2026-08-20');
    expect(active.has(b!.id)).toBe(true);
    expect(active.has(a!.id)).toBe(false);
  });
});
