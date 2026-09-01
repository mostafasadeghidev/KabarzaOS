/**
 * نوارِ ددلاینِ کارتِ پروژه — ترجمهٔ مستقیمِ.
 *
 * نوار از «تاریخِ ثبت» تا «ددلاین» پر می‌شود و برچسبِ روزهای مانده در انتهایش
 * می‌نشیند. رنگ با فوریت عوض می‌شود.
 */

import { createTranslator, type Translator } from '@/i18n/translate';

/** بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export type DeadlineUrgency = 'normal' | 'warn' | 'soon' | 'over';

export interface DeadlineBar {
  /** درصدِ پرشدنِ نوار — همیشه بینِ ۰ و ۱۰۰. */
  percent: number;
  /** روزهای مانده؛ منفی یعنی گذشته. */
  daysLeft: number;
  urgency: DeadlineUrgency;
}

const DAY = 86_400_000;

/** «۲۰۲۶-۰۸-۲۷» → عددِ میلی‌ثانیه در UTC؛ ورودیِ نامعتبر → null. */
function day(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * محاسبهٔ نوار. بدونِ ددلاین چیزی برنمی‌گرداند (نسخهٔ قبلی هم جای خالی می‌گذارد).
 *
 * ⚠️ اگر تاریخِ ثبت نبود یا **بعد از** ددلاین بود، نسخهٔ قبلی پنجرهٔ ۳۰ روزه فرض
 * می‌کند تا نوار همچنان معنا داشته باشد — نه اینکه صفر یا صددرصد بپرد.
 */
export function deadlineBar(
  deadline: string | null,
  regDate: string | null,
  today: string,
): DeadlineBar | null {
  const end = day(deadline);
  const now = day(today);
  if (end === null || now === null) return null;

  let start = day(regDate);
  if (start === null || start >= end) start = end - 30 * DAY;

  const daysLeft = Math.floor((end - now) / DAY);
  const span = end - start;
  let percent = span > 0 ? Math.round(((now - start) / span) * 100) : 100;
  percent = Math.max(0, Math.min(100, percent));

  // پله‌های رنگ دقیقاً مثلِ نسخهٔ قبلی: >۱۴ عادی · ۸.۱۴ هشدار · ۱.۷ نزدیک · ≤۰ گذشته.
  let urgency: DeadlineUrgency;
  if (daysLeft > 14) urgency = 'normal';
  else if (daysLeft > 7) urgency = 'warn';
  else if (daysLeft > 0) urgency = 'soon';
  else if (daysLeft === 0) urgency = 'soon';
  else {
    urgency = 'over';
    percent = 100; // گذشته همیشه پر است.
  }

  return { percent, daysLeft, urgency };
}

/** برچسبِ روزها — «۵ روز مانده» / «امروز» / «۳ روز گذشته». */
export function deadlineLabel(daysLeft: number, t: Translator = SOURCE): string {
  if (daysLeft > 0) return t('{n} روز مانده', { n: daysLeft });
  if (daysLeft === 0) return t('امروز');
  return t('{n} روز گذشته', { n: Math.abs(daysLeft) });
}

/** درصدِ پیشرفتِ تسک‌ها — `Tasks::progress()`. */
export function taskProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
