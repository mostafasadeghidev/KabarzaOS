import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { db, sql } from '../client';
import { attachments, files, projectMembers, projects, schedulerStamps, uploadSessions, userRoles, users } from '../schema';
import {
  abortUpload, completeUpload, purgeStaleUploads, putChunk, startUpload, UploadConflict, UploadNotFound, uploadStatus,
} from '@/server/files/chunked';
import { getObject } from '@/server/files/storage';
import { saveCloudConnection } from '@/server/cloud/connections';
import { setFileStore } from '@/server/files/cloud-store';
import { CHUNK_SIZE, FileRejected } from '@/domain/files/upload';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * آپلودِ تکه‌ای و ازسرگرفتنی (۳.۱۰.۰): باکتِ واقعی (multipart ِ S3) و Nextcloud ِ ساختگی
 * (پوشهٔ uploads + MOVE ِ .file). تکه‌ها مستقیم به مقصد می‌روند؛ جلسه مالِ همان کاربر است.
 */

const dav = new Map<string, Uint8Array>();
const chunks = new Map<string, Map<string, Uint8Array>>();
const realFetch = globalThis.fetch;
const FILES = '/remote.php/dav/files/kabarza-os/';
const UPLOADS = '/remote.php/dav/uploads/kabarza-os/';

let owner: Actor, member: Actor, outsider: Actor, projectId: number, conn: number;

/** فایلِ zip ِ ساختگی: امضای PK و بقیه بایت‌های الگودار، به اندازهٔ دلخواه. */
function zipBytes(size: number): Uint8Array {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + 7) & 0xff;
  b.set([0x50, 0x4b, 0x03, 0x04], 0);
  return b;
}
const slice = (b: Uint8Array, n: number) => b.subarray(n * CHUNK_SIZE, Math.min(b.byteLength, (n + 1) * CHUNK_SIZE));

beforeAll(async () => {
  await sql`truncate table upload_sessions, attachments, files, project_members, projects, cloud_connections, services, user_roles, users restart identity cascade`;
  await db.delete(schedulerStamps).where(like(schedulerStamps.key, 'files:store%'));
  const [o, m, x] = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm@t', name: 'عضو' }, { email: 'x@t', name: 'غریبه' },
  ]).returning({ id: users.id });
  await db.insert(userRoles).values([{ userId: o!.id, role: 'owner' }, { userId: m!.id, role: 'member' }, { userId: x!.id, role: 'member' }]);
  owner = { id: o!.id, roles: ['owner'], permissions: ['members.manage'] as Permission[], privateAccess: false };
  member = { id: m!.id, roles: ['member'], permissions: [], privateAccess: false };
  outsider = { id: x!.id, roles: ['member'], permissions: [], privateAccess: false };
  const [p] = await db.insert(projects).values({ title: 'آپلودِ بزرگ', scope: 'company' }).returning({ id: projects.id });
  projectId = p!.id;
  await db.insert(projectMembers).values({ projectId, userId: member.id });

  vi.stubGlobal('fetch', vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.hostname !== 'cloud.example.com') return realFetch(input, init);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith(UPLOADS)) {
      const [dir, name] = path.slice(UPLOADS.length).split('/');
      if (init.method === 'MKCOL') { chunks.set(dir!, new Map()); return new Response(null, { status: 201 }); }
      if (init.method === 'DELETE') { chunks.delete(dir!); return new Response(null, { status: 204 }); }
      const set = chunks.get(dir!);
      if (!set) return new Response(null, { status: 404 });
      if (init.method === 'PUT') { set.set(name!, new Uint8Array(init.body as Uint8Array)); return new Response(null, { status: 201 }); }
      if (init.method === 'MOVE' && name === '.file') {
        // سرِ هم به ترتیبِ نامِ تکه — همان کاری که Nextcloud می‌کند.
        const parts = [...set.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
        const all = new Uint8Array(parts.reduce((s, v) => s + v.byteLength, 0));
        let off = 0; for (const v of parts) { all.set(v, off); off += v.byteLength; }
        if (Number(headers['OC-Total-Length']) !== all.byteLength) return new Response(null, { status: 400 });
        dav.set(decodeURIComponent(new URL(headers.Destination!).pathname).slice(FILES.length), all);
        chunks.delete(dir!);
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 405 });
    }
    if (!path.startsWith(FILES)) return new Response(null, { status: 404 });
    const rel = path.slice(FILES.length);
    if (init.method === 'MKCOL') return new Response(null, { status: 201 });
    if (init.method === 'PUT') { dav.set(rel, new Uint8Array(init.body as Uint8Array)); return new Response(null, { status: 201 }); }
    if (init.method === 'DELETE') return new Response(null, { status: dav.delete(rel) ? 204 : 404 });
    const f = dav.get(rel);
    return f ? new Response(f as unknown as BodyInit, { status: 200, headers: { 'Content-Length': String(f.byteLength) } }) : new Response(null, { status: 404 });
  }));

  conn = await saveCloudConnection(owner, null, {
    name: 'Main', baseUrl: 'https://cloud.example.com', username: 'kabarza-os', groupId: 'team', defaultQuotaGb: '10', isActive: true,
  }, 'app-secret');
});

afterAll(() => { vi.unstubAllGlobals(); });

