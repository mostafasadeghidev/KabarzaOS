import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateBucketCommand, CreateMultipartUploadCommand,
  DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';

/**
 * ذخیره‌سازیِ شیء — S3-سازگار (D-009).
 *
 * ⚠️ فایل **هرگز** روی فایل‌سیستمِ کانتینر نمی‌نشیند؛ با هر دیپلوی پاک می‌شود.
 * محلی MinIO همان APIِ S3 را می‌دهد، پس کدِ محلی و تولید یکی است.
 *
 * ⚠️ باکت خصوصی است و هیچ آدرسِ مستقیمی به کاربر داده نمی‌شود — تنها راهِ
 * خواندن، مسیرِ گیت‌شدهٔ `/api/files/[id]` است (R-FILE-01).
 */

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

let client: S3Client | null = null;

export function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: env('S3_REGION', 'us-east-1'),
    endpoint: env('S3_ENDPOINT'),
    // MinIO مسیرمحور است، نه زیردامنه‌محور.
    forcePathStyle: true,
    credentials: {
      accessKeyId: env('S3_ACCESS_KEY'),
      secretAccessKey: env('S3_SECRET_KEY'),
    },
  });
  return client;
}

export const bucket = () => env('S3_BUCKET', 'kabarza');

/**
 * ⚠️ ۳.۵.۰ — کلیدِ `nc:<id>/…` یعنی فایل روی فضای ابری (Nextcloud) است، نه در باکت.
 * همین چهار تابع خودشان تشخیص می‌دهند؛ صدازننده‌ها (مسیرِ فایل، آواتار، تلگرام) فرقی نمی‌بینند.
 * import ِ پویا: اسکریپت‌هایی مثلِ seed که فقط باکت دارند، ماژولِ فضای ابری را بار نمی‌کنند.
 */
const cloudPart = (key: string) => /^nc:(\d{1,12})\/(.+)$/.exec(key);
const cloud = () => import('./cloud-store');

/** ساختِ باکت اگر نبود — idempotent، برای توسعه و اولین اجرا. */
export async function ensureBucket(): Promise<void> {
  const Bucket = bucket();
  try {
    await s3().send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket }));
  }
}

export async function putObject(key: string, body: Uint8Array, mime: string): Promise<void> {
  const c = cloudPart(key);
  if (c) return (await cloud()).cloudPut(Number(c[1]), c[2]!, body, mime);
  await s3().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: mime,
  }));
}

/** بایت‌های یک شیء. */
export async function getObject(key: string): Promise<Uint8Array> {
  const c = cloudPart(key);
  if (c) return (await cloud()).cloudGet(Number(c[1]), c[2]!);
  const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return out.Body!.transformToByteArray();
}

/** بازهٔ درخواست‌شده بیرون از اندازهٔ فایل است — پاسخِ ۴۱۶. */
export class RangeNotSatisfiable extends Error {
  constructor(readonly size: number | null) {
    super('range_not_satisfiable');
    this.name = 'RangeNotSatisfiable';
  }
}

export interface ObjectStream {
  body: ReadableStream<Uint8Array>;
  /** طولِ همین پاسخ (کلِ فایل یا همان بازه). */
  length: number;
  /** `bytes a-b/total` — فقط وقتی بازه خواسته شده. */
  contentRange: string | null;
}

/**
 * جریانِ یک شیء، بی‌آنکه در حافظه بنشیند — پورتِ F#285.
 *
 * ⚠️ پیش از این هر فایل (تا ۲۵ مگابایت، ویدئو و PDF ِ بزرگ هم) کامل در
 * حافظهٔ سرور خوانده و بعد فرستاده می‌شد: چند دانلودِ هم‌زمان حافظه را
 * می‌خورد و پخش‌کننده نمی‌توانست جلو بزند. حالا بدنهٔ S3 مستقیم به پاسخ
 * لوله می‌شود، و `range` (خروجیِ `normalizeRange`) به خودِ S3 می‌رود.
 */
