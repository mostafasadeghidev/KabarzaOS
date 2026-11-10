/**
 * بارگذاریِ تکه‌تکهٔ فایلِ پشتیبان با ادامه پس از قطعی (۲.۵۸.۲).
 *
 * پیش از این فقط خطای شبکهٔ خالص پنج بار و در حدودِ ۲۰ ثانیه دوباره امتحان
 * می‌شد؛ پاسخِ «زمان تمام شد» ِ پراکسی (۵۰۴ ِ Traefik، ۵۲۴ ِ Cloudflare که
 * هر درخواست را ۱۰۰ ثانیه وقت می‌دهد) بی‌درنگ کلِ کار را می‌ایستاند. ژتون هم
 * فقط در حافظهٔ صفحه بود، پس تلاشِ دوباره ۱۰ دقیقه پشتِ قفلِ «کسِ دیگری در
 * حالِ بازگردانی است» می‌ماند — قفلی که همان بارگذاریِ نیمه‌کارهٔ خودِ کاربر بود.
 *
 * حالا:
 * - قطعی و پاسخ‌های گذرا (۴۰۸، ۴۲۹، ۵xx) با فاصلهٔ رو به افزایش دوباره امتحان
 *   می‌شوند، تا وقتی که ۳۰ دقیقه هیچ پیشرفتی نباشد؛
 * - «زمان تمام شد» تکه را کوچک‌تر می‌کند (۸ ← ۲ ← ½ مگ) تا اینترنتِ کند هم
 *   زیرِ سقفِ زمانیِ پراکسی بماند؛
 * - جای درست را همیشه سرور می‌گوید (خطای offset)، پس تکهٔ نیمه‌رسیده دوباره
 *   فرستاده می‌شود و تکهٔ رسیده‌ای که پاسخش گم شد تکرار نمی‌شود؛
 * - ژتون در localStorage می‌ماند تا تازه‌کردنِ صفحه هم از همان‌جا ادامه دهد.
 *
 * ⚠️ منطقِ خالص و بی‌وابستگی به React، تا تست بتواند قطعی را شبیه‌سازی کند.
 */

export const CHUNK_SIZES = [8 * 1024 * 1024, 2 * 1024 * 1024, 512 * 1024] as const;
/** بی‌پیشرفت بیش از این = رها کردن (سرور خودش پس از ۱۰ دقیقه بی‌کاری ژتون را باطل می‌کند و ما دوباره می‌گیریم). */
export const STALL_MS = 30 * 60 * 1000;
const MAX_BACKOFF_MS = 30_000;

export class UploadError extends Error {}

/** پاسخ‌هایی که گذرا هستند و تلاشِ دوباره معنا دارد. */
export function isTransient(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** پاسخ‌هایی که یعنی «تکه در زمانِ مجاز نرسید» — تکه را کوچک کن. */
export function isTimeout(status: number): boolean {
  return status === 408 || status === 504 || status === 522 || status === 524;
}

export function backoff(attempt: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
}

export interface UploadDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** تا برگشتنِ اینترنت صبر می‌کند (در مرورگر رویدادِ online). */
  waitOnline: () => Promise<void>;
  aborted: () => boolean;
}

export interface UploadHooks {
  onProgress: (sent: number) => void;
  /** true = در حالِ صبر برای تلاشِ دوباره. */
  onWaiting: (waiting: boolean) => void;
}

type ChunkResult =
  | { kind: 'ok'; size: number }
  | { kind: 'offset'; expected: number }
  | { kind: 'retry'; timeout: boolean; tooLarge?: boolean }
  | { kind: 'fail'; code: string };

async function sendChunk(deps: UploadDeps, token: string, offset: number, body: Blob): Promise<ChunkResult> {
  let res: Response;
  try {
    res = await deps.fetch('/api/setup/restore?op=chunk', {
      method: 'POST',
      headers: {
        'x-restore-token': token,
        'x-offset': String(offset),
        'content-type': 'application/octet-stream',
      },
      body,
    });
  } catch {
    // قطعیِ شبکه — ممکن است وسطِ ارسالِ یک تکهٔ بزرگ هم باشد.
    return { kind: 'retry', timeout: true };
  }
  if (res.status === 413) return { kind: 'retry', timeout: false, tooLarge: true };
  const data = (await res.json().catch(() => ({}))) as { size?: unknown; error?: unknown; expected?: unknown };
  if (res.ok && typeof data.size === 'number') return { kind: 'ok', size: data.size };
  if (data.error === 'offset' && typeof data.expected === 'number') return { kind: 'offset', expected: data.expected };
  if (!res.ok && isTransient(res.status)) return { kind: 'retry', timeout: isTimeout(res.status) };
  // پاسخِ ۲۰۰ بی‌بدنه (مثلاً صفحهٔ خطای پراکسی) هم گذرا حساب می‌شود.
  if (res.ok) return { kind: 'retry', timeout: false };
  return { kind: 'fail', code: String(data.error ?? 'upload') };
}

/**
 * فایل را از جایی که سرور دارد تا آخر می‌فرستد. شروع با offset ِ صفر کافی است:
 * اگر سرور بیشتر دارد، با خطای offset جای درست را می‌گوید.
 */
export async function uploadFile(file: Blob, token: string, deps: UploadDeps, hooks: UploadHooks): Promise<void> {
  let level = 0;
  let offset = 0;
  let attempt = 0;
  let lastProgress = deps.now();

  while (offset < file.size) {
    if (deps.aborted()) throw new UploadError('aborted');
    const size = CHUNK_SIZES[level]!;
    const result = await sendChunk(deps, token, offset, file.slice(offset, offset + size));

    if (result.kind === 'ok') {
      offset = result.size;
      attempt = 0;
      lastProgress = deps.now();
      hooks.onWaiting(false);
      hooks.onProgress(offset);
      continue;
    }
    if (result.kind === 'offset') {
      // سرور جای دیگری است — یا تکهٔ قبلی رسیده و پاسخش گم شد، یا ادامه پس از تازه‌کردن.
      if (result.expected !== offset) {
        lastProgress = deps.now();
        hooks.onProgress(result.expected);
      }
      offset = result.expected;
      continue;
    }
    if (result.kind === 'fail') throw new UploadError(result.code);

    // retry
    if (result.tooLarge && level < CHUNK_SIZES.length - 1) { level = CHUNK_SIZES.length - 1; continue; }
    if (result.timeout && level < CHUNK_SIZES.length - 1) level++;
    if (deps.now() - lastProgress > STALL_MS) throw new UploadError('stalled');
    attempt++;
    hooks.onWaiting(true);
    await deps.waitOnline();
    await deps.sleep(backoff(attempt));
  }
  hooks.onWaiting(false);
}

/* ── نگه‌داشتنِ ژتون برای ادامه پس از تازه‌کردنِ صفحه ─────────────────── */

const KEY = 'kbz-restore-upload';

interface Saved { token: string; name: string; size: number; modified: number }

const fingerprint = (file: File) => ({ name: file.name, size: file.size, modified: file.lastModified });

/** ژتونِ ذخیره‌شده — فقط اگر برای همین فایل باشد. */
export function savedToken(file: File): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    const f = fingerprint(file);
    if (saved && saved.name === f.name && saved.size === f.size && saved.modified === f.modified) return saved.token;
  } catch { /* حافظهٔ مرورگر در دسترس نیست — بی ادامه کار می‌کند */ }
  return null;
}

export function saveToken(file: File, token: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ token, ...fingerprint(file) } satisfies Saved)); } catch { /* همان */ }
}

export function clearToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* همان */ }
}
