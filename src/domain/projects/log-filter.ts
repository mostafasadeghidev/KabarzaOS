/**
 * فیلترِ «جزئیاتِ ثبت‌ها» در تبِ مدیریتِ پروژه — عضو و روز.
 *
 * ⚠️ روی همان ثبت‌هایی کار می‌کند که صفحه لود کرده (`projectLogs`: تازه‌ترین
 * ۵۰۰تا، همان سقفِ نسخهٔ قبلی)، نه کلِ تاریخچه — پس فوری است و رفت‌وبرگشتِ
 * سرور ندارد.
 */

export interface LogFilter {
  /** شناسهٔ عضو به‌شکلِ رشته — همان مقدارِ select؛ خالی یعنی همه. */
  userId: string;
  /** `yyyy-mm-dd`؛ خالی یعنی همهٔ روزها. */
  date: string;
}

export function filterLogs<T extends { userId: number; logDate: string }>(
  rows: readonly T[],
  filter: LogFilter,
): T[] {
  return rows.filter(
    (r) =>
      (filter.userId === '' || String(r.userId) === filter.userId) &&
      (filter.date === '' || r.logDate === filter.date),
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
