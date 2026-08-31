import { describe, it, expect } from 'vitest';
import { deadlineBar, deadlineLabel, taskProgress } from './deadline';

describe('نوارِ ددلاینِ کارت', () => {
  it('بدونِ ددلاین نواری نیست', () => {
    expect(deadlineBar(null, '2026-08-01', '2026-08-27')).toBeNull();
  });

  it('نیمهٔ راه ≈ ۵۰٪', () => {
    const bar = deadlineBar('2026-09-01', '2026-08-01', '2026-08-16')!;
    expect(bar.percent).toBe(48);
    expect(bar.daysLeft).toBe(16);
  });

  it('پله‌های رنگ دقیقاً مثلِ نسخهٔ قبلی', () => {
    expect(deadlineBar('2026-09-30', '2026-08-01', '2026-08-27')!.urgency).toBe('normal'); // ۳۴ روز
    expect(deadlineBar('2026-09-06', '2026-08-01', '2026-08-27')!.urgency).toBe('warn'); // ۱۰ روز
    expect(deadlineBar('2026-08-31', '2026-08-01', '2026-08-27')!.urgency).toBe('soon'); // ۴ روز
    expect(deadlineBar('2026-08-20', '2026-08-01', '2026-08-27')!.urgency).toBe('over');
  });

  it('مرزهای ۱۴ و ۷ روز', () => {
    // نسخهٔ قبلی: ≤۷ «نزدیک» · ۸.۱۴ «هشدار» · >۱۴ «عادی».
    expect(deadlineBar('2026-09-11', null, '2026-08-27')!.urgency).toBe('normal'); // ۱۵ روز
    expect(deadlineBar('2026-09-10', null, '2026-08-27')!.urgency).toBe('warn'); // ۱۴ روز
    expect(deadlineBar('2026-09-04', null, '2026-08-27')!.urgency).toBe('warn'); // ۸ روز
    expect(deadlineBar('2026-09-03', null, '2026-08-27')!.urgency).toBe('soon'); // ۷ روز
  });

  it('امروز = «نزدیک» و برچسبِ ویژه', () => {
    const bar = deadlineBar('2026-08-27', '2026-08-01', '2026-08-27')!;
    expect(bar.daysLeft).toBe(0);
    expect(bar.urgency).toBe('soon');
    expect(deadlineLabel(0)).toBe('امروز');
  });

  it('⚠️ ددلاینِ گذشته همیشه نوارِ پر دارد', () => {
    // وگرنه نوارِ نیمه‌پر می‌داد و کاربر خیال می‌کرد هنوز وقت هست.
    const bar = deadlineBar('2026-08-20', '2026-08-01', '2026-08-27')!;
    expect(bar.percent).toBe(100);
    expect(bar.daysLeft).toBe(-7);
    expect(deadlineLabel(-7)).toBe('7 روز گذشته');
  });

  it('⚠️ بدونِ تاریخِ ثبت، پنجرهٔ ۳۰ روزه فرض می‌شود', () => {
    // نه صفر و نه صد — نوار باید همچنان معنا داشته باشد.
    // پنجره: ۰۲-۰۸ تا ۰۱-۰۹ · امروز ۱۷-۰۸ → ۱۵ از ۳۰ روز.
    const bar = deadlineBar('2026-09-01', null, '2026-08-17')!;
    expect(bar.percent).toBe(50);
  });

  it('⚠️ تاریخِ ثبتِ بعد از ددلاین هم به همان پنجرهٔ ۳۰ روزه می‌افتد', () => {
    const bar = deadlineBar('2026-09-01', '2026-12-01', '2026-08-17')!;
    expect(bar.percent).toBe(50);
  });

  it('درصد هرگز از بازهٔ ۰ تا ۱۰۰ بیرون نمی‌زند', () => {
    const early = deadlineBar('2026-09-01', '2026-08-01', '2026-07-01')!;
    expect(early.percent).toBe(0);
  });
});

describe('درصدِ پیشرفتِ تسک‌ها', () => {
  it('بدونِ تسک صفر است، نه NaN', () => {
    expect(taskProgress(0, 0)).toBe(0);
  });

  it('گرد می‌شود', () => {
    expect(taskProgress(1, 3)).toBe(33);
    expect(taskProgress(2, 3)).toBe(67);
    expect(taskProgress(3, 3)).toBe(100);
  });
});
