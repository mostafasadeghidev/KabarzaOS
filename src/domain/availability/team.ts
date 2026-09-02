/**
 * قواعدِ نمای تیمیِ «در دسترس بودن» — خالص و تست‌پذیر.
 *
 * منبع: `Admin\Availability_Page` و `Support\Availability`.
 */

import { isNowWithin, type Slot } from './weekly';

/**
 * «در دسترسِ الان».
 *
 * ⚠️ سه شرط، و ترتیبشان مهم است (پورتِ خطِ `$now = ...` ِ صفحهٔ افزونه):
 *  ۱. روزِ امروز در برنامه‌اش **باشد** — نبودنِ کلید یعنی آن روز کار نمی‌کند.
 *     این با «هست ولی خالی» فرق دارد: خالی یعنی تمامِ روز.
 *  ۲. ساعتِ فعلی داخلِ یکی از بازه‌ها باشد.
 *  ۳. امروز مرخصی **نباشد** — مرخصی بر برنامه مقدم است، هرچه برنامه بگوید.
 */
export function isAvailableNow(input: {
  days: ReadonlyMap<number, Slot[]>;
  today: number;
  onLeave: boolean;
  now: Date;
}): boolean {
  if (input.onLeave) return false;
  const slots = input.days.get(input.today);
  if (slots === undefined) return false;
  return isNowWithin(slots, input.now);
}

/**
 * حالتِ خانهٔ ماتریس.
 *
 * ⚠️ مرخصی **فقط خانهٔ امروز** را عوض می‌کند، نه کلِ سطر را. عضوی که این
 * هفته مرخصی است، برنامهٔ بقیهٔ روزهایش باید دیده شود — وگرنه سطرش خالی
 * می‌نماید و انگار اصلاً برنامه‌ای ندارد.
 */
export type CellState = 'leave' | 'avail' | 'empty';

export function cellState(input: {
  isToday: boolean;
  onLeave: boolean;
  hasDay: boolean;
}): CellState {
  if (input.isToday && input.onLeave) return 'leave';
  return input.hasDay ? 'avail' : 'empty';
}

/**
 * مدتِ تایمرِ روشن به شکلِ `H:MM`.
 * ⚠️ ساعت سقف ندارد — تایمرِ ۲۶ ساعته «۲۶:۰۰» است، نه «۲:۰۰».
 */
export function formatElapsed(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** دقیقهٔ سپری‌شده از یک شروع. */
export function elapsedMinutes(startedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60000));
}

/**
 * ترتیبِ پنلِ «آنلاین اکنون»: اول فعال‌ها، بعد بی‌کارها؛ داخلِ هر گروه
 * تازه‌دیده‌شده‌ها بالاتر.
 */
export function sortOnline<T extends { state: 'active' | 'idle'; seen: Date }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.state !== b.state) return a.state === 'active' ? -1 : 1;
    return b.seen.getTime() - a.seen.getTime();
  });
}
