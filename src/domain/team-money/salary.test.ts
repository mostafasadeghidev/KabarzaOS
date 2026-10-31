import { describe, expect, it } from 'vitest';
import { addMonths, dueMonths, isOverdue, monthOf, monthsBetween, netOf, overlaps, parseOptional, parsePayDay, SalaryError } from './salary';

describe('حقوق — ماه‌ها', () => {
  it('ماه همیشه روزِ اول است و از مرزِ سال می‌گذرد', () => {
    expect(monthOf('2026-04-17')).toBe('2026-04-01');
    expect(monthOf('2026-04')).toBe('2026-04-01');
    expect(() => monthOf('2026-13')).toThrow(SalaryError);
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(monthsBetween('2026-11-01', '2027-02-01')).toHaveLength(4);
  });

  it('هم‌پوشانی — پایانِ خالی یعنی تا همیشه', () => {
    expect(overlaps({ startMonth: '2026-01-01', endMonth: '2026-04-01' }, { startMonth: '2026-05-01', endMonth: null })).toBe(false);
    expect(overlaps({ startMonth: '2026-01-01', endMonth: null }, { startMonth: '2027-05-01', endMonth: null })).toBe(true);
  });

  it('۴ ماه حقوق، ۵ ماه وقفه، ادامه — ماه‌های وقفه سررسید نمی‌شوند و ماهِ آینده هم نه', () => {
    const periods = [
      { id: 1, startMonth: '2026-01-01', endMonth: '2026-04-01', amount: '1000', currencyId: 1, payDay: 1 },
      { id: 2, startMonth: '2026-10-01', endMonth: null, amount: '1200', currencyId: 1, payDay: 1 },
    ];
    const due = dueMonths(periods, '2026-11-01').map((d) => `${d.month}:${d.period.id}`);
    expect(due).toEqual(['2026-01-01:1', '2026-02-01:1', '2026-03-01:1', '2026-04-01:1', '2026-10-01:2', '2026-11-01:2']);
  });

  it('عقب‌افتاده فقط بعد از روزِ پرداخت', () => {
    expect(isOverdue('2026-10-01', 15, '2026-10-15')).toBe(false);
    expect(isOverdue('2026-10-01', 15, '2026-10-16')).toBe(true);
  });
});

describe('حقوق — ورودی', () => {
  it('خالص و مبلغ‌های اختیاری', () => {
    expect(netOf('1000', '100', '50', '200')).toBe('850.0000');
    expect(parseOptional('')).toBe('0');
    expect(parseOptional('1,250.5')).toBe('1250.5');
    expect(() => parseOptional('-5')).toThrow(SalaryError);
    expect(parsePayDay('')).toBe(1);
    expect(() => parsePayDay('29')).toThrow(SalaryError);
  });
});
