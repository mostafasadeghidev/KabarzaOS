import {
  CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand,
  PutObjectCommand, S3Client,
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
  await s3().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: mime,
  }));
}

/** بایت‌های یک شیء. */
export async function getObject(key: string): Promise<Uint8Array> {
  const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return out.Body!.transformToByteArray();
}

/**
 * حذفِ شیء.
 * ⚠️ خطا خورده نمی‌شود مگر عمداً: پاک‌کردنِ ردیفِ دیتابیس بدونِ پاک‌شدنِ شیء
 * یعنی فایلِ بی‌صاحبِ ماندگار. فراخوان تصمیم می‌گیرد چه کند.
 */
export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
