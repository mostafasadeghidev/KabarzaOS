import { describe, expect, it } from 'vitest';
import { buildWeek, hhmm, weekDates } from '../week';

describe('«هفتهٔ من» — هفت روزِ هفتهٔ جاری', () => {
  // ۲۰۲۶-۱۱-۱۷ سه‌شنبه است؛ هفتهٔ ایرانی از شنبه (۰) شروع می‌شود.
  it('از روزِ شروعِ تنظیمات شروع می‌شود و هفت روز است', () => {
    const d = weekDates('2026-11-17', 0);
    expect(d).toHaveLength(7);
    expect(d[0]).toBe('2026-11-14'); // شنبه
    expect(d[6]).toBe('2026-11-20'); // جمعه
  });

  it('روزِ شروعِ دیگر (دوشنبه = ۲) هم درست است', () => {
    expect(weekDates('2026-11-17', 2)[0]).toBe('2026-11-16');
  });

  it('امروز، روزهای آینده و جمع‌ها', () => {
    const w = buildWeek('2026-11-17', 0, new Map([
      ['2026-11-14', 120], ['2026-11-17', 45], ['2026-11-13', 999], // روزِ پیش از هفته حساب نمی‌شود
    ]));
    expect(w.todayMinutes).toBe(45);
    expect(w.weekMinutes).toBe(165);
    expect(w.days.find((d) => d.today)?.date).toBe('2026-11-17');
    expect(w.days.filter((d) => d.future).map((d) => d.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
  });

  it('ساعت:دقیقه', () => {
    expect(hhmm(0)).toBe('0:00');
    expect(hhmm(545)).toBe('9:05');
    expect(hhmm(-3)).toBe('0:00');
  });
});