describe('آپلودِ تکه‌ای روی سرور (multipart ِ S3)', () => {
  const data = zipBytes(CHUNK_SIZE + 12_345); // دو تکه
  let id = '';

  it('جلسه فقط برای کسی که به پروژه دسترسی دارد؛ نوعِ آشکارا نامجاز همان اول رد می‌شود', async () => {
    await expect(startUpload(outsider, { projectId, name: 'a.zip', size: data.byteLength, mime: 'application/zip', label: '' })).rejects.toThrow();
    await expect(startUpload(member, { projectId, name: 'x.exe', size: 10, mime: 'application/x-msdownload', label: '' }))
      .rejects.toBeInstanceOf(FileRejected);
    const s = await startUpload(member, { projectId, name: 'site.zip', size: data.byteLength, mime: 'application/x-zip-compressed', label: 'خروجی' });
    expect(s.totalChunks).toBe(2);
    id = s.id;
  });

  it('⚠️ تکهٔ اول باید اول بیاید؛ اندازهٔ نادرست رد می‌شود؛ جلسهٔ دیگران دیده نمی‌شود', async () => {
    await expect(putChunk(member, id, 1, slice(data, 1))).rejects.toMatchObject({ code: 'first_chunk_first' });
    await expect(putChunk(member, id, 0, slice(data, 0).subarray(0, 100))).rejects.toBeInstanceOf(UploadConflict);
    await expect(uploadStatus(outsider, id)).rejects.toBeInstanceOf(UploadNotFound);
  });

  it('پس از «قطعی» از همان تکه ادامه می‌دهد و فایل کامل و درست ثبت می‌شود', async () => {
    await putChunk(member, id, 0, slice(data, 0));
    // مرورگر بسته شد… بعداً می‌پرسد چه رسیده:
    expect((await uploadStatus(member, id)).received).toEqual([0]);
    await putChunk(member, id, 0, slice(data, 0)); // تکرار بی‌اثر
    await expect(completeUpload(member, id)).rejects.toMatchObject({ code: 'incomplete' });
    await putChunk(member, id, 1, slice(data, 1));
    const fileId = await completeUpload(member, id);
    const [f] = await db.select().from(files).where(eq(files.id, fileId));
    expect(f).toMatchObject({ mime: 'application/zip', size: data.byteLength, originalName: 'site.zip' });
    expect(f!.storageKey).not.toMatch(/^nc:/);
    // ⚠️ Buffer.equals، نه toEqual: مقایسهٔ بایت‌به‌بایتِ ۸ مگ در vitest حافظه را پر می‌کرد.
    expect(Buffer.from(await getObject(f!.storageKey)).equals(Buffer.from(data))).toBe(true);
    const [a] = await db.select().from(attachments).where(eq(attachments.fileId, fileId));
    expect(a).toMatchObject({ projectId, label: 'خروجی', userId: member.id });
    expect(await db.select().from(uploadSessions).where(eq(uploadSessions.id, id))).toEqual([]);
  });

  it('⚠️ محتوای نادرست در تکهٔ اول رد می‌شود (اسکریپت با نامِ zip)', async () => {
    const s = await startUpload(member, { projectId, name: 'evil.zip', size: 20, mime: 'application/zip', label: '' });
    await expect(putChunk(member, s.id, 0, new TextEncoder().encode('<?php echo 1; ?>....'))).rejects.toBeInstanceOf(FileRejected);
    await abortUpload(member, s.id);
  });
});

describe('آپلودِ تکه‌ای روی فضای ابری (Nextcloud)', () => {
  it('تکه‌ها مستقیم به پوشهٔ آپلودِ Nextcloud می‌روند و همان‌جا سرِ هم می‌شوند', async () => {
    await setFileStore(owner, conn);
    const data = zipBytes(2 * CHUNK_SIZE + 99); // سه تکه
    const s = await startUpload(member, { projectId, name: 'big.zip', size: data.byteLength, mime: 'application/zip', label: '' });
    for (const n of [0, 1, 2]) await putChunk(member, s.id, n, slice(data, n));
    // پیش از پایان، هیچ فایلی در مقصدِ نهایی نیست — فقط تکه‌های موقت.
    expect(chunks.size).toBe(1);
    const fileId = await completeUpload(member, s.id);
    const [f] = await db.select().from(files).where(eq(files.id, fileId));
    expect(f!.storageKey).toMatch(new RegExp(`^nc:${conn}/attachment/`));
    // ⚠️ Buffer.equals، نه toEqual: مقایسهٔ بایت‌به‌بایتِ ۸ مگ در vitest حافظه را پر می‌کرد.
    expect(Buffer.from(await getObject(f!.storageKey)).equals(Buffer.from(data))).toBe(true);
    expect(chunks.size).toBe(0);
  });

  it('لغو و پاک‌سازیِ جلسه‌های رهاشده تکه‌های موقت را هم پاک می‌کند', async () => {
    const data = zipBytes(CHUNK_SIZE + 1);
    const a = await startUpload(member, { projectId, name: 'a.zip', size: data.byteLength, mime: 'application/zip', label: '' });
    await putChunk(member, a.id, 0, slice(data, 0));
    await abortUpload(member, a.id);
    expect(chunks.size).toBe(0);

    const b = await startUpload(member, { projectId, name: 'b.zip', size: data.byteLength, mime: 'application/zip', label: '' });
    await putChunk(member, b.id, 0, slice(data, 0));
    await db.update(uploadSessions).set({ updatedAt: new Date(Date.now() - 49 * 3600_000) }).where(eq(uploadSessions.id, b.id));
    expect(await purgeStaleUploads()).toBe(1);
    expect(chunks.size).toBe(0);
    expect(await db.select().from(uploadSessions)).toEqual([]);
  });
});
