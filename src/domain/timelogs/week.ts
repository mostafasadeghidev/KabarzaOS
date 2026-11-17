import { shiftDays, weekRange } from '@/domain/reports/filters';

/**
 * «هفتهٔ من» روی داشبوردِ عضو (۳.۹.۰) — هفت روزِ هفتهٔ جاری از روزِ شروعِ تنظیمات
 * (همان `weekRange` ِ گزارش‌ها و جمعِ «این هفته»، تا عددها با هم بخوانند).
 */
export interface WeekDay {
  /** YYYY-MM-DD */
  date: string;
  minutes: number;
  today: boolean;
  /** روزی که هنوز نرسیده — ستونش کم‌رنگ است، نه «صفر ساعت کار». */
  future: boolean;
}

/** هفت تاریخِ هفتهٔ جاری، از روزِ شروع. */
export function weekDates(today: string, weekStart: number): string[] {
  const { from } = weekRange(today, weekStart);
  return Array.from({ length: 7 }, (_, i) => shiftDays(from, i));
}

/** دقیقه‌های هر روز (از پایگاه‌داده) ← هفت ستون، با جمعِ امروز و هفته. */
export function buildWeek(
  today: string,
  weekStart: number,
  minutesByDate: ReadonlyMap<string, number>,
): { days: WeekDay[]; todayMinutes: number; weekMinutes: number } {
  const days = weekDates(today, weekStart).map((date) => ({
    date,
    minutes: minutesByDate.get(date) ?? 0,
    today: date === today,
    future: date > today,
  }));
  return {
    days,
    todayMinutes: minutesByDate.get(today) ?? 0,
    weekMinutes: days.reduce((sum, d) => sum + (d.future ? 0 : d.minutes), 0),
  };
}

/** ۵۴۵ ← «9:05» — عددِ ساعت:دقیقه، همان شکلِ تایمرها. */
export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
