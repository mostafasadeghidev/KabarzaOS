import { describe, expect, it } from 'vitest';
import {
  expensePresets, expenseRange, hoursPresets, hoursRange, isPresetActive, monthlyAverage,
  parseDate, parseIds, rangeLabel, reportQuery, weekRange, withBars,
} from '../filters';

describe('فیلترهای گزارش — پورتِ office_ids_req / hours_week_range', () => {
  it('شناسه‌های دفتر: تکراری، کاما، صفر و ناعدد', () => {
    expect(parseIds(['1', '2', '2', 'x', '0'])).toEqual([1, 2]);
    expect(parseIds('3,4')).toEqual([3, 4]);
    expect(parseIds(undefined)).toEqual([]);
  });

  it('تاریخ فقط YYYY-MM-DD ِ معتبر', () => {
    expect(parseDate('2026-09-02')).toBe('2026-09-02');
    expect(parseDate('2026-13-40')).toBeNull();
    expect(parseDate('2026-09-02T10:00')).toBe('2026-09-02');
    expect(parseDate(7)).toBeNull();
  });

  it('⚠️ هفته از روزِ شروعِ تنظیمات: چهارشنبه ۲ سپتامبر با شنبه‌آغاز → ۲۹ اوت، با یکشنبه‌آغاز → ۳۰ اوت', () => {
    expect(weekRange('2026-09-02', 0)).toEqual({ from: '2026-08-29', to: '2026-09-02' });
    expect(weekRange('2026-09-02', 1)).toEqual({ from: '2026-08-30', to: '2026-09-02' });
    // دوشنبه‌آغاز (شاخصِ ایرانیِ ۲): دوشنبه ۳۱ اوت.
    expect(weekRange('2026-09-02', 2)).toEqual({ from: '2026-08-31', to: '2026-09-02' });
    expect(weekRange('2026-09-02', 9).from).toBe('2026-08-29');
  });

  it('بازهٔ هزینه‌ها: بی‌پارامتر = این ماه؛ یک سرِ باز مجاز', () => {
    expect(expenseRange({}, '2026-09-02')).toEqual({ from: '2026-09-01', to: '2026-09-02' });
    expect(expenseRange({ from: '2026-01-01' }, '2026-09-02')).toEqual({ from: '2026-01-01', to: '' });
    expect(expenseRange({ from: 'bad', to: 'bad' }, '2026-09-02')).toEqual({ from: '2026-09-01', to: '2026-09-02' });
  });

  it('بازهٔ ساعت: بی‌پارامتر = این هفته؛ حاضر ولی خالی = کل دوره', () => {
    expect(hoursRange({}, '2026-09-02', 0)).toEqual({ from: '2026-08-29', to: '2026-09-02', allTime: false });
    expect(hoursRange({ from: '', to: '' }, '2026-09-02', 0)).toEqual({ from: '', to: '', allTime: true });
    expect(hoursRange({ from: '2026-08-01', to: '2026-08-31' }, '2026-09-02', 0).allTime).toBe(false);
  });

  it('پیش‌تنظیم‌ها و فعال‌بودنشان', () => {
    const e = expensePresets('2026-09-02');
    expect(e.map((p) => [p.key, p.from, p.to])).toEqual([
      ['month', '2026-09-01', '2026-09-02'], ['year', '2026-01-01', '2026-09-02'],
    ]);
    const h = hoursPresets('2026-09-02', 0, true);
    expect(h.map((p) => p.key)).toEqual(['week', 'month', 'all']);
    expect(isPresetActive(h[0]!, { from: '2026-08-29', to: '2026-09-02' })).toBe(true);
    expect(isPresetActive(h[2]!, { from: '', to: '' })).toBe(true);
  });

  it('میانگینِ ماهانه از ماه‌های دارای داده؛ نوارِ روند نسبت به پرترین ماه', () => {
    expect(monthlyAverage(300, 3)).toBe(100);
    expect(monthlyAverage(300, 0)).toBe(0);
    expect(withBars([{ ym: '2026-09', amount: 50 }, { ym: '2026-08', amount: 200 }]).map((r) => r.pct)).toEqual([25, 100]);
    expect(withBars([]).length).toBe(0);
  });

  it('پرس‌وجوی صفحه: دفترِ تکراری، «کل دوره» با پارامترِ خالی', () => {
    expect(reportQuery({ tab: 'members', office: [1, 2] })).toBe('tab=members&office=1&office=2');
    expect(reportQuery({ tab: 'hours', hoursAllTime: true })).toBe('tab=hours&hfrom=&hto=');
    expect(reportQuery({ tab: 'expenses', from: '2026-09-01', to: '' })).toBe('tab=expenses&from=2026-09-01');
  });

  it('برچسبِ بازه', () => {
    const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}|${p.from}|${p.to}` : k);
    expect(rangeLabel({ from: '', to: '' }, t)).toBe('کل دوره');
    expect(rangeLabel({ from: '2026-08-01', to: '' }, t)).toBe('از {from} تا {to}|2026-08-01|—');
  });
});
