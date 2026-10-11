import { describe, it, expect } from 'vitest';
import { daysBetween, deductionFromRate, rateOnDate, type DatedRate } from '../form-rules';

const EUR = 1, IRR = 2, USD = 3;

const rates: DatedRate[] = [
  { from: EUR, to: IRR, rate: '20000', date: '2026-10-10' },
  { from: EUR, to: IRR, rate: '19000', date: '2026-10-05' },
  { from: IRR, to: USD, rate: '0.00005', date: '2026-10-01' },
];

describe('rateOnDate — نرخِ روزِ پرداخت، نه آخرین نرخ (۲.۲۵.۰)', () => {
  it('پرداختِ ۸ اکتبر که دیرتر ثبت شود نرخِ ۵ اکتبر را می‌گیرد', () => {
    expect(rateOnDate(rates, EUR, IRR, '2026-10-08')).toEqual({ rate: 19000, date: '2026-10-05' });
  });

  it('همان روز، همان نرخ', () => {
    expect(rateOnDate(rates, EUR, IRR, '2026-10-10')).toEqual({ rate: 20000, date: '2026-10-10' });
  });

  it('نرخِ بعد از تاریخِ پرداخت هرگز برداشته نمی‌شود', () => {
    expect(rateOnDate(rates, EUR, IRR, '2026-10-01')).toBeNull();
  });

  it('جفتِ معکوس هم خوانده می‌شود', () => {
    expect(rateOnDate(rates, USD, IRR, '2026-10-02')).toEqual({ rate: 20000, date: '2026-10-01' });
  });

  it('ارزِ یکسان یا خالی نرخ نمی‌خواهد', () => {
    expect(rateOnDate(rates, EUR, EUR, '2026-10-10')).toBeNull();
    expect(rateOnDate(rates, null, IRR, '2026-10-10')).toBeNull();
  });

  it('در همان روز جفتِ مستقیم بر معکوس مقدم است', () => {
    const both: DatedRate[] = [
      { from: IRR, to: EUR, rate: '0.0001', date: '2026-10-10' },
      { from: EUR, to: IRR, rate: '20000', date: '2026-10-10' },
    ];
    expect(rateOnDate(both, EUR, IRR, '2026-10-10')?.rate).toBe(20000);
  });
});

describe('deductionFromRate و daysBetween', () => {
  it('۲ میلیون با نرخِ ۱۹٬۰۰۰ = ۱۰۵٫۲۶ یورو (دو رقم)', () => {
    expect(deductionFromRate(2_000_000, 19_000)).toBe(105.26);
  });

  it('ورودیِ نامعتبر null', () => {
    expect(deductionFromRate(0, 19_000)).toBeNull();
    expect(deductionFromRate(100, 0)).toBeNull();
  });

  it('فاصلهٔ روزها', () => {
    expect(daysBetween('2026-10-05', '2026-10-08')).toBe(3);
    expect(daysBetween('2026-10-08', '2026-10-08')).toBe(0);
  });
});
