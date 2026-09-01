/**
 * در دسترس بودنِ هفتگی — قواعدِ خالص.
 *
 * منبع: `Support\Availability`.
 *
 * ⚠️ ترتیبِ هفته **ایرانی** است: ۰ = شنبه … ۶ = جمعه. جاوااسکریپت یکشنبه را
 * صفر می‌داند، پس هر تبدیلی باید صریح باشد وگرنه یک روز جابه‌جا می‌شود.
 */

import { createTranslator, type Translator } from '@/i18n/translate';

/** بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export const WEEKDAYS = [
  'شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه',
] as const;

export interface Slot {
  from: string;
  to: string;
}

/** روزِ هفتهٔ ایرانیِ یک تاریخ. */
export function weekdayIndex(at: Date): number {
  // getDay(): ۰ = یکشنبه … ۶ = شنبه ← ایرانی: شنبه = ۰
  return (at.getDay() + 1) % 7;
}

/**
 * ترتیبِ **نمایشِ** روزها، چرخیده تا از روزِ آغازِ هفتهٔ تنظیمات شروع شود.
 * ⚠️ ذخیره همیشه ۰..۶ ایرانی می‌ماند؛ فقط ترتیبِ نمایش عوض می‌شود.
 */
export function weekOrder(weekStart = 0): number[] {
  const start = weekStart >= 0 && weekStart <= 6 ? weekStart : 0;
  return Array.from({ length: 7 }, (_, k) => (start + k) % 7);
}

/** فقط `HH:MM` ِ ۲۴ ساعتهٔ معتبر. */
export function cleanTime(raw: string): string | null {
  const value = raw.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

/**
 * پاک‌سازیِ فهرستِ بازه‌ها.
 * ⚠️ بازهٔ ناقص یا وارونه **حذف** می‌شود، نه اینکه خطا بدهد — همان رفتارِ
 * نسخهٔ قبلی: فرمِ نیمه‌پرشده نباید ذخیره را کلاً شکست دهد.
 */
export function cleanSlots(raw: ReadonlyArray<{ from: string; to: string }>): Slot[] {
  const out: Slot[] = [];
  for (const s of raw) {
    const from = cleanTime(s.from ?? '');
    const to = cleanTime(s.to ?? '');
    if (from && to && from < to) out.push({ from, to });
  }
  return out;
}

/**
 * نمایشِ کاملِ بازه‌ها.
 * ⚠️ فهرستِ **خالی** یعنی «تمام روز»، نه «در دسترس نیست» — روزی که تیک خورده
 * ولی ساعت ندارد، یعنی تمامِ روز آزاد است.
 */
export function formatSlots(slots: readonly Slot[], t: Translator = SOURCE): string {
  if (slots.length === 0) return t('تمام روز');
  return slots.map((s) => `${s.from}–${s.to}`).join(t('، '));
}

/**
 * خلاصهٔ یک‌خطی برای خانهٔ ماتریس: زودترین شروع تا دیرترین پایان.
 * ⚠️ اگر بیش از یک بازه باشد «…» می‌گیرد، وگرنه با یک بلوکِ پیوسته اشتباه
 * گرفته می‌شود.
 */
export function slotsSpan(slots: readonly Slot[]): string {
  if (slots.length === 0) return 'تمام روز';
  let from = slots[0]!.from;
  let to = slots[0]!.to;
  for (const s of slots) {
    if (s.from < from) from = s.from;
    if (s.to > to) to = s.to;
  }
  const span = `${from}–${to}`;
  return slots.length > 1 ? `${span} …` : span;
}

/** آیا این لحظه داخلِ بازه‌های آن روز است؟ فهرستِ خالی = تمام روز. */
export function isNowWithin(slots: readonly Slot[], now: Date): boolean {
  if (slots.length === 0) return true;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const current = `${hh}:${mm}`;
  return slots.some((s) => current >= s.from && current <= s.to);
}

/**
 * برنامهٔ ذخیره: روزهای تیک‌خورده + بازه‌هایشان.
 *
 * ⚠️ روزی که تیک نخورده هیچ ردیفی ندارد؛ روزی که تیک خورده ولی بازه ندارد،
 * یک ردیفِ «تمام روز» می‌گیرد. تفاوتِ این دو حالت را نباید گم کرد.
 */
export const ALL_DAY: Slot = { from: '00:00', to: '23:59' };

export function planWeek(
  onDays: readonly number[],
  slotsByDay: Readonly<Record<number, ReadonlyArray<{ from: string; to: string }>>>,
): Array<{ weekday: number; from: string; to: string }> {
  const rows: Array<{ weekday: number; from: string; to: string }> = [];
  const days = [...new Set(onDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  for (const weekday of days.sort((a, b) => a - b)) {
    const slots = cleanSlots(slotsByDay[weekday] ?? []);
    if (slots.length === 0) {
      rows.push({ weekday, ...ALL_DAY });
      continue;
    }
    for (const s of slots) rows.push({ weekday, from: s.from, to: s.to });
  }
  return rows;
}

/** آیا این ردیف همان «تمام روز» است؟ */
export function isAllDay(slot: Slot): boolean {
  return slot.from === ALL_DAY.from && slot.to === ALL_DAY.to;
}

/** ردیف‌های ذخیره‌شده → نقشهٔ روز ← بازه‌ها (تمام‌روز به فهرستِ خالی برمی‌گردد). */
export function slotsByWeekday(
  rows: ReadonlyArray<{ weekday: number; from: string; to: string }>,
): Map<number, Slot[]> {
  const map = new Map<number, Slot[]>();
  for (const row of rows) {
    const list = map.get(row.weekday) ?? [];
    if (!isAllDay(row)) list.push({ from: row.from, to: row.to });
    map.set(row.weekday, list);
  }
  return map;
}
