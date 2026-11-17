import 'server-only';
import { and, asc, eq, like, notLike, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, cloudConnections, files, schedulerStamps } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { connectionTarget } from '@/server/cloud/connections';
import type { CloudTarget } from '@/server/cloud/client';
import { deleteObject, getObject, RangeNotSatisfiable, type ObjectStream } from './storage';

/**
 * فایل‌های برنامه روی فضای ابری (۳.۵.۰) — Nextcloud با WebDAV.
 *
 * کلیدِ فایلی که روی فضای ابری است `nc:<connectionId>/<کلیدِ معمولی>` است؛ پس هر جایی که
 * با کلید می‌خواند (مسیرِ فایل، آواتار، تلگرام، لوگو) بی تغییر کار می‌کند و `storage.ts` خودش
 * تشخیص می‌دهد کجا برود. کاربر فرقی نمی‌بیند: همان مسیرِ گیت‌شدهٔ `/api/files/[id]`.
 *
 * ⚠️ امنیت و درستی:
 *  · فایل‌ها در پوشهٔ **خصوصیِ** حسابِ اتصال‌اند (`KabarzaOS-files`) و با کسی share نمی‌شوند؛
 *    پس هیچ کارمندی در Nextcloud نمی‌تواند جابه‌جا یا پاکشان کند و لینک نمی‌شکند.
 *  · هر بخشِ کلید با الگوی سخت سنجیده می‌شود — مسیر از داده ساخته می‌شود، نه از کاربر،
 *    ولی `..` یا `/` ِ اضافه هرگز به نشانیِ WebDAV نمی‌رسد.
 *  · `Accept-Encoding: identity`: وگرنه fetch بدنهٔ gzip را باز می‌کرد و `Content-Length`
 *    با بایت‌های واقعی نمی‌خواند (پخش‌کنندهٔ ویدیو و دانلود می‌شکستند).
 *  · نوشتنِ ناموفق (قطعی، پر شدنِ سهمیه) بارگذاری را نمی‌شکند: فایل روی سرور می‌ماند و
 *    «انتقال» بعداً می‌بردش (← `service.ts`).
 */

const ROOT = 'KabarzaOS-files';
const CLOUD_KEY = /^nc:(\d{1,12})\/(.+)$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STORE_KEY = 'files:store';
const ERROR_KEY = 'files:store:error';

export function parseCloudKey(key: string): { connectionId: number; rest: string } | null {
  const m = CLOUD_KEY.exec(key);
  return m ? { connectionId: Number(m[1]), rest: m[2]! } : null;
}

export class CloudStoreError extends Error {
  constructor(readonly status: number, readonly op: string) {
    super(`cloud-store: ${op} ${status}`);
    this.name = 'CloudStoreError';
  }
}

function segments(rest: string): string[] {
  const parts = rest.split('/');
  if (parts.length < 2 || parts.length > 4 || !parts.every((p) => SEGMENT.test(p) && !p.includes('..'))) {
    throw new CloudStoreError(400, 'bad_key');
  }
  return parts;
}

function davBase(target: CloudTarget): string {
  return `${target.baseUrl}/remote.php/dav/files/${encodeURIComponent(target.username)}/${ROOT}`;
}

function auth(target: CloudTarget) {
  return `Basic ${Buffer.from(`${target.username}:${target.secret}`).toString('base64')}`;
}

/**
 * یک درخواستِ WebDAV. سقفِ زمان فقط تا رسیدنِ سرآیندهاست — جریانِ بدنهٔ یک ویدیوی بلند
 * نباید وسطِ پخش بریده شود.
 */
