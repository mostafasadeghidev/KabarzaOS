/**
 * فیلترهای صفحهٔ گزارش‌ها — پورتِ `office_ids_req`, `hours_week_range`,
 * `hours_presets` و بازهٔ پیش‌فرضِ تبِ «هزینه‌ها» ِ افزونه.
 *
 * ⚠️ همه‌چیز رشته‌ای (YYYY-MM-DD) و بدونِ منطقهٔ زمانی است: «امروز» را
 * فراخوان می‌دهد تا دامنه به ساعتِ سرور وابسته نباشد.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** تاریخِ معتبرِ YYYY-MM-DD، وگرنه null. */
export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().slice(0, 10);
  if (!DATE_RE.test(v)) return null;
  return Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

/**
 * پورتِ `office_ids_req`: هم `office=1&office=2` و هم `office=1,2`؛ صفر و
 * ناعدد دور ریخته می‌شود؛ خالی یعنی «همهٔ دفاتر».
 */
export function parseIds(value: unknown): number[] {
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(parts)];
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return isoDate(at);
}

export interface DateRange { from: string; to: string }

/**
 * پورتِ `hours_week_range`: از روزِ شروعِ هفتهٔ **تنظیمات** تا امروز.
 * شاخصِ ایرانی: ۰ = شنبه … ۶ = جمعه (`getUTCDay` ِ جاوااسکریپت یکشنبه = ۰).
 */
export function weekRange(today: string, weekStart: number): DateRange {
  const start = weekStart >= 0 && weekStart <= 6 ? weekStart : 0;
  const todayIdx = (new Date(`${today}T12:00:00Z`).getUTCDay() + 1) % 7;
  const sinceStart = (todayIdx - start + 7) % 7;
  return { from: shiftDays(today, -sinceStart), to: today };
}

export function monthRange(today: string): DateRange {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function yearRange(today: string): DateRange {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

/**
 * بازهٔ تبِ هزینه‌ها — پورتِ افزونه: اگر هیچ‌کدام نیامده، **این ماه**؛ وگرنه
 * همان که آمده (یک سرِ باز مجاز است).
 */
export function expenseRange(input: { from?: unknown; to?: unknown }, today: string): DateRange {
  const from = parseDate(input.from) ?? '';
  const to = parseDate(input.to) ?? '';
  if (from === '' && to === '') return monthRange(today);
  return { from, to };
}

/**
 * بازهٔ تبِ ساعت — پورتِ `hours_report`: بدونِ پارامتر «این هفته»؛ با پارامترِ
 * حاضر ولی خالی (پیش‌تنظیمِ «کل دوره») همهٔ زمان.
 */
export function hoursRange(
  input: { from?: unknown; to?: unknown },
  today: string,
  weekStart: number,
): DateRange & { allTime: boolean } {
  const present = input.from !== undefined || input.to !== undefined;
  if (!present) return { ...weekRange(today, weekStart), allTime: false };
  const from = parseDate(input.from) ?? '';
  const to = parseDate(input.to) ?? '';
  return { from, to, allTime: from === '' && to === '' };
}

export interface RangePreset { key: string; label: string; from: string; to: string }

/** پیش‌تنظیم‌های تبِ هزینه‌ها: این ماه / امسال. */
export function expensePresets(today: string): RangePreset[] {
  return [
    { key: 'month', label: 'این ماه', ...monthRange(today) },
    { key: 'year', label: 'امسال', ...yearRange(today) },
  ];
}

/** پیش‌تنظیم‌های تبِ ساعت: این هفته / این ماه (+ «کل دوره» در ریزِ عضو). */
export function hoursPresets(today: string, weekStart: number, withAllTime = false): RangePreset[] {
  const out: RangePreset[] = [
    { key: 'week', label: 'این هفته', ...weekRange(today, weekStart) },
    { key: 'month', label: 'این ماه', ...monthRange(today) },
  ];
  if (withAllTime) out.push({ key: 'all', label: 'کل دوره', from: '', to: '' });
  return out;
}

export function isPresetActive(preset: RangePreset, range: { from: string; to: string }): boolean {
  return preset.from === range.from && preset.to === range.to;
}

/** پورتِ کارتِ «میانگین ماهانه»: جمع ÷ ماه‌های **دارای داده**. */
export function monthlyAverage(total: number, monthsWithData: number): number {
  return monthsWithData > 0 ? total / monthsWithData : 0;
}

/** پورتِ ستونِ «روند»: درصدِ هر ماه نسبت به پرترین ماه. */
export function withBars<T extends { amount: number }>(rows: readonly T[]): Array<T & { pct: number }> {
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0);
  return rows.map((r) => ({ ...r, pct: max > 0 ? Math.round((r.amount / max) * 100) : 0 }));
}

export interface ReportQuery {
  tab?: string | null;
  office?: readonly number[];
  from?: string | null;
  to?: string | null;
  hfrom?: string | null;
  hto?: string | null;
  date?: string | null;
  /** «کل دوره»: پارامترهای ساعت حاضر ولی خالی می‌روند. */
  hoursAllTime?: boolean;
}

/**
 * رشتهٔ پرس‌وجوی صفحه/خروجی — دفترها تکراری (`office=1&office=2`) تا با
 * `parseIds` جور باشد؛ مقدارِ خالی نمی‌رود مگر «کل دوره» ِ ساعت.
 */
export function reportQuery(q: ReportQuery): string {
  const p = new URLSearchParams();
  if (q.tab) p.set('tab', q.tab);
  for (const id of q.office ?? []) p.append('office', String(id));
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.hoursAllTime) { p.set('hfrom', ''); p.set('hto', ''); }
  else {
    if (q.hfrom) p.set('hfrom', q.hfrom);
    if (q.hto) p.set('hto', q.hto);
  }
  if (q.date) p.set('date', q.date);
  return p.toString();
}

/** پورتِ برچسبِ بازه زیرِ نامِ عضو: «از … تا …» یا «کل دوره». */
export function rangeLabel(
  range: { from: string; to: string },
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (range.from === '' && range.to === '') return t('کل دوره');
  return t('از {from} تا {to}', { from: range.from || '—', to: range.to || '—' });
}
