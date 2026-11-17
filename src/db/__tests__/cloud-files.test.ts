import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { eq, like, notLike } from 'drizzle-orm';
import { db, sql } from '../client';
import { files, projectMembers, projects, schedulerStamps, userRoles, users } from '../schema';
import { addAttachment, deleteAttachment, listAttachments, serveFile } from '@/server/files/service';
import { getObject, openObject } from '@/server/files/storage';
import { deleteCloudConnection, saveCloudConnection } from '@/server/cloud/connections';
import { getFileStoreView, migrateFilesStep, parseCloudKey, setFileStore } from '@/server/files/cloud-store';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * فایل‌های برنامه روی فضای ابری (۳.۵.۰): باکتِ واقعی + WebDAV ِ ساختگیِ Nextcloud.
 * کاربر فرقی نمی‌بیند (همان serveFile/openObject)، نوشتنِ ناموفق به سرور برمی‌گردد،
 * و انتقال هیچ فایلی را گم نمی‌کند.
 */

const dav = new Map<string, { bytes: Uint8Array; mime: string }>();
const dirs = new Set<string>();
let down = false;
const realFetch = globalThis.fetch;
const AUTH = `Basic ${Buffer.from('kabarza-os:app-secret').toString('base64')}`;
const BASE = '/remote.php/dav/files/kabarza-os/';

let owner: Actor, member: Actor, projectId: number, conn: number;
let png: Uint8Array;