async function dav(target: CloudTarget, method: string, url: string, init: { body?: Uint8Array; headers?: Record<string, string>; timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    return await fetch(url, {
      method,
      headers: { Authorization: auth(target), 'Accept-Encoding': 'identity', ...init.headers },
      body: init.body as BodyInit | undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    throw new CloudStoreError(0, `${method.toLowerCase()}_network`);
  } finally {
    clearTimeout(timer);
  }
}

async function targetOf(connectionId: number): Promise<CloudTarget> {
  // ⚠️ اتصالِ خاموش هم خوانده می‌شود: فایل‌های قبلی باید باز شوند حتی اگر نوشتنِ تازه به سرور برگشته.
  return (await connectionTarget(connectionId, true)).target;
}

/** پوشه‌هایی که می‌دانیم هست — هر پوشه یک بار MKCOL در عمرِ فرایند. */
const knownDirs = new Set<string>();

async function ensureDirs(connectionId: number, target: CloudTarget, parts: string[]) {
  let url = davBase(target);
  const chain = [url, ...parts.slice(0, -1).map((p) => (url = `${url}/${encodeURIComponent(p)}`))];
  for (const dir of chain) {
    const cacheKey = `${connectionId}|${dir}`;
    if (knownDirs.has(cacheKey)) continue;
    const res = await dav(target, 'MKCOL', dir);
    // ۲۰۱ ساخته شد، ۴۰۵ از پیش هست.
    if (res.status !== 201 && res.status !== 405) throw new CloudStoreError(res.status, 'mkcol');
    knownDirs.add(cacheKey);
  }
}

const fileUrl = (target: CloudTarget, parts: string[]) => `${davBase(target)}/${parts.map(encodeURIComponent).join('/')}`;

export async function cloudPut(connectionId: number, rest: string, body: Uint8Array, mime: string): Promise<void> {
  const parts = segments(rest);
  const target = await targetOf(connectionId);
  await ensureDirs(connectionId, target, parts);
  const res = await dav(target, 'PUT', fileUrl(target, parts), {
    body, headers: { 'Content-Type': mime, 'Content-Length': String(body.byteLength) }, timeoutMs: 120_000,
  });
  if (res.status !== 201 && res.status !== 204) throw new CloudStoreError(res.status, 'put');
}

export async function cloudGet(connectionId: number, rest: string): Promise<Uint8Array> {
  const target = await targetOf(connectionId);
  const res = await dav(target, 'GET', fileUrl(target, segments(rest)));
  if (res.status !== 200) throw new CloudStoreError(res.status, 'get');
  return new Uint8Array(await res.arrayBuffer());
}

export async function cloudOpen(connectionId: number, rest: string, range: string | null): Promise<ObjectStream> {
  const target = await targetOf(connectionId);
  const res = await dav(target, 'GET', fileUrl(target, segments(rest)), { headers: range ? { Range: range } : {} });
  if (res.status === 416) {
    const total = /\*\/(\d+)/.exec(res.headers.get('content-range') ?? '')?.[1];
    throw new RangeNotSatisfiable(total ? Number(total) : null);
  }
  if ((res.status !== 200 && res.status !== 206) || !res.body) throw new CloudStoreError(res.status, 'get');
  const length = Number(res.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length)) {
    // بی طول (نباید پیش بیاید با identity) — یک بار در حافظه، تا Content-Length درست بماند.
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { body: new Blob([bytes]).stream(), length: bytes.byteLength, contentRange: res.status === 206 ? res.headers.get('content-range') : null };
  }
  return { body: res.body, length, contentRange: res.status === 206 ? res.headers.get('content-range') : null };
}

export async function cloudDelete(connectionId: number, rest: string): Promise<void> {
  const target = await targetOf(connectionId);
  const res = await dav(target, 'DELETE', fileUrl(target, segments(rest)));
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) throw new CloudStoreError(res.status, 'delete');
}

