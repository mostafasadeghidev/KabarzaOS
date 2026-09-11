/**
 * فیلترِ «جزئیاتِ ثبت‌ها» در تبِ مدیریتِ پروژه — عضو و بازهٔ تاریخ.
 *
 * ⚠️ روی همان ثبت‌هایی کار می‌کند که صفحه لود کرده (`projectLogs`: تازه‌ترین
 * ۵۰۰تا، همان سقفِ نسخهٔ قبلی)، نه کلِ تاریخچه — پس فوری است و رفت‌وبرگشتِ
 * سرور ندارد.
 */

export interface LogFilter {
  /** شناسهٔ عضو به‌شکلِ رشته — همان مقدارِ فهرست؛ خالی یعنی همه. */
  userId: string;
  /** `yyyy-mm-dd`؛ خالی یعنی از این سر بی‌کران. هر دو سر شاملِ بازه‌اند. */
  from: string;
  to: string;
}

export function filterLogs<T extends { userId: number; logDate: string }>(
  rows: readonly T[],
  filter: LogFilter,
): T[] {
  // ⚠️ مقایسهٔ رشته‌ای درست است: `yyyy-mm-dd` به ترتیبِ الفبا همان ترتیبِ زمان است.
  return rows.filter(
    (r) =>
      (filter.userId === '' || String(r.userId) === filter.userId) &&
      (filter.from === '' || r.logDate >= filter.from) &&
      (filter.to === '' || r.logDate <= filter.to),
  );
}

/** اعضای حاضر در ثبت‌ها — هر نفر یک بار، به ترتیبِ نام. */
export function logMembers(
  rows: readonly { userId: number; userName: string | null }[],
): Array<{ id: number; name: string }> {
  const seen = new Map<number, string>();
  for (const r of rows) {
    if (!seen.has(r.userId)) seen.set(r.userId, r.userName ?? `#${r.userId}`);
  }
  return [...seen]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

export function totalMinutes(rows: readonly { minutes: number }[]): number {
  return rows.reduce((sum, r) => sum + r.minutes, 0);
}

/**
 * تاریخِ **محلیِ** مرورگر به‌شکلِ `yyyy-mm-dd` — برای «امروز» ِ میان‌بُرها.
 * ⚠️ نه `toISOString`: آن UTC است و در ساعت‌های اولِ بامداد روزِ دیروز را می‌داد.
 */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
