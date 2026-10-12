import { describe, it, expect } from 'vitest';
import { daysBetween, deductionFromRate, grossFromNet, rateOnDate, splitByDeduction, type DatedRate } from '../form-rules';

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

describe('grossFromNet — هزینهٔ انتقالِ به عهدهٔ عضو', () => {
  it('Jureasy: ۹۸٫۴ یوروی رسیده با ۱۸٪ ← ۱۲۰ از طلب', () => {
    expect(grossFromNet(98.4, 18)).toBe(120);
  });
  it('بی‌هزینه یا درصدِ نامعتبر = همان خالص', () => {
    expect(grossFromNet(98.4, 0)).toBe(98.4);
    expect(grossFromNet(98.4, 100)).toBe(98.4);
    expect(grossFromNet(0, 18)).toBeNull();
  });
});

describe('splitByDeduction — یک واریز، یوروی هر پروژه', () => {
  it('بی‌هزینه: ۲۰ میلیون برای ۲۰۰/۱۲۰/۸۰ یورو ← نرخِ ۵۰٬۰۰۰ و سهم‌های دقیق', () => {
    const r = splitByDeduction(20_000_000, [
      { deduction: 200, feePct: 0 }, { deduction: 120, feePct: 0 }, { deduction: 80, feePct: 0 },
    ]);
    expect(r.rate).toBe(50000);
    expect(r.shares).toEqual([10_000_000, 6_000_000, 4_000_000]);
  });

  it('با ۱۸٪: نرخ از یوروی رسیده (۳۲۸) درمی‌آید، نه از کسر (۴۰۰)', () => {
    const r = splitByDeduction(20_000_000, [
      { deduction: 200, feePct: 18 }, { deduction: 120, feePct: 18 }, { deduction: 80, feePct: 18 },
    ]);
    expect(r.nets).toEqual([164, 98.4, 65.6]);
    expect(r.rate).toBeCloseTo(60975.609756, 4);
    expect(r.shares.reduce((s, x) => s + x, 0)).toBeCloseTo(20_000_000, 2);
  });

  it('درصدِ جدا برای یک پروژه و جمعِ همیشه دقیق', () => {
    const r = splitByDeduction(10_000_001, [{ deduction: 100, feePct: 18 }, { deduction: 100, feePct: 0 }]);
    expect(r.nets).toEqual([82, 100]);
    expect(r.shares[0]! + r.shares[1]!).toBeCloseTo(10_000_001, 2);
  });

  it('نرخِ دستی: سهم = رسیده × نرخ، بی‌دست‌کاریِ آخری', () => {
    const r = splitByDeduction(20_000_000, [{ deduction: 200, feePct: 0 }, { deduction: 100, feePct: 0 }], 60000);
    expect(r.shares).toEqual([12_000_000, 6_000_000]);
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