beforeAll(async () => {
  await sql`truncate table attachments, files, project_members, projects, cloud_connections, services, user_roles, users restart identity cascade`;
  await db.delete(schedulerStamps).where(like(schedulerStamps.key, 'files:store%'));
  const [o, m] = await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm@t', name: 'عضو' }]).returning({ id: users.id });
  await db.insert(userRoles).values([{ userId: o!.id, role: 'owner' }, { userId: m!.id, role: 'member' }]);
  owner = { id: o!.id, roles: ['owner'], permissions: ['members.manage'] as Permission[], privateAccess: false };
  member = { id: m!.id, roles: ['member'], permissions: [], privateAccess: false };
  const [p] = await db.insert(projects).values({ title: 'فایل ابری', scope: 'company' }).returning({ id: projects.id });
  projectId = p!.id;
  await db.insert(projectMembers).values({ projectId, userId: member.id });
  png = new Uint8Array(await sharp({ create: { width: 600, height: 400, channels: 3, background: '#c33' } }).png().toBuffer());

  vi.stubGlobal('fetch', vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.hostname !== 'cloud.example.com') return realFetch(input, init);
    if (down) throw new TypeError('fetch failed');
    const headers = init.headers as Record<string, string>;
    if (headers.Authorization !== AUTH) return new Response(null, { status: 401 });
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith(BASE)) return new Response(null, { status: 404 });
    const rel = path.slice(BASE.length);
    switch (init.method) {
      case 'MKCOL':
        if (dirs.has(rel)) return new Response(null, { status: 405 });
        dirs.add(rel);
        return new Response(null, { status: 201 });
      case 'PUT': {
        const parent = rel.split('/').slice(0, -1).join('/');
        if (!dirs.has(parent)) return new Response(null, { status: 409 });
        dav.set(rel, { bytes: new Uint8Array(init.body as Uint8Array), mime: headers['Content-Type']! });
        return new Response(null, { status: 201 });
      }
      case 'DELETE':
        return new Response(null, { status: dav.delete(rel) ? 204 : 404 });
      case 'HEAD': {
        const f = dav.get(rel);
        return f ? new Response(null, { status: 200, headers: { 'Content-Length': String(f.bytes.byteLength) } }) : new Response(null, { status: 404 });
      }
      default: {
        const f = dav.get(rel);
        if (!f) return new Response(null, { status: 404 });
        const range = /bytes=(\d+)-(\d*)/.exec(headers.Range ?? '');
        if (range) {
          const a = Number(range[1]);
          const b = range[2] ? Number(range[2]) : f.bytes.byteLength - 1;
          if (a >= f.bytes.byteLength) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${f.bytes.byteLength}` } });
          const part = f.bytes.slice(a, b + 1);
          return new Response(part as unknown as BodyInit, { status: 206, headers: { 'Content-Length': String(part.byteLength), 'Content-Range': `bytes ${a}-${b}/${f.bytes.byteLength}` } });
        }
        return new Response(f.bytes as unknown as BodyInit, { status: 200, headers: { 'Content-Length': String(f.bytes.byteLength) } });
      }
    }
  }));

  conn = await saveCloudConnection(owner, null, {
    name: 'Main', baseUrl: 'https://cloud.example.com', username: 'kabarza-os', groupId: 'team', defaultQuotaGb: '10', isActive: true,
  }, 'app-secret');
});

afterAll(() => { vi.unstubAllGlobals(); });

const blob = (name = 'a.png') => ({ name, mime: 'image/png', bytes: png });
const keyOf = async (fileId: number) => (await db.select().from(files).where(eq(files.id, fileId)))[0]!;
const readAll = async (stream: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(stream).arrayBuffer());

describe('فایل‌ها روی فضای ابری', () => {
  let onServer: number;

  it('تا وقتی انتخاب نشده، فایل روی سرورِ برنامه می‌رود', async () => {
    onServer = await addAttachment(owner, projectId, blob('old.png'), 'قدیمی');
    const f = await keyOf(onServer);
    expect(f.storageKey).not.toMatch(/^nc:/);
    expect(await getObject(f.storageKey)).toHaveLength(png.byteLength);
  });

  it('⚠️ فقط مالک محل را عوض می‌کند؛ انتخاب با یک نوشتنِ آزمون سنجیده و پاک می‌شود', async () => {
    await expect(setFileStore(member, conn)).rejects.toThrow();
    await setFileStore(owner, conn);
    expect([...dav.keys()].filter((k) => k.includes('probe/'))).toEqual([]);
    expect(dirs.has('KabarzaOS-files')).toBe(true);
  });

  it('فایلِ تازه روی فضای ابری است؛ کاربر همان مسیر را می‌بیند (کامل، بازه، پیش‌نمایش)', async () => {
    const id = await addAttachment(member, projectId, blob(), 'تازه');
    const f = await keyOf(id);
    expect(parseCloudKey(f.storageKey)).toEqual({ connectionId: conn, rest: f.storageKey.replace(`nc:${conn}/`, '') });
    expect(f.previewKey).toBe(`${f.storageKey}.thumb.webp`);
    expect(dav.has(`KabarzaOS-files/${f.storageKey.slice(`nc:${conn}/`.length)}`)).toBe(true);

    const served = await serveFile(member, id, false, false);
    const full = await openObject(served.key, null);
    expect(full.length).toBe(png.byteLength);
    expect(await readAll(full.body)).toEqual(png);
    const part = await openObject(served.key, 'bytes=0-9');
    expect(part).toMatchObject({ length: 10, contentRange: `bytes 0-9/${png.byteLength}` });
    await expect(openObject(served.key, `bytes=${png.byteLength + 5}-`)).rejects.toMatchObject({ name: 'RangeNotSatisfiable', size: png.byteLength });
    const thumb = await serveFile(member, id, false, true);
    expect(thumb.key).toBe(f.previewKey);
    expect((await getObject(thumb.key)).byteLength).toBeGreaterThan(0);

    // حذف از فضای ابری هم پاک می‌کند (اصل و پیش‌نمایش).
    const [row] = (await listAttachments(owner, projectId)).filter((a) => a.label === 'تازه');
    await deleteAttachment(owner, row!.id);
    expect([...dav.keys()].filter((k) => k.endsWith('.png') || k.endsWith('.webp')).some((k) => f.storageKey.endsWith(k.split('/').pop()!))).toBe(false);
  });

  it('⚠️ فضای ابری قطع ← بارگذاری نمی‌شکند، فایل روی سرور می‌ماند و هشدار ثبت می‌شود', async () => {
    down = true;
    const id = await addAttachment(member, projectId, blob('fallback.png'), 'قطعی');
    down = false;
    const f = await keyOf(id);
    expect(f.storageKey).not.toMatch(/^nc:/);
    expect(await getObject(f.storageKey)).toHaveLength(png.byteLength);
    const view = await getFileStoreView(owner);
    expect(view.lastError).not.toBeNull();
    expect(view.server.count).toBe(2);
  });

  it('⚠️ انتقال: همهٔ فایل‌های سرور به فضای ابری، بعد از سرور پاک؛ هیچ فایلی گم نمی‌شود', async () => {
    await expect(migrateFilesStep(member)).rejects.toThrow();
    const before = await db.select().from(files).where(notLike(files.storageKey, 'nc:%'));
    const result = await migrateFilesStep(owner);
    expect(result).toMatchObject({ moved: 2, failed: 0, remaining: 0 });
    for (const old of before) {
      const now = await keyOf(old.id);
      expect(now.storageKey).toBe(`nc:${conn}/${old.storageKey}`);
      expect(await getObject(now.storageKey)).toEqual(png);
      await expect(getObject(old.storageKey)).rejects.toThrow(); // از باکت رفت.
    }
    const view = await getFileStoreView(owner);
    expect(view.server.count).toBe(0);
    expect(view.cloud).toEqual([{ connectionId: conn, count: 2, bytes: png.byteLength * 2 }]);
  });

  it('⚠️ اتصالی که فایل دارد حذف نمی‌شود', async () => {
    await expect(deleteCloudConnection(owner, conn)).rejects.toMatchObject({ code: 'in_use' });
  });

  it('⚠️ کلیدِ دست‌کاری‌شده هرگز به مسیرِ WebDAV نمی‌رسد', async () => {
    await expect(getObject(`nc:${conn}/attachment/../../secret`)).rejects.toMatchObject({ op: 'bad_key' });
    await expect(getObject(`nc:${conn}/x`)).rejects.toMatchObject({ op: 'bad_key' });
  });
});
