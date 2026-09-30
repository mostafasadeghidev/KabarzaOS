/**
 * هماهنگیِ تب‌های یک مرورگر برای ضربانِ حضور.
 *
 * ⚠️ مشکلِ پیشین: بستنِ **هر** تب، کاربر را فوراً آفلاین می‌کرد، حتی اگر تبِ
 * دیگرش باز بود — تا ضربانِ بعدیِ آن تب (تا یک دقیقه) «آفلاین» دیده می‌شد.
 * حالا هر تب زمانِ آخرین ضربانش را در یک دفترچهٔ مشترک (localStorage) می‌نویسد
 * و «آفلاین» فقط وقتی فرستاده می‌شود که تبِ زندهٔ دیگری نمانده باشد.
 *
 * منطقِ خالص اینجاست تا بی‌مرورگر آزموده شود؛ خواندن/نوشتنِ localStorage در
 * `components/presence.tsx`.
 */

/** شناسهٔ تب ← آخرین زمانِ زنده‌بودن (میلی‌ثانیه). */
export type TabRegistry = Record<string, number>;

/** تبی که در این بازه نشانی نداده مرده حساب می‌شود (بسته یا خوابیده). */
export function tabWindowMs(pingSeconds: number): number {
  return Math.max(pingSeconds, 15) * 1500;
}

/** ثبتِ زنده‌بودنِ این تب و دورریختنِ تب‌های مرده — تا دفترچه رشد نکند. */
export function markTab(registry: TabRegistry, tabId: string, now: number, windowMs: number): TabRegistry {
  const next: TabRegistry = {};
  for (const [id, at] of Object.entries(registry)) {
    if (typeof at === 'number' && now - at < windowMs) next[id] = at;
  }
  next[tabId] = now;
  return next;
}

/** بستنِ این تب — بقیه دست‌نخورده. */
export function dropTab(registry: TabRegistry, tabId: string): TabRegistry {
  const next = { ...registry };
  delete next[tabId];
  return next;
}

/** آیا تبِ زندهٔ **دیگری** هست؟ اگر هست، بستنِ این تب نباید آفلاین کند. */
export function otherTabsAlive(registry: TabRegistry, tabId: string, now: number, windowMs: number): boolean {
  return Object.entries(registry).some(([id, at]) => id !== tabId && typeof at === 'number' && now - at < windowMs);
}

/**
 * تبِ پس‌زمینه ضربان بفرستد؟ فقط اگر هیچ تبی در همین تازگی نفرستاده باشد —
 * چند تبِ باز یعنی چند درخواستِ هم‌زمانِ بی‌فایده. تبِ **جلوی چشم** همیشه
 * می‌فرستد، چون فقط او می‌تواند بگوید کاربر «فعال» است.
 */
export function shouldBeat(focused: boolean, lastSentAt: number | null, now: number, pingSeconds: number): boolean {
  if (focused) return true;
  if (lastSentAt === null) return true;
  return now - lastSentAt >= pingSeconds * 800;
}
