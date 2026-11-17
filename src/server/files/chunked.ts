import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, files, uploadSessions } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import {
  ALLOWED_TYPES, assertAcceptable, CHUNK_SIZE, CHUNKED_MAX, FileRejected, kindOf, MAX_SIZE, storageKey, trustedMime,
} from '@/domain/files/upload';
import { assertCanAttach } from './service';
import { canPreview, makePreview, PREVIEW_MIME, stripMetadata } from './preview';
import { chunkAbort, chunkFinish, chunkPut, chunkStart, deleteObject, ensureBucket, getObject, putObject } from './storage';

/**
 * آپلودِ تکه‌ای و ازسرگرفتنی (۳.۱۰.۰) — فایلِ پروژه.
 *
 *  ۱. `startUpload` فقط جلسه می‌سازد (هنوز هیچ بایتی).
 *  ۲. `putChunk` هر تکه را **مستقیم** به مقصدِ نهایی می‌فرستد (آپلودِ تکه‌ایِ Nextcloud یا
 *     multipart ِ S3) و فقط ثبت می‌کند که رسید. تکهٔ اول نوعِ فایل را با بایت‌های واقعی می‌سنجد.
 *  ۳. `uploadStatus` می‌گوید کدام تکه‌ها رسیده‌اند — پس از قطعی، مرورگر از همان‌جا ادامه می‌دهد.
 *  ۴. `completeUpload` تکه‌ها را در مقصد سرِ هم می‌کند و ردیفِ فایل و پیوست را می‌نویسد.
 *
 * ⚠️ هیچ تکه‌ای روی دیسکِ سرورِ برنامه نمی‌ماند؛ جلسه فقط وضعیت است. هر جلسه مالِ همان کاربر
 * است (`userId`) — کسِ دیگری با داشتنِ شناسه نمی‌تواند تکه بفرستد یا ببیند.
 */

const MAX_OPEN = 20;
const STALE_HOURS = 48;

export class UploadNotFound extends Error {
  constructor() { super('upload.not_found'); this.name = 'UploadNotFound'; }
}
export class UploadConflict extends Error {
  constructor(readonly code: 'first_chunk_first' | 'incomplete' | 'too_many' | 'bad_chunk') {
    super(`upload.${code}`); this.name = 'UploadConflict';
  }
}

export interface UploadStart { projectId: number; name: string; size: number; mime: string; label: string }

export async function startUpload(actor: Actor, input: UploadStart) {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new FileRejected('file.name_missing');
  if (!Number.isInteger(input.size) || input.size <= 0) throw new FileRejected('file.empty');
  if (input.size > CHUNKED_MAX) throw new FileRejected('file.too_large');
  await assertCanAttach(actor, input.projectId);

  // نوعِ آشکارا نامجاز (exe، html…) همین‌جا رد شود، نه پس از رفتنِ تکهٔ اول. سنجشِ قطعی با بایت‌هاست.
  const guess = trustedMime(input.mime, new Uint8Array(), 'attachment', name);
  if (guess && guess !== 'application/octet-stream' && !ALLOWED_TYPES.attachment.includes(guess)) {
    throw new FileRejected('file.type_not_allowed');
  }

  const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(uploadSessions)
    .where(eq(uploadSessions.userId, actor.id));
  if ((open?.n ?? 0) >= MAX_OPEN) throw new UploadConflict('too_many');

  const id = randomBytes(16).toString('hex');
  const totalChunks = Math.ceil(input.size / CHUNK_SIZE);
  await db.insert(uploadSessions).values({
    id, userId: actor.id, projectId: input.projectId, label: input.label.trim().slice(0, 200),
    name, declaredMime: input.mime.slice(0, 200), size: input.size, chunkSize: CHUNK_SIZE, totalChunks,
  });
  return { id, chunkSize: CHUNK_SIZE, totalChunks };
}

async function load(actor: Actor, id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new UploadNotFound();
  const [row] = await db.select().from(uploadSessions)
    .where(and(eq(uploadSessions.id, id), eq(uploadSessions.userId, actor.id)));
  if (!row) throw new UploadNotFound();
  return row;
}

export async function uploadStatus(actor: Actor, id: string) {
  const s = await load(actor, id);
  return {
    id: s.id, chunkSize: s.chunkSize, totalChunks: s.totalChunks,
    received: Object.keys(s.parts).map(Number).sort((a, b) => a - b),
  };
}

/** اندازهٔ درستِ تکهٔ n — همه `chunkSize` جز آخری. */
function expectedLength(s: { size: number; chunkSize: number; totalChunks: number }, n: number): number {
  return n < s.totalChunks - 1 ? s.chunkSize : s.size - s.chunkSize * (s.totalChunks - 1);
}

