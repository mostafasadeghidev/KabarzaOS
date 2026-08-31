/**
 * دامنهٔ مدیرِ دفتر — «تیمِ من».
 *
 * منبع: /
 * `office_monitorable_ids()` / `team_overview_cards()`.
 *
 * ⚠️ نکتهٔ محوری که خودِ نسخهٔ قبلی هم صریح نوشته: این دامنه **عملیاتی است، نه
 * مالی**. مدیرِ دفتر کارِ تیمش را می‌بیند — پروژه، تسک، ساعت، بازبینی — ولی
 * دیدنِ پول همچنان مجوزِ مالیِ جداگانه می‌خواهد.
 */

/**
 * آیا این کاربر مدیرِ دفتر است؟
 * دو شرط: پرچمِ مدیریت **و** دستِ‌کم یک دفترِ تحتِ مدیریت.
 *
 * ⚠️ شرطِ دوم را نباید فراموش کرد: کسی که پرچم دارد ولی هیچ دفتری به او
 * تخصیص نیافته، دامنه‌اش خالی است و نباید منوی «تیمِ من» را ببیند — منویی
 * که همیشه خالی است فقط سردرگم‌کننده است.
 */
export function isOfficeManager(managedOfficeIds: readonly number[]): boolean {
  return managedOfficeIds.length > 0;
}

/**
 * شناسه‌هایی که مدیرِ دفتر می‌تواند پروفایلِ کاریشان را باز کند.
 *
 * اعضای دفاترِ تحتِ مدیریت **به‌علاوهٔ** هر کسی که روی پروژه‌های همان دفاتر
 * کار کرده.
 *
 * ⚠️ بخشِ دوم مهم است: در جدولِ ساعتِ کاری ممکن است حسابداری دیده شود که
 * عضوِ آن دفتر نیست؛ بدونِ این، دکمهٔ «جزئیات»ِ همان ردیف کار نمی‌کرد.
 */
export function monitorableUserIds(input: {
  officeMemberIds: readonly number[];
  projectWorkerIds: readonly number[];
}): number[] {
  return [...new Set([...input.officeMemberIds, ...input.projectWorkerIds])];
}

/** آیا مدیرِ دفتر اجازهٔ دیدنِ پروفایلِ این نفر را دارد؟ */
export function canMonitor(userId: number, monitorable: readonly number[]): boolean {
  return monitorable.includes(userId);
}

/* ------------------------------------------------------------------ *
 * بازهٔ گزارشِ دفتر
 * ------------------------------------------------------------------ */

export type RangeKey = 'week' | 'month' | 'all' | 'custom';

export const RANGE_LABELS: Record<RangeKey, string> = {
  week: 'این هفته',
  month: 'این ماه',
  all: 'همه',
  custom: 'بازهٔ دلخواه',
};

export interface DateRange {
  from: string | null;
  to: string | null;
  range: RangeKey;
}

function iso(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * بازهٔ گزارش — پورتِ `office_report_range()`.
 *
 * ⚠️ `all` باید **بدونِ کران** باشد (null)، نه یک تاریخِ خیلی قدیمی؛ وگرنه
 * ردیف‌های قدیمی‌تر از آن حدس بی‌صدا از گزارش می‌افتند.
 */
export function resolveRange(
  input: { range?: string; from?: string; to?: string },
  now: Date,
): DateRange {
  const range = (['week', 'month', 'all', 'custom'] as const)
    .find((r) => r === input.range) ?? 'week';

  if (range === 'all') return { from: null, to: null, range };

  if (range === 'custom') {
    // بازهٔ وارونه جا‌به‌جا می‌شود تا گزارشِ خالی ندهد.
    const a = input.from || null;
    const b = input.to || null;
    if (a && b && a > b) return { from: b, to: a, range };
    return { from: a, to: b, range };
  }

  const to = iso(now);
  const start = new Date(now);
  if (range === 'week') start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);

  return { from: iso(start), to, range };
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/**
 * یک خانهٔ CSV.
 *
 * ⚠️ سه تله که همگی در نسخهٔ قبلی هم رعایت شده‌اند:
 *  · گیومه با دو گیومه فرار می‌شود
 *  · خانه‌ای که با `=`, `+`, `-` یا `@` شروع شود در اکسل **فرمول** است —
 *    یک نقلِ‌قولِ تک جلویش می‌گذاریم تا اجرا نشود (تزریقِ فرمول)
 *  · هر خانه گیومه‌گذاری می‌شود تا ویرگول و خطِ تازه ستون‌ها را نشکنند
 */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * سندِ کاملِ CSV.
 * ⚠️ BOM ِ UTF-8 در ابتدا لازم است، وگرنه اکسلِ ویندوز فارسی را جویده
 * نشان می‌دهد.
 */
export function csvDocument(header: readonly string[], rows: readonly unknown[][]): string {
  return `﻿${[csvRow(header), ...rows.map(csvRow)].join('\r\n')}\r\n`;
}
