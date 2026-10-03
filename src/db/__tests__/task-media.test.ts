import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  attachments, comments, currencies, files, projectClients, projectMembers, projects, tags, tasks, userRoles, users,
} from '../schema';
import { addComment, addTaskNote, createTask, deleteComment, getProjectTabs, getTaskDetail } from '@/server/projects/service';
import { canViewFile, listAttachments } from '@/server/files/service';
import { ForbiddenError } from '@/domain/access/guard';
import { FileRejected } from '@/domain/files/upload';
import type { Actor } from '@/domain/access/permissions';

/**
 * تصویر و فایل در تسک، یادداشتِ تسک و کامنت (۱.۱۱۵.۰) — با S3 ِ واقعی.
 *
 * ⚠️ گاردِ اصلی: عکسِ تسکِ خصوصی را فقط کسی می‌بیند که خودِ تسک را می‌بیند؛
 * و رسانهٔ تسک در تبِ فایل‌های پروژه فهرست نمی‌شود.
 */

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...Array.from({ length: 40 }, (_, i) => i % 256),
]);
const shot = (name = 'shot.png') => ({ name, mime: 'image/png', bytes: PNG });
const evil = { name: 'evil.png', mime: 'image/png', bytes: new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]) };

const O = 1, M = 2, M2 = 3, C = 4;
const owner: Actor = { id: O, roles: ['owner'], permissions: [], privateAccess: false };
const member: Actor = { id: M, roles: ['member'], permissions: [], privateAccess: false };
const member2: Actor = { id: M2, roles: ['member'], permissions: [], privateAccess: false };
const client: Actor = { id: C, roles: ['client'], permissions: [], privateAccess: false };
let P = 0;

const input = (over: Partial<Parameters<typeof createTask>[2]> = {}) => ({
  title: 'هدر', description: '', statusTagId: null, priorityTagId: null, assignedTo: null,
  dueDate: null, dependsOn: null, isPrivate: false, roleTagIds: [], ...over,
});
const fileIdsOf = async (where: { taskId?: number; commentId?: number }) => {
  const rows = await db.select({ fileId: attachments.fileId, taskId: attachments.taskId, commentId: attachments.commentId })
    .from(attachments);
  return rows
    .filter((r) => (where.taskId === undefined || r.taskId === where.taskId)
      && (where.commentId === undefined || r.commentId === where.commentId))
    .map((r) => r.fileId!);
};

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, attachments, files, comments, task_roles, tasks,
    project_clients, project_members, projects, tags, user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm@t', name: 'سارا' },
    { email: 'm2@t', name: 'علی' }, { email: 'c@t', name: 'شرکتِ آلفا' },
  ]);
  await db.insert(userRoles).values([
    { userId: O, role: 'owner' }, { userId: M, role: 'member' },
    { userId: M2, role: 'member' }, { userId: C, role: 'client' },
  ]);
  const [inp] = await db.insert(tags).values({ name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' })
    .returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'سایت', price: '0', statusTagId: inp!.id }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values([
    { projectId: P, userId: M, agreedAmount: '0' },
    { projectId: P, userId: M2, agreedAmount: '0' },
  ]);
  await db.insert(projectClients).values({ projectId: P, userId: C });
});

afterAll(async () => { await sql.end(); });

