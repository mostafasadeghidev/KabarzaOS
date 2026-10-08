import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { db, sql } from '../client';
import { attachments, files, projects, tags, tasks, userRoles, users } from '../schema';
import { taskCard } from '@/server/telegram/task-card';
import { notify } from '@/server/notifications/service';
import { createTranslator } from '@/i18n/translate';

/**
 * کارتِ کاملِ تسک در اعلانِ تلگرام (۲.۱۲.۰): عنوان، پروژه، اولویت، ددلاین،
 * توضیح، پیوند و فایل‌های خودِ تسک — و نه رسانهٔ کامنت‌ها.
 */

let USER = 0, TASK = 0;
const tr = createTranslator({});

beforeAll(async () => {
  await sql`truncate table attachments, files, comments, tasks, projects, user_roles, tags, notifications, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'card@t', name: 'انجام‌دهنده', telegramChatId: '424242' }).returning({ id: users.id });
  USER = u!.id;
  await db.insert(userRoles).values({ userId: USER, role: 'member' });
  const [prio] = await db.insert(tags).values({ name: 'فوری', type: 'task_priority' }).returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'پروژهٔ کارت', scope: 'company' }).returning({ id: projects.id });
  const [t] = await db.insert(tasks).values({
    projectId: p!.id, title: 'طراحیِ بنر', description: 'سه سایز: ۱۰۸۰، ۷۲۰، ۴۸۰', createdBy: USER, assignedTo: USER,
    priorityTagId: prio!.id, dueDate: '2026-10-20',
  }).returning({ id: tasks.id });
  TASK = t!.id;
  const [img, doc, huge, other] = await db.insert(files).values([
    { storageKey: 'card/a.png', mime: 'image/png', size: 2000, originalName: 'ref.png', purpose: 'attachment' },
    { storageKey: 'card/b.pdf', mime: 'application/pdf', size: 5000, originalName: 'brief.pdf', purpose: 'attachment' },
    { storageKey: 'card/c.mp4', mime: 'video/mp4', size: 50 * 1024 * 1024, originalName: 'big.mp4', purpose: 'attachment' },
    { storageKey: 'card/d.png', mime: 'image/png', size: 1000, originalName: 'comment.png', purpose: 'attachment' },
  ]).returning({ id: files.id });
  const [c] = await sql<Array<{ id: number }>>`insert into comments (project_id, task_id, user_id, body) values (${p!.id}, ${TASK}, ${USER}, 'x') returning id`;
  await db.insert(attachments).values([
    { projectId: p!.id, taskId: TASK, fileId: img!.id, kind: 'file', userId: USER },
    { projectId: p!.id, taskId: TASK, fileId: doc!.id, kind: 'file', userId: USER },
    { projectId: p!.id, taskId: TASK, fileId: huge!.id, kind: 'file', userId: USER },
    { projectId: p!.id, taskId: TASK, kind: 'link', externalUrl: 'https://figma.com/file/abc', label: 'فیگما', userId: USER },
    // رسانهٔ کامنت — نباید در کارت بیاید.
    { projectId: p!.id, taskId: TASK, commentId: c!.id, fileId: other!.id, kind: 'file', userId: USER },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe('کارتِ تسک', () => {
  it('عنوان، پروژه، اولویت، ددلاین، توضیح و پیوند؛ فایل‌ها بی رسانهٔ کامنت و بی فایلِ بزرگ', async () => {
    const card = (await taskCard(TASK, 'fa', tr))!;
    const text = card.lines.join('\n');
    for (const part of ['طراحیِ بنر', 'پروژهٔ کارت', 'فوری', '2026-10-20', 'سه سایز', 'https://figma.com/file/abc']) expect(text).toContain(part);
    expect(card.files.map((f) => f.name)).toEqual(['ref.png', 'brief.pdf']);
    expect(card.files.map((f) => f.photo)).toEqual([true, false]);
    expect(text).toContain('1');
  });

  it('اعلانِ «سپرده شد» در تلگرام همان کارت را می‌فرستد', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456789:AATaskCardTestTokenForUnitTests000';
    const sentTexts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/sendMessage')) sentTexts.push(String(JSON.parse(String(init?.body)).text));
      return Response.json({ ok: true });
    }));
    await notify([USER], { type: 'task.assigned', title: 'تسکِ تازه به شما تخصیص یافت', body: 'طراحیِ بنر', url: '/projects/1?tab=tasks', taskId: TASK });
    const text = sentTexts.join('\n');
    expect(text).toContain('فوری');
    expect(text).toContain('2026-10-20');
    expect(text).toContain('سه سایز');
  });
});
