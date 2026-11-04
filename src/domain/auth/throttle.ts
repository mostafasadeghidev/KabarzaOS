/**
 * شمارندهٔ تلاش‌های ناموفقِ ورود — پنجرهٔ لغزان، در حافظهٔ همین فرایند.
 *
 * ⚠️ `attemptLogin` از قبل `recentFailures/maxFailures` را می‌فهمید ولی هیچ‌کس
 * شمارنده‌ای به آن نمی‌داد؛ محدودیت عملاً خاموش بود. اینجا فقط شمارش است؛
 * تصمیم همان‌جا می‌ماند.
 *
 * ⚠️ حافظهٔ فرایند، نه دیتابیس: با چند نمونهٔ موازی هر نمونه شمارندهٔ خودش را
 * دارد — سقفِ مؤثر ضرب در تعدادِ نمونه می‌شود، ولی هرگز صفر نمی‌شود.
 */

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES = 10;

export interface FailureStore {
  recentFailures(key: string, now?: number): number;
  recordFailure(key: string, now?: number): void;
  clear(key: string): void;
}

export function createFailureStore(windowMs = LOGIN_WINDOW_MS): FailureStore {
  const hits = new Map<string, number[]>();
  const prune = (key: string, now: number): number[] => {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  };
  return {
    recentFailures: (key, now = Date.now()) => prune(key, now).length,
    recordFailure: (key, now = Date.now()) => { hits.set(key, [...prune(key, now), now]); },
    clear: (key) => { hits.delete(key); },
  };
}

/**
 * سقفِ شکست برای خودِ **حساب** از همهٔ IP ها با هم (۲.۵۷.۰).
 *
 * ⚠️ پیش از این شناسه هم با همان ۱۰ قفل می‌شد: هر کسی با ده رمزِ غلط حسابِ
 * مدیر را ۱۵ دقیقه قفل می‌کرد، و بارها. حالا سقفِ تنگ روی «همین IP» و «همین
 * حساب از همین IP» است؛ خودِ حساب فقط با رگبارِ پخش‌شده (۵ برابر) قفل می‌شود.
 */
export const LOGIN_MAX_ACCOUNT_FAILURES = LOGIN_MAX_FAILURES * 5;

/** کلیدها: شناسه، IP، و جفتِ «شناسه از این IP» — هر سه جدا شمرده می‌شوند. */
export function throttleKeys(identifier: string, ip: string | null): string[] {
  const id = identifier.trim().toLowerCase();
  const addr = ip?.trim() ?? '';
  const keys = id ? [`id:${id}`] : [];
  if (addr) keys.push(`ip:${addr}`);
  if (id && addr) keys.push(`pair:${id}|${addr}`);
  return keys;
}

/**
 * سخت‌گیرانه‌ترین کلید، به مقیاسِ `LOGIN_MAX_FAILURES`: کلیدِ حساب با سقفِ
 * بزرگ‌ترش کوچک می‌شود تا هر سه با یک عدد سنجیده شوند.
 */
export function worstFailures(store: FailureStore, keys: readonly string[], now?: number): number {
  return keys.reduce((max, k) => {
    const raw = store.recentFailures(k, now);
    const scaled = k.startsWith('id:')
      ? Math.floor((raw * LOGIN_MAX_FAILURES) / LOGIN_MAX_ACCOUNT_FAILURES)
      : raw;
    return Math.max(max, scaled);
  }, 0);
}
