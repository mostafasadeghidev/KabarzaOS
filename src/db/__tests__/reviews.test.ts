import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  attachments, currencies, notifications, projectClients, projectMembers, projects, tags, tasks, userRoles, users,
} from '../schema';
import {
  addReviewItem, addReviewMedia, createReview, deleteReview, getReview, listReviews, reviewFormOptions, updateReview,
} from '@/server/projects/reviews';
import { getProjectDetail, getTaskDetail, myTasks, setTaskStatus } from '@/server/projects/service';
import { canViewFile } from '@/server/files/service';
import { NotFoundError } from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * بازبینی‌های پروژه (۱.۱۱۶.۰) روی دیتابیسِ واقعی.
 *
 * ⚠️ دو قاعدهٔ اصلی: بازبینیِ نقشی را فقط همان نقش‌ها (و مدیر) می‌بینند، و
 * تسکِ ساخته‌شده از بازبینیِ پنهان از کارفرما در **هیچ** مسیرِ کارفرما نمی‌آید.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 40 }, (_, i) => i)]);
const shot = { name: 'shot.png', mime: 'image/png', bytes: PNG };

const O = 1, DEV = 2, DES = 3, C = 4;
const actor = (id: number, role: 'owner' | 'member' | 'client'): Actor => ({ id, roles: [role], permissions: [], privateAccess: false });
const owner = actor(O, 'owner');
const dev = actor(DEV, 'member');
const designer = actor(DES, 'member');
const client = actor(C, 'client');
let P = 0, DEV_ROLE = 0, DES_ROLE = 0, REVIEW_STATUS = 0;

const item = (title: string, over: Partial<Parameters<typeof addReviewItem>[2]> = {}) => ({
  title, description: '', statusTagId: null, priorityTagId: null, assignedTo: null, dueDate: null,
  isPrivate: false, roleTagIds: [], start: null, end: null, area: '', clientHidden: false, ...over,
});
const review = (over: Partial<Parameters<typeof createReview>[2]> = {}) => ({
  title: 'بازبینیِ موبایل', videoUrl: 'https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184',
  source: null, notes: '', roleTagIds: [], clientVisible: false, ...over,
});

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, attachments, files, comments, task_roles, tasks, review_roles, reviews,
    project_clients, project_members, projects, tags, user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'd@t', name: 'سارا' }, { email: 'g@t', name: 'علی' }, { email: 'c@t', name: 'آلفا' },
  ]);
  await db.insert(userRoles).values([
    { userId: O, role: 'owner' }, { userId: DEV, role: 'member' }, { userId: DES, role: 'member' }, { userId: C, role: 'client' },
  ]);
  const t = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'دولوپر', type: 'member_role' },
    { name: 'دیزاینر', type: 'member_role' },
    { name: 'آماده برای بررسی', type: 'task_status', statusGroup: 'in_progress', isReview: true },
    // نقشی که به هیچ‌کس در این پروژه سپرده نشده — نباید در فرمِ بازبینی بیاید.
    { name: 'انیماتور', type: 'member_role' },
    { name: 'هدر', type: 'site_area' },
  ]).returning({ id: tags.id });
  [DEV_ROLE, DES_ROLE, REVIEW_STATUS] = [t[1]!.id, t[2]!.id, t[3]!.id];
  const [p] = await db.insert(projects).values({ title: 'سایت', price: '0', statusTagId: t[0]!.id }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values([
    { projectId: P, userId: DEV, roleTagId: DEV_ROLE, agreedAmount: '0' },
    { projectId: P, userId: DES, roleTagId: DES_ROLE, agreedAmount: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: P, userId: C });
});

afterAll(async () => { await sql.end(); });

