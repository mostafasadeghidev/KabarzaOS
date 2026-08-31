import { describe, it, expect } from 'vitest';
import {
  hoursLabel, isReportableExpense, isReportableIncome, overallSummary, sumReportable,
} from './summary';

const base = {
  totalValue: '10000', billableExpenses: '500', clientPaid: '4000',
  memberAgreed: '3000', memberPaid: '1000', projectCount: 5, minutes: 750,
};

describe('خلاصهٔ کلی', () => {
  it('⚠️ هزینه‌های قابلِ صورت‌حساب به بدهیِ کارفرما اضافه می‌شوند', () => {
    // کارفرما هم بابتِ قیمت بدهکار است هم بابتِ هزینه‌ای که برایش خرج شده.
    const s = overallSummary(base);
    expect(s.clientDue).toBe('6500.00'); // ۱۰۰۰۰ + ۵۰۰ − ۴۰۰۰
  });

  it('بدهیِ عضو از توافقی منهای پرداختی است', () => {
    expect(overallSummary(base).memberDebt).toBe('2000.00');
  });

  it('⚠️ بدهی هرگز منفی نمی‌شود', () => {
    // پیش‌پرداختِ بیش از قیمت نباید بدهیِ پروژه‌های دیگر را بخورد.
    const s = overallSummary({ ...base, clientPaid: '99999' });
    expect(s.clientDue).toBe('0.00');
    const m = overallSummary({ ...base, memberPaid: '99999' });
    expect(m.memberDebt).toBe('0.00');
  });

  it('ورودیِ خالی صفر می‌دهد، نه NaN', () => {
    const s = overallSummary({
      totalValue: '', billableExpenses: '', clientPaid: '',
      memberAgreed: '', memberPaid: '', projectCount: 0, minutes: 0,
    });
    expect(s.clientDue).toBe('0.00');
    expect(s.totalValue).toBe('0.00');
  });
});

describe('⚠️ R-LEDGER-06 — انتقالِ داخلی در گزارش شمرده نمی‌شود', () => {
  const rows = [
    { direction: 'out', transferGroup: null, amountEur: '800' },
    { direction: 'out', transferGroup: 'tr-1', amountEur: '1000' }, // انتقال
    { direction: 'in', transferGroup: 'tr-1', amountEur: '1000' },  // لِگِ دومِ همان انتقال
    { direction: 'in', transferGroup: null, amountEur: '5000' },
  ];

  it('هزینه‌ها فقط ردیف‌های غیرِ انتقالی را می‌شمارند', () => {
    // وگرنه انتقالِ بینِ دو حسابِ خودمان، هزینه‌ها را دوبرابرِ واقعیت نشان می‌داد.
    expect(sumReportable(rows, 'out')).toBe('800.00');
  });

  it('درآمد هم همین‌طور', () => {
    expect(sumReportable(rows, 'in')).toBe('5000.00');
  });

  it('پرچمِ تکیِ ردیف', () => {
    expect(isReportableExpense({ direction: 'out', transferGroup: null })).toBe(true);
    expect(isReportableExpense({ direction: 'out', transferGroup: 'tr-1' })).toBe(false);
    expect(isReportableExpense({ direction: 'in', transferGroup: null })).toBe(false);
    expect(isReportableIncome({ direction: 'in', transferGroup: null })).toBe(true);
  });

  it('رشتهٔ خالی هم انتقال حساب نمی‌شود', () => {
    expect(isReportableExpense({ direction: 'out', transferGroup: '' })).toBe(true);
  });
});

describe('برچسبِ ساعت', () => {
  it('دقیقه به ساعت:دقیقه', () => {
    expect(hoursLabel(750)).toBe('12:30');
    expect(hoursLabel(60)).toBe('1:00');
    expect(hoursLabel(5)).toBe('0:05');
    expect(hoursLabel(0)).toBe('0:00');
  });
});
