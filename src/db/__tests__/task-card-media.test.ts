import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { db, sql } from '../client';
import { attachments, files, projects, tasks, userRoles, users } from '../schema';
import { notify } from '@/server/notifications/service';

/**
 * عکس و متنِ تسک در **یک پیام** (۲.۱۴.۰): یک عکس ← sendPhoto با زیرنویس و دکمه؛
 * چند عکس ← آلبوم با متن زیرِ آن، و دکمه‌ها با پیامِ کوتاهِ بعدی.
 */

vi.mock('@/server/files/storage', async (orig) => ({
  ...(await orig<typeof import('@/server/files/storage')>()),
  getObject: async () => Buffer.from('img'),
}));

let USER = 0, PROJECT = 0;

beforeAll(async () => {
  await sql`truncate table attachments, files, comments, tasks, projects, user_roles, tags, notifications, users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'media@t', name: 'انجام‌دهنده', telegramChatId: '515151' }).returning({ id: users.id });
  USER = u!.id;
  await db.insert(userRoles).values({ userId: USER, role: 'member' });
  const [p] = await db.insert(projects).values({ title: 'پروژهٔ عکس', scope: 'company' }).returning({ id: projects.id });
  PROJECT = p!.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.APP_URL;
});

async function taskWithPhotos(n: number, description = 'توضیحِ تسک') {
  const [t] = await db.insert(tasks).values({
    projectId: PROJECT, title: `تسکِ ${n} عکس`, description, createdBy: USER, assignedTo: USER,
  }).returning({ id: tasks.id });
  for (let i = 0; i < n; i++) {
    const [f] = await db.insert(files).values({
      storageKey: `media/${t!.id}-${i}.png`, mime: 'image/png', size: 100, originalName: `p${i}.png`, purpose: 'attachment',
    }).returning({ id: files.id });
    await db.insert(attachments).values({ projectId: PROJECT, taskId: t!.id, fileId: f!.id, kind: 'file', userId: USER });
  }
  return t!.id;
}

function capture() {
  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAMediaTestTokenForUnitTestsOnly00';
  process.env.APP_URL = 'https://app.test';
  const calls: Array<{ method: string; form?: FormData; json?: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = url.split('/').pop()!;
    if (init?.body instanceof FormData) calls.push({ method, form: init.body });
    else calls.push({ method, json: JSON.parse(String(init?.body)) });
    return Response.json({ ok: true });
  }));
  return calls;
}

describe('عکس و متنِ تسک با هم', () => {
  it('یک عکس: یک sendPhoto با متن به‌عنوانِ زیرنویس و دکمه‌ها؛ پیامِ متنیِ جدا نه', async () => {
    const taskId = await taskWithPhotos(1);
    const calls = capture();
    await notify([USER], { type: 'task.assigned', title: 'تسکِ تازه', url: '/projects/1?tab=tasks', taskId });
    expect(calls.map((c) => c.method)).toEqual(['sendPhoto']);
    expect(String(calls[0]!.form!.get('caption'))).toContain('توضیحِ تسک');
    expect(String(calls[0]!.form!.get('reply_markup'))).toContain('web_app');
  });

  it('چند عکس: یک آلبوم با متن زیرِ آن، بعد دکمه‌ها', async () => {
    const taskId = await taskWithPhotos(3);
    const calls = capture();
    await notify([USER], { type: 'task.assigned', title: 'تسکِ تازه', url: '/projects/1?tab=tasks', taskId });
    expect(calls.map((c) => c.method)).toEqual(['sendMediaGroup', 'sendMessage']);
    const media = JSON.parse(String(calls[0]!.form!.get('media'))) as Array<{ caption?: string; media: string }>;
    expect(media).toHaveLength(3);
    expect(media[0]!.caption).toContain('توضیحِ تسک');
    expect(media.slice(1).every((m) => m.caption === undefined)).toBe(true);
    expect(calls[1]!.json!.reply_markup).toBeTruthy();
  });

  it('متنِ بلند در سقفِ زیرنویس کوتاه می‌شود؛ پیوند در دکمه است، نه نشانیِ خام (۲.۱۶.۲)', async () => {
    const taskId = await taskWithPhotos(1, 'الف'.repeat(3000));
    const calls = capture();
    await notify([USER], { type: 'task.assigned', title: 'تسکِ تازه', url: '/projects/1?tab=tasks', taskId });
    const caption = String(calls[0]!.form!.get('caption'));
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).not.toContain('https://app.test');
    expect(String(calls[0]!.form!.get('reply_markup'))).toContain('app.test');
  });
});