describe('رسانهٔ تسک', () => {
  it('ساختِ تسک با چند اسکرین‌شات — ردیف‌ها به تسک وصل‌اند و در تبِ فایل‌ها نمی‌آیند', async () => {
    const id = await createTask(owner, P, input(), { media: [shot('a.png'), shot('b.png')] });
    const ids = await fileIdsOf({ taskId: id });
    expect(ids).toHaveLength(2);
    expect(await listAttachments(owner, P)).toHaveLength(0);
    // تسکِ عمومی: هر عضو و کارفرمای پروژه می‌بیند.
    for (const viewer of [member, member2, client]) {
      expect(await canViewFile(viewer, ids[0]!)).toBe(true);
    }
    const detail = await getTaskDetail(member, id);
    expect(detail.media.map((m) => m.name)).toEqual(['a.png', 'b.png']);
    // حذف فقط برای بارگذارنده یا مدیر.
    expect(detail.media.every((m) => m.canDelete === false)).toBe(true);
  });

  it('⚠️ عکسِ تسکِ خصوصی فقط برای کسی که خودِ تسک را می‌بیند', async () => {
    const id = await createTask(owner, P, input({ title: 'محرمانه', isPrivate: true, assignedTo: M }), { media: [shot()] });
    const [fileId] = await fileIdsOf({ taskId: id });
    expect(await canViewFile(member, fileId!)).toBe(true); // مسئول
    expect(await canViewFile(member2, fileId!)).toBe(false); // عضوِ همان پروژه
    expect(await canViewFile(client, fileId!)).toBe(false); // کارفرما
  });

  it('⚠️ فایلِ ردشده هیچ تسک و هیچ فایلی جا نمی‌گذارد', async () => {
    const before = { tasks: (await db.select().from(tasks)).length, files: (await db.select().from(files)).length };
    await expect(createTask(owner, P, input({ title: 'نیمه‌کاره' }), { media: [shot(), evil] }))
      .rejects.toBeInstanceOf(FileRejected);
    expect((await db.select().from(tasks)).length).toBe(before.tasks);
    expect((await db.select().from(files)).length).toBe(before.files);
  });
});

describe('یادداشتِ تسک', () => {
  it('یادداشتِ فقط‌عکس پذیرفته می‌شود و رسانه‌اش کنارِ همان یادداشت است', async () => {
    const id = await createTask(owner, P, input({ title: 'فوتر' }), { media: [shot('task.png')] });
    await addTaskNote(member, id, '   ', [shot('note.png')]);
    const detail = await getTaskDetail(member, id);
    expect(detail.media.map((m) => m.name)).toEqual(['task.png']);
    expect(detail.notes).toHaveLength(1);
    expect(detail.notes[0]!.media.map((m) => m.name)).toEqual(['note.png']);
    // بارگذارنده خودش حذف می‌کند.
    expect(detail.notes[0]!.media[0]!.canDelete).toBe(true);
  });

  it('یادداشتِ بی‌متن و بی‌عکس رد می‌شود', async () => {
    const id = await createTask(owner, P, input({ title: 'خالی' }));
    await expect(addTaskNote(member, id, '  ')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('کامنتِ پروژه', () => {
  it('کامنتِ فقط‌عکس، و حذفِ کامنت فایلِ خودش و پاسخ‌هایش را هم پاک می‌کند', async () => {
    await addComment(client, P, '', null, [shot('root.png')]);
    // ⚠️ یادداشتِ فقط‌عکسِ تسک هم متنِ خالی دارد؛ کامنتِ پروژه بی‌تسک است.
    const [root] = await db.select({ id: comments.id }).from(comments)
      .where(and(eq(comments.body, ''), isNull(comments.taskId)));
    await addComment(member, P, 'اصلاح شد', root!.id, [shot('reply.png')]);

    const tabs = await getProjectTabs(member, P);
    const withMedia = tabs.comments.filter((c) => c.media.length > 0);
    expect(withMedia.map((c) => c.media[0]!.name).sort()).toEqual(['reply.png', 'root.png']);

    const fileIds = [...await fileIdsOf({ commentId: root!.id })];
    const replyId = withMedia.find((c) => c.media[0]!.name === 'reply.png')!.id;
    fileIds.push(...await fileIdsOf({ commentId: replyId }));
    expect(fileIds).toHaveLength(2);

    await deleteComment(owner, root!.id);
    const left = await db.select({ id: files.id }).from(files);
    expect(left.filter((f) => fileIds.includes(f.id))).toHaveLength(0);
  });
});
