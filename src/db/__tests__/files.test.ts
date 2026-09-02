import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { attachments, files, offices, projects, projectMembers, userOffices, users, userRoles } from '../schema';
import {
  addAttachment, addLink, canViewFile, deleteAttachment, listAttachments, serveFile,
} from '@/server/files/service';
import { getObject } from '@/server/files/storage';
import { ForbiddenError } from '@/domain/access/guard';
import { FileRejected } from '@/domain/files/upload';
import type { Actor } from '@/domain/access/permissions';

/**
 * لایهٔ فایل روی دیتابیس و ذخیره‌سازیِ واقعی.
 *
 * ⚠️ گاردِ فایل جایی است که اشتباه یعنی نشتِ سندِ مالی؛ پس اینجا با S3 ِ
 * واقعی (MinIO) تست می‌شود، نه با تقلید.
 */

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // امضای PNG
  ...Array.from({ length: 40 }, (_, i) => i % 256),
]);

let ownerId: number;
let memberId: number;
let outsiderId: number;
let projectId: number;

const actorOf = (id: number, roles: Actor['roles'], permissions: string[] = []): Actor =>
  ({ id, roles, permissions: permissions as Actor['permissions'], privateAccess: false });

let owner: Actor;
let member: Actor;
let outsider: Actor;

beforeAll(async () => {
  await sql`truncate table attachments, files, project_members, projects, user_roles, users restart identity cascade`;

  const people = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'm@t', name: 'عضو' },
    { email: 'x@t', name: 'بیگانه' },
  ]).returning({ id: users.id });
  [ownerId, memberId, outsiderId] = people.map((p) => p.id) as [number, number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: memberId, role: 'member' },
    { userId: outsiderId, role: 'member' },
  ]);

  const rows = await db.insert(projects)
    .values({ title: 'پروژهٔ فایل', scope: 'company' })
    .returning({ id: projects.id });
  projectId = rows[0]!.id;

  await db.insert(projectMembers).values({ projectId, userId: memberId });

  owner = actorOf(ownerId, ['owner']);
  member = actorOf(memberId, ['member'], ['projects.view']);
  outsider = actorOf(outsiderId, ['member'], ['projects.view']);
});

afterAll(async () => {
  await sql.end();
});

const blob = (over: Partial<{ name: string; mime: string; bytes: Uint8Array }> = {}) => ({
  name: 'shot.png', mime: 'image/png', bytes: PNG, ...over,
});

describe('R-FILE-02 — اول شیء، بعد ردیف', () => {
  it('فایل واقعاً در S3 می‌نشیند و ردیفش ساخته می‌شود', async () => {
    const fileId = await addAttachment(owner, projectId, blob(), 'اسکرین‌شات');

    const rows = await db.select().from(files).where(eq(files.id, fileId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mime).toBe('image/png');
    expect(rows[0]!.size).toBe(PNG.byteLength);

    // بایت‌ها واقعاً در ذخیره‌سازی هستند.
    const stored = await getObject(rows[0]!.storageKey);
    expect(Array.from(stored)).toEqual(Array.from(PNG));
  });

  it('⚠️ فایلِ نامعتبر نه در S3 می‌رود نه ردیف می‌سازد', async () => {
    const before = await db.select({ id: files.id }).from(files);

    await expect(addAttachment(
      owner, projectId,
      blob({ name: 'evil.png', bytes: new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]) }),
      '',
    )).rejects.toBeInstanceOf(FileRejected);

    const after = await db.select({ id: files.id }).from(files);
    expect(after).toHaveLength(before.length);
  });
});