export async function openObject(key: string, range: string | null = null): Promise<ObjectStream> {
  const c = cloudPart(key);
  if (c) return (await cloud()).cloudOpen(Number(c[1]), c[2]!, range);
  try {
    const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range ?? undefined }));
    return {
      body: out.Body!.transformToWebStream() as ReadableStream<Uint8Array>,
      length: Number(out.ContentLength ?? 0),
      contentRange: range ? (out.ContentRange ?? null) : null,
    };
  } catch (error) {
    if ((error as { name?: string }).name === 'InvalidRange' || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 416) {
      const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key })).catch(() => null);
      throw new RangeNotSatisfiable(head?.ContentLength ?? null);
    }
    throw error;
  }
}

/**
 * حذفِ شیء.
 * ⚠️ خطا خورده نمی‌شود مگر عمداً: پاک‌کردنِ ردیفِ دیتابیس بدونِ پاک‌شدنِ شیء
 * یعنی فایلِ بی‌صاحبِ ماندگار. فراخوان تصمیم می‌گیرد چه کند.
 */
export async function deleteObject(key: string): Promise<void> {
  const c = cloudPart(key);
  if (c) return (await cloud()).cloudDelete(Number(c[1]), c[2]!);
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/* ------------------------------------------------------------------ *
 * آپلودِ تکه‌ای (۳.۱۰.۰) — یک رابط برای هر دو مقصد
 * ------------------------------------------------------------------ */

/**
 * ⚠️ تکه‌ها مستقیم به مقصدِ نهایی می‌روند و هیچ‌وقت روی دیسکِ سرور جمع نمی‌شوند:
 *  · کلیدِ `nc:<id>/…` ← آپلودِ تکه‌ایِ Nextcloud (`backendId` نامِ پوشهٔ موقت است)؛
 *  · کلیدِ باکت ← multipart ِ S3 (`backendId` همان UploadId). کمینهٔ هر بخش ۵ مگ (جز آخری) —
 *    `CHUNK_SIZE` ِ ۸ مگ این را تضمین می‌کند.
 * خروجیِ `chunkPut` برچسبی است که `chunkFinish` لازم دارد (ETag ِ S3؛ برای Nextcloud «1»).
 */
export async function chunkStart(key: string, mime: string, dir: string): Promise<string> {
  const c = cloudPart(key);
  if (c) { await (await cloud()).cloudChunkStart(Number(c[1]), dir); return dir; }
  await ensureBucket();
  const out = await s3().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: mime }));
  if (!out.UploadId) throw new Error('multipart_start');
  return out.UploadId;
}

export async function chunkPut(key: string, backendId: string, index: number, body: Uint8Array): Promise<string> {
  const c = cloudPart(key);
  if (c) { await (await cloud()).cloudChunkPut(Number(c[1]), backendId, index, body); return '1'; }
  const out = await s3().send(new UploadPartCommand({
    Bucket: bucket(), Key: key, UploadId: backendId, PartNumber: index + 1, Body: body, ContentLength: body.byteLength,
  }));
  if (!out.ETag) throw new Error('multipart_part');
  return out.ETag;
}

export async function chunkFinish(key: string, backendId: string, parts: Record<string, string>, total: number, size: number): Promise<void> {
  const c = cloudPart(key);
  if (c) return (await cloud()).cloudChunkFinish(Number(c[1]), backendId, c[2]!, size);
  await s3().send(new CompleteMultipartUploadCommand({
    Bucket: bucket(), Key: key, UploadId: backendId,
    MultipartUpload: { Parts: Array.from({ length: total }, (_, i) => ({ PartNumber: i + 1, ETag: parts[String(i)]! })) },
  }));
}

export async function chunkAbort(key: string, backendId: string): Promise<void> {
  const c = cloudPart(key);
  if (c) return (await cloud()).cloudChunkAbort(Number(c[1]), backendId);
  await s3().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: backendId })).catch(() => undefined);
}
