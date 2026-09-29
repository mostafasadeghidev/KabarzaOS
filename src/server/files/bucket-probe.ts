import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { schedulerStamps } from '@/db/schema';
import { isOwner, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import { isFresh, probeVerdict, type BucketStatus } from '@/domain/files/probe';
import { bucket, deleteObject, putObject } from './storage';

/**
 * خودآزماییِ باکت — پورتِ `Private_Files` (F#270–272).
 *
 * یک نمونه با توکنِ تصادفی در باکت نوشته می‌شود و بعد **بی‌هیچ اعتبارنامه‌ای**
 * از نشانیِ مستقیمِ S3 خوانده می‌شود. اگر محتوایش برگشت، باکت به روی بیرون
 * باز است. نتیجه با زمانش در `scheduler_stamps` می‌ماند (۱۲ ساعت)، تا هر
 * بازدید دوباره آزمون نکند و همهٔ نمونه‌های سرور یک جواب بدهند.
 */

const STAMP = 'files:bucket_probe';
const PROBE_KEY = '.probe/probe.txt';

export interface BucketCheck {
  status: BucketStatus;
  checkedAt: string | null;
}

async function readCached(): Promise<BucketCheck | null> {
  const rows = await db.select({ value: schedulerStamps.value }).from(schedulerStamps)
    .where(eq(schedulerStamps.key, STAMP));
  if (!rows[0]) return null;
  try {
    const parsed = JSON.parse(rows[0].value) as BucketCheck;
    return parsed.status ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCached(check: BucketCheck): Promise<void> {
  const value = JSON.stringify(check);
  await db.insert(schedulerStamps).values({ key: STAMP, value })
    .onConflictDoUpdate({ target: schedulerStamps.key, set: { value, updatedAt: new Date() } });
}

/**
 * خودِ آزمون. ⚠️ نشانیِ **مستقیمِ** S3 (مسیرمحور، همان که `forcePathStyle`
 * می‌سازد) خوانده می‌شود، نه مسیرِ اپ؛ و درخواست هیچ هدرِ امضایی ندارد.
 * نمونه بعد از آزمون پاک می‌شود. شکستِ نوشتن یا شبکه «نامشخص» است.
 */
async function runProbe(now: Date): Promise<BucketCheck> {
  const token = randomBytes(16).toString('hex');
  let status: BucketStatus = 'unknown';
  try {
    await putObject(PROBE_KEY, new TextEncoder().encode(`kabarza-probe:${token}`), 'text/plain');
    const endpoint = (process.env.S3_ENDPOINT ?? '').replace(/\/+$/, '');
    const response = await fetch(`${endpoint}/${bucket()}/${PROBE_KEY}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    }).then(async (r) => ({ status: r.status, body: await r.text() })).catch(() => null);
    status = probeVerdict(response, token);
  } catch (error) {
    console.error('[files] bucket probe', error);
  } finally {
    await deleteObject(PROBE_KEY).catch(() => undefined);
  }
  const check = { status, checkedAt: now.toISOString() };
  await writeCached(check);
  return check;
}

/** آخرین نتیجهٔ ذخیره‌شده — بی‌آزمون؛ برای هشدارِ پوسته که روی هر صفحه است. */
export async function cachedBucketCheck(): Promise<BucketCheck | null> {
  return readCached();
}

/** نتیجهٔ تازه — اگر کهنه یا نبود، همین حالا آزمون می‌شود. */
export async function bucketCheck(now = new Date()): Promise<BucketCheck> {
  const cached = await readCached();
  if (cached && isFresh(cached.checkedAt, now)) return cached;
  return runProbe(now);
}

/**
 * «بررسی دوباره» — پورتِ `handle_recheck`: کش را کنار می‌گذارد و همین حالا
 * آزمون می‌کند. ⚠️ فقط مالک (`manage_options`)؛ آزمون شیء می‌نویسد و درخواستِ
 * بیرونی می‌فرستد و نباید با هر کلیکی تکرار شود.
 */
export async function recheckBucket(actor: Actor, now = new Date()): Promise<BucketCheck> {
  if (!isOwner(actor)) throw new ForbiddenError('owner');
  return runProbe(now);
}