describe('R-FILE-03 — گیت یعنی این فایل، این کاربر', () => {
  let fileId: number;

  beforeAll(async () => {
    fileId = await addAttachment(owner, projectId, blob(), 'سند');
  });

  it('مالک می‌بیند', async () => {
    expect(await canViewFile(owner, fileId)).toBe(true);
  });

  it('عضوِ پروژه می‌بیند', async () => {
    expect(await canViewFile(member, fileId)).toBe(true);
  });

  it('⚠️ کسی که عضوِ پروژه نیست نمی‌بیند — حتی با ورود به حساب', async () => {
    expect(await canViewFile(outsider, fileId)).toBe(false);
    await expect(serveFile(outsider, fileId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('سرو کردن برای کاربرِ مجاز بایت و نامِ درست می‌دهد', async () => {
    const served = await serveFile(member, fileId);
    expect(Array.from(served.bytes)).toEqual(Array.from(PNG));
    expect(served.downloadName).toBe('shot.png');
    expect(served.disposition).toBe('inline');
  });

  it('درخواستِ دانلود، inline را کنار می‌زند', async () => {
    expect((await serveFile(member, fileId, true)).disposition).toBe('attachment');
  });
});

describe('R-FILE-08 — لینکِ بیرونی', () => {
  it('نشانیِ سالم ثبت می‌شود و فایلی نمی‌سازد', async () => {
    const before = await db.select({ id: files.id }).from(files);
    await addLink(owner, projectId, 'https://drive.google.com/x', 'درایو');
    const after = await db.select({ id: files.id }).from(files);
    expect(after).toHaveLength(before.length); // هیچ فایلی گرفته نشد

    const list = await listAttachments(owner, projectId);
    const link = list.find((a) => a.isLink);
    expect(link?.href).toBe('https://drive.google.com/x');
  });

  it('⚠️ javascript: رد می‌شود', async () => {
    await expect(addLink(owner, projectId, 'javascript:alert(1)', 'بد'))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('فهرستِ پیوست‌ها', () => {
  it('آدرسِ مستقیمِ S3 هرگز بیرون نمی‌رود', async () => {
    const list = await listAttachments(owner, projectId);
    for (const item of list) {
      if (!item.isLink) expect(item.href).toMatch(/^\/api\/files\/\d+$/);
    }
  });

  it('بیگانه فهرست را هم نمی‌بیند', async () => {
    await expect(listAttachments(outsider, projectId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('R-FILE-09/10 — حذف', () => {
  it('⚠️ کسی که نه بارگذار است نه مدیر، حذف نمی‌کند', async () => {
    await addAttachment(owner, projectId, blob(), 'مالِ مالک');
    const list = await listAttachments(owner, projectId);
    const target = list.find((a) => a.label === 'مالِ مالک')!;

    await expect(deleteAttachment(member, target.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('حذفِ ردیف، فایل را هم از S3 می‌برد', async () => {
    const fileId = await addAttachment(owner, projectId, blob(), 'برای حذف');
    const keyRows = await db.select({ storageKey: files.storageKey })
      .from(files).where(eq(files.id, fileId));
    const key = keyRows[0]!.storageKey;

    const list = await listAttachments(owner, projectId);
    const target = list.find((a) => a.label === 'برای حذف')!;
    await deleteAttachment(owner, target.id);

    expect(await db.select().from(files).where(eq(files.id, fileId))).toHaveLength(0);
    await expect(getObject(key)).rejects.toThrow(); // شیء هم رفت
  });

  it('حذفِ لینک فایلی برای حذف ندارد و خطا نمی‌دهد', async () => {
    await addLink(owner, projectId, 'https://example.com/a', 'لینک');
    const list = await listAttachments(owner, projectId);
    const link = list.find((a) => a.label === 'لینک')!;

    await deleteAttachment(owner, link.id);
    expect(await db.select().from(attachments).where(eq(attachments.id, link.id))).toHaveLength(0);
  });
});

/**
 * R-FILE-16 — پیش‌نمایشِ ۴۰۰ پیکسلی.
 *
 * ⚠️ فیکسچرِ PNG ِ بالای این فایل عمداً **جعلی** است (امضای درست + بایتِ
 * آشغال) و هیچ کتابخانه‌ای نمی‌تواند رمزگشایی‌اش کند. این خودش یک حالتِ
 * واقعی است و تستِ آخر همان را پین می‌کند؛ برای بقیه یک تصویرِ **واقعی**
 * ساخته می‌شود.
 */
describe('R-FILE-16 — پیش‌نمایشِ کوچک', () => {
  let realPng: Uint8Array;

  const realBlob = () => ({ name: 'aks.png', mime: 'image/png', bytes: realPng });

  beforeAll(async () => {
    // تصویرِ ۸۰۰ پیکسلی تا کوچک‌کردن واقعاً اتفاق بیفتد.
    const buf = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#3366cc' },
    }).png().toBuffer();
    realPng = new Uint8Array(buf);
  });

  it('برای تصویرِ واقعی، پیش‌نمایش ساخته و ذخیره می‌شود', async () => {
    const fileId = await addAttachment(owner, projectId, realBlob(), 'عکس');
    const [row] = await db.select().from(files).where(eq(files.id, fileId));

    expect(row!.previewKey).not.toBeNull();
    const preview = await getObject(row!.previewKey!);
    // WebP با «RIFF» شروع می‌شود.
    expect(Array.from(preview.subarray(0, 4))).toEqual([0x52, 0x49, 0x46, 0x46]);
    // ⚠️ و واقعاً کوچک‌تر از اصل است — وگرنه کلِ کار بی‌فایده بوده.
    expect(preview.byteLength).toBeLessThan(realPng.byteLength);
  });

  it('⚠️ درخواستِ نسخهٔ کوچک، اصلِ فایل را دست نمی‌زند', async () => {
    const fileId = await addAttachment(owner, projectId, realBlob(), 'عکس');

    const thumb = await serveFile(owner, fileId, false, true);
    expect(thumb.mime).toBe('image/webp');

    const full = await serveFile(owner, fileId, false, false);
    expect(full.mime).toBe('image/png');
    expect(Array.from(full.bytes)).toEqual(Array.from(realPng));
  });

  it('⚠️ دانلودِ اجباری همیشه اصلِ فایل را می‌دهد، نه نسخهٔ فشرده', async () => {
    const fileId = await addAttachment(owner, projectId, realBlob(), 'عکس');
    const served = await serveFile(owner, fileId, true, true);
    expect(served.mime).toBe('image/png');
  });

  it('حذفِ پیوست، پیش‌نمایشش را هم می‌برد', async () => {
    const fileId = await addAttachment(owner, projectId, realBlob(), 'عکس');
    const [row] = await db.select().from(files).where(eq(files.id, fileId));
    const key = row!.previewKey!;

    // ⚠️ از راهِ **پیوست** حذف می‌شود، نه مستقیم: ردیفِ فایل تا وقتی پیوستی
    // به آن ارجاع دارد کلیدِ خارجی نمی‌گذارد پاک شود — و همین درست است.
    const [att] = await db.select().from(attachments).where(eq(attachments.fileId, fileId));
    await deleteAttachment(owner, att!.id);

    await expect(getObject(key)).rejects.toThrow();
    expect(await db.select().from(files).where(eq(files.id, fileId))).toHaveLength(0);
  });

  it('⚠️ تصویرِ رمزگشایی‌نشدنی پیش‌نمایش ندارد ولی خودش سالم سِرو می‌شود', async () => {
    // امضای PNG درست است ولی محتوا آشغال — آپلود نباید بشکند.
    const fileId = await addAttachment(owner, projectId, blob(), 'خراب');
    const [row] = await db.select().from(files).where(eq(files.id, fileId));
    expect(row!.previewKey).toBeNull();

    // و درخواستِ نسخهٔ کوچک بی‌سروصدا به اصل برمی‌گردد، نه خطا.
    const served = await serveFile(owner, fileId, false, true);
    expect(served.mime).toBe('image/png');
    expect(Array.from(served.bytes)).toEqual(Array.from(PNG));
  });
});

describe('گیتِ فایل = همان تصمیمِ دسترسیِ پروژه، نه یک نسخهٔ دوباره‌نویسی‌شده', () => {
  it('⚠️ عضوی که دسترسی‌اش قطع شده، فایل را نمی‌بیند', async () => {
    // ⚠️ نسخهٔ قبلیِ گیت عضویت را مستقیم می‌خواند و access_blocked را نمی‌دید.
    const fileId = await addAttachment(owner, projectId, blob(), 'برای عضوِ قطع‌شده');
    await db.update(projectMembers).set({ accessBlocked: true })
      .where(eq(projectMembers.userId, memberId));
    try {
      expect(await canViewFile(member, fileId)).toBe(false);
      await expect(serveFile(member, fileId)).rejects.toBeInstanceOf(ForbiddenError);
    } finally {
      await db.update(projectMembers).set({ accessBlocked: false })
        .where(eq(projectMembers.userId, memberId));
    }
    expect(await canViewFile(member, fileId)).toBe(true);
  });

  it('مدیرِ دفترِ مالکِ پروژه بدونِ امضا و بدونِ مجوزِ سراسری می‌بیند', async () => {
    // ⚠️ همان مدیرِ دفتری که پیش از این روی فایل‌های دفترِ خودش ۴۰۳ می‌گرفت.
    const [office] = await db.insert(offices).values({ name: 'دفترِ فایل' }).returning({ id: offices.id });
    await db.update(projects).set({ officeId: office!.id }).where(eq(projects.id, projectId));
    await db.insert(userOffices).values({ userId: outsiderId, officeId: office!.id, manages: true });
    const fileId = await addAttachment(owner, projectId, blob(), 'برای مدیرِ دفتر');
    try {
      expect(await canViewFile(actorOf(outsiderId, ['member']), fileId)).toBe(true);
    } finally {
      await db.delete(userOffices).where(eq(userOffices.userId, outsiderId));
      await db.update(projects).set({ officeId: null }).where(eq(projects.id, projectId));
    }
    // بدونِ مدیریتِ دفتر، همان بیگانه است.
    expect(await canViewFile(actorOf(outsiderId, ['member']), fileId)).toBe(false);
  });
});
