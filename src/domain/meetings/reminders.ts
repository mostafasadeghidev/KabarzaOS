/**
 * یادآورها — ترجمهٔ `Support\Reminders`.
 *
 * یک یادآور یک **زمانِ هدف** دارد و چند **پیش‌آگاهی**: مثلاً «۱ روز قبل» و
 * «سرِ موقع» با هم.
 */

import { createTranslator, type Translator } from '@/i18n/translate';

/** بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

/** گزینه‌های پیش‌آگاهی برحسبِ دقیقه — دقیقاً همان چهار گزینهٔ نسخهٔ قبلی. */
export const LEAD_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 0, label: 'سرِ موقع' },
  { minutes: 10, label: '۱۰ دقیقه قبل' },
  { minutes: 60, label: '۱ ساعت قبل' },
  { minutes: 1440, label: '۱ روز قبل' },
];

const VALID_LEADS = new Set(LEAD_OPTIONS.map((o) => o.minutes));

export function leadLabel(minutes: number, t: Translator = SOURCE): string {
  const found = LEAD_OPTIONS.find((o) => o.minutes === minutes);
  return found ? t(found.label) : t('{n} دقیقه قبل', { n: minutes });
}

/**
 * ⚠️ پاک‌سازیِ پیش‌آگاهی‌ها: فقط مقادیرِ شناخته‌شده، بدونِ تکرار، مرتب.
 * فهرستِ خالی به «سرِ موقع» می‌افتد — یادآوری که هیچ‌وقت شلیک نکند بی‌معناست.
 */
export function normalizeLeads(raw: number[]): number[] {
  const clean = [...new Set(raw.filter((n) => VALID_LEADS.has(n)))].sort((a, b) => a - b);
  return clean.length > 0 ? clean : [0];
}

/**
 * زمانِ شلیکِ هر پیش‌آگاهی.
 * ⚠️ پیش‌آگاهی‌هایی که **در گذشته** می‌افتند کنار گذاشته می‌شوند — وگرنه ثبتِ
 * یادآور برای «۲۰ دقیقه دیگر» با گزینهٔ «۱ روز قبل» بلافاصله یک اعلانِ
 * بی‌موقع می‌فرستاد.
 */
export function fireTimes(targetAt: Date, leads: number[], now: Date): Date[] {
  return normalizeLeads(leads)
    .map((minutes) => new Date(targetAt.getTime() - minutes * 60_000))
    .filter((when) => when.getTime() > now.getTime())
    // ترتیبِ زمانی، نه ترتیبِ پیش‌آگاهی — «۱ روز قبل» زودتر از «سرِ موقع» شلیک می‌شود.
    .sort((a, b) => a.getTime() - b.getTime());
}

export type ReminderStatus = 'pending' | 'sending' | 'sent';

/** برچسبِ وضعیت — همان سه رشتهٔ نسخهٔ قبلی. */
export function statusLabel(status: ReminderStatus): string {
  if (status === 'sent') return 'ارسال‌شده';
  if (status === 'sending') return 'در حال ارسال…';
  return 'در انتظار';
}
