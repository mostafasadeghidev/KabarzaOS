/**
 * خودآزماییِ باکت — پورتِ `Private_Files::protection_status()`.
 *
 * باکت باید درخواستِ **بی‌احراز** را رد کند؛ تنها راهِ خواندنِ فایل مسیرِ
 * گیت‌شدهٔ `/api/files/[id]` است (R-FILE-01). اگر کسی سیاستِ باکت را
 * «public» کند، همهٔ رسیدها و قراردادها با حدسِ کلید خوانده می‌شوند و هیچ
 * خطایی جایی دیده نمی‌شود — این آزمون تنها جایی است که آن را می‌بیند.
 */
export type BucketStatus = 'protected' | 'exposed' | 'unknown';

/** نتیجه ۱۲ ساعت معتبر است — همان `set_transient( …, 12 * HOUR )`. */
export const PROBE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * حکمِ آزمون از پاسخِ درخواستِ بی‌احراز.
 * ⚠️ «باز» فقط وقتی که **محتوای خودِ نمونه** با ۲۰۰ برگردد: صفحهٔ خطای ۲۰۰ ِ
 * یک پراکسی یا دامنهٔ پارک‌شده نباید هشدارِ دروغ بدهد. خطای شبکه «نامشخص» است،
 * نه «امن» — ندانستن را نباید امن نشان داد.
 */
export function probeVerdict(response: { status: number; body: string } | null, token: string): BucketStatus {
  if (response === null) return 'unknown';
  if (response.status === 200 && token !== '' && response.body.includes(token)) return 'exposed';
  return 'protected';
}

/** نتیجهٔ ذخیره‌شده هنوز تازه است؟ */
export function isFresh(checkedAt: string | null, now: Date): boolean {
  if (!checkedAt) return false;
  const at = Date.parse(checkedAt);
  return Number.isFinite(at) && now.getTime() - at < PROBE_TTL_MS;
}