async function cloudSize(connectionId: number, rest: string): Promise<number | null> {
  const target = await targetOf(connectionId);
  const res = await dav(target, 'HEAD', fileUrl(target, segments(rest)));
  if (res.status !== 200) return null;
  const n = Number(res.headers.get('content-length') ?? NaN);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ *
 * کجا بنویسیم — تنظیمِ مالک
 * ------------------------------------------------------------------ */

async function readStamp(key: string): Promise<Record<string, unknown> | null> {
  const [row] = await db.select({ value: schedulerStamps.value }).from(schedulerStamps).where(eq(schedulerStamps.key, key));
  try { return row ? JSON.parse(row.value) as Record<string, unknown> : null; } catch { return null; }
}

async function writeStamp(key: string, value: unknown) {
  const json = JSON.stringify(value);
  await db.insert(schedulerStamps).values({ key, value: json })
    .onConflictDoUpdate({ target: schedulerStamps.key, set: { value: json, updatedAt: new Date() } });
}

let cached: { at: number; prefix: string } | null = null;

/**
 * پیشوندِ کلیدِ فایلِ تازه: `nc:<id>/` اگر مالک فضای ابری را انتخاب کرده و آن اتصال روشن و
 * رمزدار است؛ وگرنه `''` (سرورِ برنامه). نیم دقیقه کش می‌شود — هر آپلود یک کوئری نزند.
 */
export async function writePrefix(): Promise<string> {
  if (cached && Date.now() - cached.at < 30_000) return cached.prefix;
  const raw = await readStamp(STORE_KEY);
  const id = typeof raw?.connectionId === 'number' ? raw.connectionId : null;
  let prefix = '';
  if (id !== null) {
    const [row] = await db.select({ isActive: cloudConnections.isActive, secretEnc: cloudConnections.secretEnc })
      .from(cloudConnections).where(eq(cloudConnections.id, id));
    if (row?.isActive && row.secretEnc) prefix = `nc:${id}/`;
  }
  cached = { at: Date.now(), prefix };
  return prefix;
}

/** نوشتن روی فضای ابری نشد و فایل روی سرور ماند — برای هشدار در تنظیمات (بی راز). */
export async function noteWriteFailure(error: unknown) {
  const status = error instanceof CloudStoreError ? error.status : 0;
  console.warn('[files] cloud write failed, kept on server', status);
  await writeStamp(ERROR_KEY, { at: new Date().toISOString(), status }).catch(() => undefined);
}

function assertOwner(actor: Actor) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('owner');
}

export interface FileStoreView {
  /** اتصالی که فایل‌های تازه رویش می‌روند؛ `null` = سرورِ برنامه. */
  connectionId: number | null;
  /** آن اتصال خاموش یا بی‌رمز است و فایل‌های تازه به سرور برمی‌گردند. */
  inactive: boolean;
  server: { count: number; bytes: number };
  cloud: Array<{ connectionId: number; count: number; bytes: number }>;
  lastError: { at: string; status: number } | null;
}

export async function getFileStoreView(actor: Actor): Promise<FileStoreView> {
  assertOwner(actor);
  const raw = await readStamp(STORE_KEY);
  const connectionId = typeof raw?.connectionId === 'number' ? raw.connectionId : null;
  const rows = await db.select({
    where: sql<string>`case when ${files.storageKey} like 'nc:%' then split_part(substr(${files.storageKey}, 4), '/', 1) else '' end`,
    count: sql<number>`count(*)::int`,
    bytes: sql<number>`coalesce(sum(${files.size}), 0)::float8`,
  }).from(files).groupBy(sql`1`);
  const server = rows.find((r) => r.where === '') ?? { count: 0, bytes: 0 };
  const err = await readStamp(ERROR_KEY);
  return {
    connectionId,
    inactive: connectionId !== null && (await writePrefixFresh()) === '',
    server: { count: server.count, bytes: Number(server.bytes) },
    cloud: rows.filter((r) => r.where !== '').map((r) => ({ connectionId: Number(r.where), count: r.count, bytes: Number(r.bytes) })),
    lastError: err && typeof err.at === 'string' ? { at: err.at, status: Number(err.status) || 0 } : null,
  };
}

async function writePrefixFresh() {
  cached = null;
  return writePrefix();
}

/**
 * انتخابِ محلِ فایل‌های تازه. پیش از ذخیره یک فایلِ کوچکِ آزمون نوشته و پاک می‌شود تا
 * انتخابی که کار نمی‌کند (مجوز، سهمیهٔ پر) همین‌جا معلوم شود، نه با اولین آپلودِ کارمند.
 */
export async function setFileStore(actor: Actor, connectionId: number | null): Promise<void> {
  assertOwner(actor);
  if (connectionId !== null) {
    await connectionTarget(connectionId); // روشن و رمزدار، وگرنه خطا.
    const rest = `probe/check-${Date.now()}.txt`;
    await cloudPut(connectionId, rest, new TextEncoder().encode('kabarza-probe'), 'text/plain');
    await cloudDelete(connectionId, rest).catch(() => undefined);
  }
  await writeStamp(STORE_KEY, { connectionId });
  await db.delete(schedulerStamps).where(eq(schedulerStamps.key, ERROR_KEY));
  cached = null;
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'files.store', objectType: 'settings', objectId: 0,
    before: null, after: { connectionId },
  });
}

/** فقط یک گامِ انتقال در هر لحظه (برنامه یک فرایند است). */
let migrating = false;

