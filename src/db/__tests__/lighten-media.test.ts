import { describe, it, expect, beforeAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, sql } from '../client';
import { attachments, comments, files, projects, reviews, tasks, users } from '../schema';
import * as service from '@/server/projects/service';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * سبک‌سازی و حذفِ پروژه باید **همهٔ** فایل‌ها را ببرد (۲.۱۹.۰): فایلِ تبِ فایل‌ها،
 * رسانهٔ تسک، رسانهٔ کامنت و پیوستِ بازبینی. پیش‌تر ردیفِ رسانهٔ تسک و کامنت با
 * حذفِ مادرش می‌رفت و فایلِ فیزیکی یتیم می‌ماند.
 */

const manager = (): Actor => ({ id: 1, roles: [], permissions: ['projects.manage'] as Permission[], privateAccess: false });
const owner = (): Actor => ({ id: 1, roles: ['owner'], permissions: [], privateAccess: false });

let uid = 0;

async function projectWithMedia(title: string) {
  const [p] = await db.insert(projects).values({ title }).returning({ id: projects.id });
  const projectId = p!.id;
  const [t] = await db.insert(tasks).values({ projectId, title: 'تسک', createdBy: uid }).returning({ id: tasks.id });
  const [c] = await db.insert(comments).values({ projectId, userId: uid, body: 'کامنت' }).returning({ id: comments.id });
  const [r] = await db.insert(reviews).values({ projectId, title: 'بازبینی', createdBy: uid }).returning({ id: reviews.id });

  const make = async (key: string) => {
    const [f] = await db.insert(files).values({
      storageKey: `test/${title}/${key}`, mime: 'image/png', size: 1, originalName: `${key}.png`, purpose: 'attachment', uploadedBy: uid,
    }).returning({ id: files.id });
    return f!.id;
  };
  const fileIds = {
    project: await make('project'), task: await make('task'), comment: await make('comment'), review: await make('review'),
  };
  await db.insert(attachments).values([
    { projectId, fileId: fileIds.project, kind: 'image', userId: uid },
    { projectId, taskId: t!.id, fileId: fileIds.task, kind: 'image', userId: uid },
    { projectId, commentId: c!.id, fileId: fileIds.comment, kind: 'image', userId: uid },
    { projectId, reviewId: r!.id, fileId: fileIds.review, kind: 'image', userId: uid },
  ]);
  return { projectId, fileIds: Object.values(fileIds) };
}

beforeAll(async () => {
  await sql`truncate table attachments, reviews, comments, tasks, projects, files, audit_log, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'm@n', name: 'مدیر' }).returning({ id: users.id });
  uid = u!.id;
});

describe('فایل‌ها هنگامِ سبک‌سازی و حذف', () => {
  it('سبک‌سازی فایلِ پروژه، تسک، کامنت و بازبینی را می‌برد و بازبینی‌ها را پاک می‌کند', async () => {
    const { projectId, fileIds } = await projectWithMedia('light');
    await service.setArchived(manager(), projectId, true);
    await service.lightenProject(manager(), projectId);

    expect(await db.select().from(files).where(inArray(files.id, fileIds))).toHaveLength(0);
    expect(await db.select().from(attachments).where(eq(attachments.projectId, projectId))).toHaveLength(0);
    expect(await db.select().from(reviews).where(eq(reviews.projectId, projectId))).toHaveLength(0);
  });

  it('حذفِ کاملِ پروژه هم فایلِ رسانهٔ تسک و کامنت را یتیم نمی‌گذارد', async () => {
    const { projectId, fileIds } = await projectWithMedia('del');
    await service.deleteProject(owner(), projectId, { mode: 'detach', confirmTitle: 'del' });

    expect(await db.select().from(files).where(inArray(files.id, fileIds))).toHaveLength(0);
  });
});
