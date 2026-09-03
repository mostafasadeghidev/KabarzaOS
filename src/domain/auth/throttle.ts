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

/** کلیدها: شناسهٔ نرمال‌شده و نشانیِ IP — هر دو جدا شمرده می‌شوند. */
export function throttleKeys(identifier: string, ip: string | null): string[] {
  const id = identifier.trim().toLowerCase();
  const keys = id ? [`id:${id}`] : [];
  if (ip) keys.push(`ip:${ip.trim()}`);
  return keys;
}

/** بیشترین شمارِ شکست میانِ کلیدها — سخت‌گیرانه‌ترین کلید تصمیم می‌گیرد. */
export function worstFailures(store: FailureStore, keys: readonly string[], now?: number): number {
  return keys.reduce((max, k) => Math.max(max, store.recentFailures(k, now)), 0);
}