/**
 * یک گامِ «انتقالِ فایل‌های قبلی» از سرور به فضای ابریِ انتخاب‌شده — تا حدودِ ۲۰ ثانیه؛
 * صفحه تا `remaining = 0` دوباره صدا می‌زند (قطعِ وسطِ کار چیزی را خراب نمی‌کند).
 *
 * ⚠️ ترتیب برای هر فایل: نوشتن روی فضای ابری ← سنجشِ اندازه ← عوض کردنِ کلید در ردیف (فقط اگر
 * هنوز همان کلیدِ قبلی است؛ همان لحظه ثبت می‌شود) ← **بعد** پاک کردن از سرور. هیچ لحظه‌ای
 * ردیف به جایی اشاره نمی‌کند که فایل آنجا نیست.
 */
export async function migrateFilesStep(actor: Actor): Promise<{ moved: number; failed: number; remaining: number; busy?: boolean }> {
  assertOwner(actor);
  const prefix = await writePrefixFresh();
  if (!prefix) throw new CloudStoreError(0, 'no_cloud');
  const connectionId = Number(prefix.slice(3, -1));
  const count = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(files).where(notLike(files.storageKey, 'nc:%')))[0]?.n ?? 0;
  if (migrating) return { moved: 0, failed: 0, remaining: await count(), busy: true };
  migrating = true;
  const started = Date.now();
  let moved = 0;
  let failed = 0;
  try {
    const skip = new Set<number>();
    while (Date.now() - started < 20_000) {
      const batch = await db.select({ id: files.id, storageKey: files.storageKey, previewKey: files.previewKey, mime: files.mime })
        .from(files).where(notLike(files.storageKey, 'nc:%')).orderBy(asc(files.id)).limit(20 + skip.size);
      const todo = batch.filter((f) => !skip.has(f.id));
      if (todo.length === 0) break;
      for (const f of todo) {
        if (Date.now() - started >= 20_000) break;
        const key = `${prefix}${f.storageKey}`;
        const previewKey = f.previewKey ? `${prefix}${f.previewKey}` : null;
        try {
          const bytes = await getObject(f.storageKey);
          await cloudPut(connectionId, f.storageKey, bytes, f.mime);
          if ((await cloudSize(connectionId, f.storageKey)) !== bytes.byteLength) throw new CloudStoreError(0, 'size_mismatch');
          let preview: Uint8Array | null = null;
          if (f.previewKey) {
            preview = await getObject(f.previewKey).catch(() => null);
            if (preview) await cloudPut(connectionId, f.previewKey, preview, 'image/webp');
          }
          const updated = await db.update(files).set({ storageKey: key, previewKey: preview ? previewKey : null, updatedAt: new Date() })
            .where(and(eq(files.id, f.id), eq(files.storageKey, f.storageKey))).returning({ id: files.id });
          if (updated.length === 0) {
            // ردیف در این فاصله پاک یا عوض شد. نسخهٔ فضای ابری فقط وقتی پاک می‌شود که هیچ ردیفی به آن اشاره نکند.
            const [now] = await db.select({ id: files.id }).from(files).where(eq(files.storageKey, key));
            if (!now) {
              await cloudDelete(connectionId, f.storageKey).catch(() => undefined);
              if (f.previewKey) await cloudDelete(connectionId, f.previewKey).catch(() => undefined);
            }
            continue;
          }
          await deleteObject(f.storageKey).catch(() => undefined);
          if (f.previewKey) await deleteObject(f.previewKey).catch(() => undefined);
          moved++;
        } catch (error) {
          console.warn('[files] migrate failed', f.id, error instanceof CloudStoreError ? `${error.op} ${error.status}` : 'error');
          skip.add(f.id);
          failed++;
        }
      }
    }
  } finally {
    migrating = false;
  }

  const remaining = await count();
  if (moved > 0 || failed > 0) {
    await db.insert(auditLog).values({
      actorType: 'user', actorId: actor.id, action: 'files.migrate', objectType: 'settings', objectId: 0,
      before: null, after: { connectionId, moved, failed, remaining },
    });
  }
  return { moved, failed, remaining };
}

/** چند فایل روی این اتصال است — اتصالی که فایل دارد حذف نمی‌شود. */
export async function filesOnConnection(connectionId: number): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(files)
    .where(like(files.storageKey, `nc:${connectionId}/%`));
  return n;
}