describe('مخاطبِ بازبینی', () => {
  let rid = 0;
  beforeAll(async () => {
    rid = await createReview(owner, P, review({ roleTagIds: [DEV_ROLE] }), [shot]);
  });

  it('منبع از پیوند حدس زده می‌شود و فقط دولوپر (و مدیر) می‌بیند', async () => {
    expect((await getReview(owner, rid)).review.source).toBe('loom');
    expect((await listReviews(dev, P)).map((r) => r.id)).toEqual([rid]);
    expect(await listReviews(designer, P)).toEqual([]);
    expect(await listReviews(client, P)).toEqual([]);
    await expect(getReview(designer, rid)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getReview(client, rid)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('پیوستِ بازبینی گاردِ خودِ بازبینی را دارد', async () => {
    const [a] = await db.select({ fileId: attachments.fileId }).from(attachments).where(eq(attachments.reviewId, rid));
    expect(await canViewFile(dev, a!.fileId!)).toBe(true);
    expect(await canViewFile(designer, a!.fileId!)).toBe(false);
    expect(await canViewFile(client, a!.fileId!)).toBe(false);
  });

  it('فقط مخاطب اعلان می‌گیرد — نه دیزاینر، نه کارفرما', async () => {
    const rows = await db.select({ userId: notifications.userId }).from(notifications).where(eq(notifications.type, 'review.posted'));
    expect(rows.map((r) => r.userId)).toEqual([DEV]);
  });

  it('عضو نمی‌سازد و ویرایش نمی‌کند', async () => {
    await expect(createReview(dev, P, review())).rejects.toThrow();
    await expect(updateReview(dev, rid, review())).rejects.toThrow();
  });
});

describe('موردها و پنهان‌ماندن از کارفرما', () => {
  let rid = 0, taskId = 0;
  beforeAll(async () => {
    rid = await createReview(owner, P, review({ title: 'داخلی' }));
    ({ taskId } = await addReviewItem(owner, rid, item('منوی موبایل', { start: 80, end: 65, area: 'هدر' }), [shot]));
  });

  it('مورد ← تسک: بازه مرتب می‌شود و پنهان از کارفرما است', async () => {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect([row!.reviewId, row!.reviewStart, row!.reviewEnd, row!.area, row!.clientHidden]).toEqual([rid, 65, 80, 'هدر', true]);
    const detail = await getReview(owner, rid);
    expect(detail.progress).toEqual({ done: 0, total: 1, percent: 0 });
  });

  it('⚠️ کارفرما تسک را نه در تخته، نه در مودال، نه فایلش را می‌بیند؛ تیم می‌بیند', async () => {
    expect((await getProjectDetail(client, P)).tasks.map((t) => t.id)).not.toContain(taskId);
    await expect(getTaskDetail(client, taskId)).rejects.toBeInstanceOf(NotFoundError);
    const [a] = await db.select({ fileId: attachments.fileId }).from(attachments).where(eq(attachments.taskId, taskId));
    expect(await canViewFile(client, a!.fileId!)).toBe(false);
    expect((await getProjectDetail(owner, P)).tasks.map((t) => t.id)).toContain(taskId);
    expect((await getTaskDetail(dev, taskId)).task.id).toBe(taskId);
  });

  it('⚠️ رفتن به «آماده برای بررسی» نه اعلانِ کارفرما می‌سازد نه در صندوقش می‌آید', async () => {
    await setTaskStatus(owner, taskId, REVIEW_STATUS);
    const notes = await db.select({ userId: notifications.userId }).from(notifications).where(eq(notifications.type, 'task.review'));
    expect(notes.map((n) => n.userId)).not.toContain(C);
    const inbox = await myTasks(client);
    expect(JSON.stringify(inbox)).not.toContain('منوی موبایل');
  });

  it('روشن‌کردنِ «برای کارفرما» موردها را هم آشکار می‌کند', async () => {
    await updateReview(owner, rid, review({ title: 'داخلی', clientVisible: true }));
    expect((await listReviews(client, P)).map((r) => r.id)).toContain(rid);
    expect((await getTaskDetail(client, taskId)).task.id).toBe(taskId);
    await updateReview(owner, rid, review({ title: 'داخلی', clientVisible: false }));
    await expect(getTaskDetail(client, taskId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('حذفِ بازبینی تسک را نگه می‌دارد و پنهان‌بودنش را هم', async () => {
    await deleteReview(owner, rid);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect([row!.reviewId, row!.clientHidden, row!.deletedAt]).toEqual([null, true, null]);
  });
});

describe('فرمِ بازبینی (۱.۱۱۷.۰)', () => {
  it('فقط نقش‌های سپرده‌شده روی همین پروژه، و بخش‌های تنظیمات', async () => {
    const options = await reviewFormOptions(owner, P);
    expect(options.roles.map((r) => r.name).sort()).toEqual(['دولوپر', 'دیزاینر'].sort());
    expect(options.areas.map((a) => a.name)).toEqual(['هدر']);
  });

  it('تصویرِ فوری به خودِ بازبینی می‌رود؛ عضو نمی‌تواند', async () => {
    const rid = await createReview(owner, P, review({ title: 'گالری' }));
    await addReviewMedia(owner, rid, [shot, shot]);
    const rows = await db.select().from(attachments).where(eq(attachments.reviewId, rid));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.taskId === null && r.commentId === null)).toBe(true);
    await expect(addReviewMedia(dev, rid, [shot])).rejects.toThrow();
  });
});
