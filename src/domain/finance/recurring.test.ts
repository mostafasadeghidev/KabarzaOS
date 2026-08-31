import { describe, it, expect } from 'vitest';
import {
  computeNext, dueBucket, normalizeUnit, planPay, RecurringPayError,
} from './recurring';

describe('سررسیدِ بعدی', () => {
  it('روز و هفته ساده جلو می‌روند', () => {
    expect(computeNext('2026-08-27', 'day', 5)).toBe('2026-09-01');
    expect(computeNext('2026-08-27', 'week', 2)).toBe('2026-09-10');
  });

  it('ماه و سال', () => {
    expect(computeNext('2026-08-15', 'month', 1)).toBe('2026-09-15');
    expect(computeNext('2026-08-15', 'month', 6)).toBe('2027-02-15');
    expect(computeNext('2026-08-15', 'year', 1)).toBe('2027-08-15');
  });

  it('⚠️ سررسیدِ «۳۱ هر ماه» در ماهِ کوتاه نمی‌پرد', () => {
    // ۳۱ ژانویه + ۱ ماه در حسابِ ساده می‌شد ۳ مارس.
    expect(computeNext('2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(computeNext('2026-03-31', 'month', 1)).toBe('2026-04-30');
  });

  it('سالِ کبیسه درست حساب می‌شود', () => {
    expect(computeNext('2028-01-31', 'month', 1)).toBe('2028-02-29');
  });

  it('شمارشِ صفر یا منفی به یک می‌افتد', () => {
    expect(computeNext('2026-08-15', 'month', 0)).toBe('2026-09-15');
    expect(computeNext('2026-08-15', 'month', -3)).toBe('2026-09-15');
  });

  it('واحدِ ناشناخته به «ماهانه» می‌افتد', () => {
    expect(normalizeUnit('bogus')).toBe('month');
    expect(normalizeUnit('week')).toBe('week');
  });
});

describe('پرداختِ هزینه', () => {
  const expense = {
    kind: 'recurring' as const,
    nextDueDate: '2026-09-01',
    intervalUnit: 'month' as const,
    intervalCount: 1,
    accountId: 3,
  };

  it('هزینهٔ دوره‌ای سررسیدش جلو می‌رود', () => {
    const plan = planPay(expense, '2026-09-01');
    expect(plan.bookLedger).toBe(true);
    expect(plan.after).toEqual({ type: 'reschedule', nextDueDate: '2026-10-01' });
  });

  it('⚠️ هزینهٔ یک‌بار بسته می‌شود، نه اینکه سررسیدش جلو برود', () => {
    const plan = planPay({ ...expense, kind: 'once' }, '2026-09-01');
    expect(plan.after).toEqual({ type: 'deactivate' });
  });

  it('بدونِ حسابِ پرداخت، ردیفِ دفتر نوشته نمی‌شود', () => {
    const plan = planPay({ ...expense, accountId: null }, '2026-09-01');
    expect(plan.bookLedger).toBe(false);
    // ولی سررسید همچنان جلو می‌رود.
    expect(plan.after.type).toBe('reschedule');
  });

  it('⚠️ کلیکِ دوباره ردیفِ تکراری نمی‌سازد', () => {
    // لینک تاریخِ سررسیدی را که کاربر دیده با خود می‌برد؛ اگر زمان‌بندی
    // گذشته باشد یعنی این نوبت قبلاً پرداخت شده.
    expect(() => planPay(expense, '2026-08-01')).toThrow(RecurringPayError);
  });

  it('بدونِ تاریخِ انتظار، بررسیِ تکرار انجام نمی‌شود', () => {
    expect(() => planPay(expense, null)).not.toThrow();
  });
});

describe('سطلِ سررسید', () => {
  const today = '2026-08-27';

  it('سررسیدِ گذشته معوق است', () => {
    expect(dueBucket('2026-08-26', today)).toBe('overdue');
  });

  it('امروز و تا هفت روز آینده', () => {
    expect(dueBucket('2026-08-27', today)).toBe('week');
    expect(dueBucket('2026-09-03', today)).toBe('week');
  });

  it('مرزها دقیق‌اند', () => {
    expect(dueBucket('2026-09-04', today)).toBe('month');      // ۸ روز
    expect(dueBucket('2026-09-26', today)).toBe('month');      // ۳۰ روز
    expect(dueBucket('2026-09-27', today)).toBe('next_month'); // ۳۱ روز
    expect(dueBucket('2026-10-26', today)).toBe('next_month'); // ۶۰ روز
    expect(dueBucket('2026-10-27', today)).toBe('later');      // ۶۱ روز
  });
});