export async function putChunk(actor: Actor, id: string, n: number, bytes: Uint8Array) {
  let s = await load(actor, id);
  if (!Number.isInteger(n) || n < 0 || n >= s.totalChunks || bytes.byteLength !== expectedLength(s, n)) {
    throw new UploadConflict('bad_chunk');
  }
  if (s.parts[String(n)]) return { received: Object.keys(s.parts).length }; // تکرار — بی‌اثر

  if (s.storageKey === null || s.backendId === null) {
    if (n !== 0) throw new UploadConflict('first_chunk_first');
    // ⚠️ همان سنجشِ همیشگی، با بایت‌های واقعیِ تکهٔ اول (R-FILE-05).
    const mime = assertAcceptable(
      { name: s.name, mime: s.declaredMime, size: s.size, head: bytes.subarray(0, 32) }, 'attachment', CHUNKED_MAX,
    );
    const plainKey = storageKey('attachment', mime, randomUUID().replace(/-/g, ''));
    const dir = randomBytes(16).toString('hex');
    const { writePrefix, noteWriteFailure } = await import('./cloud-store');
    let key = `${await writePrefix()}${plainKey}`;
    let backendId: string;
    try {
      backendId = await chunkStart(key, mime, dir);
    } catch (error) {
      // مثلِ آپلودِ معمولی: فضای ابری در دسترس نیست ← روی سرور، و «انتقال» بعداً می‌بردش.
      if (key === plainKey) throw error;
      await noteWriteFailure(error);
      key = plainKey;
      await ensureBucket();
      backendId = await chunkStart(key, mime, dir);
    }
    await db.update(uploadSessions).set({ mime, storageKey: key, backendId, updatedAt: new Date() })
      .where(eq(uploadSessions.id, id));
    s = { ...s, mime, storageKey: key, backendId };
  }

  const tag = await chunkPut(s.storageKey!, s.backendId!, n, bytes);
  const [row] = await db.update(uploadSessions)
    .set({ parts: sql`${uploadSessions.parts} || ${JSON.stringify({ [String(n)]: tag })}::jsonb`, updatedAt: new Date() })
    .where(eq(uploadSessions.id, id))
    .returning({ parts: uploadSessions.parts });
  return { received: Object.keys(row?.parts ?? {}).length };
}

export async function completeUpload(actor: Actor, id: string): Promise<number> {
  const s = await load(actor, id);
  const missing = Array.from({ length: s.totalChunks }, (_, i) => i).filter((i) => !s.parts[String(i)]);
  if (missing.length > 0 || !s.storageKey || !s.backendId || !s.mime) throw new UploadConflict('incomplete');
  // ⚠️ دوباره: در فاصلهٔ آپلود ممکن است دسترسی قطع یا پروژه منجمد شده باشد.
  await assertCanAttach(actor, s.projectId);

  await chunkFinish(s.storageKey, s.backendId, s.parts, s.totalChunks, s.size);
  const key = s.storageKey;
  let size = s.size;

  /*
   * تصویر: همان پردازشِ آپلودِ معمولی — EXIF/GPS پاک و پیش‌نمایشِ ۴۰۰ پیکسلی. فقط تا سقفِ
   * پیوستِ معمولی (۵۰ مگ)؛ تصویرِ بزرگ‌تر همان‌طور می‌ماند و نمایش‌دهنده اصل را نشان می‌دهد.
   */
  let previewKey: string | null = null;
  if (kindOf(s.mime) === 'image' && size <= MAX_SIZE.attachment) {
    try {
      const original = await getObject(key);
      const clean = await stripMetadata(original, s.mime);
      if (clean !== original) { await putObject(key, clean, s.mime); size = clean.byteLength; }
      if (canPreview(s.mime)) {
        const preview = await makePreview(clean, s.mime);
        if (preview) { previewKey = `${key}.thumb.webp`; await putObject(previewKey, preview, PREVIEW_MIME); }
      }
    } catch {
      previewKey = null; // نبودِ پیش‌نمایش خطا نیست
    }
  }

  try {
    const fileId = await db.transaction(async (tx) => {
      const [file] = await tx.insert(files).values({
        storageKey: key, previewKey, mime: s.mime!, size, originalName: s.name, purpose: 'attachment', uploadedBy: actor.id,
      }).returning({ id: files.id });
      await tx.insert(attachments).values({
        projectId: s.projectId, fileId: file!.id, userId: actor.id, kind: kindOf(s.mime!), label: s.label,
      });
      await tx.delete(uploadSessions).where(eq(uploadSessions.id, id));
      return file!.id;
    });
    return fileId;
  } catch (error) {
    await deleteObject(key).catch(() => {});
    if (previewKey) await deleteObject(previewKey).catch(() => {});
    throw error;
  }
}

export async function abortUpload(actor: Actor, id: string): Promise<void> {
  const s = await load(actor, id);
  if (s.storageKey && s.backendId) await chunkAbort(s.storageKey, s.backendId).catch(() => {});
  await db.delete(uploadSessions).where(eq(uploadSessions.id, id));
}

/** جلسه‌های رهاشده (بیش از ۴۸ ساعت بی‌حرکت) — تکه‌های موقت در مقصد هم پاک می‌شوند. */
export async function purgeStaleUploads(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_HOURS * 3600_000);
  const stale = await db.select().from(uploadSessions).where(lt(uploadSessions.updatedAt, cutoff));
  for (const s of stale) {
    if (s.storageKey && s.backendId) await chunkAbort(s.storageKey, s.backendId).catch(() => {});
    await db.delete(uploadSessions).where(eq(uploadSessions.id, s.id));
  }
  return stale.length;
}
