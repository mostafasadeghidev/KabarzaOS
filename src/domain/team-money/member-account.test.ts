import { describe, expect, it } from 'vitest';
import {
  assertWithinBalance, balancesByCurrency, debtSign, giftsByCurrency, MemberAccountError, parseAmount, parseShare, shareOf,
} from './member-account';

describe('حسابِ اعضا — مانده', () => {
  const rows = [
    { kind: 'loan' as const, amount: '500', currencyId: 1 },
    { kind: 'charge' as const, amount: '30', currencyId: 1 },
    { kind: 'gift' as const, amount: '100', currencyId: 1 },
    { kind: 'repayment' as const, amount: '200', currencyId: 1 },
    { kind: 'offset' as const, amount: '100', currencyId: 1 },
    { kind: 'forgive' as const, amount: '30', currencyId: 1 },
    { kind: 'loan' as const, amount: '1000000', currencyId: 2 },
  ];

  it('بدهی = قرض + هزینه − تسویه‌ها؛ هدیه بی‌اثر است', () => {
    expect(debtSign('gift')).toBe(0);
    const b = balancesByCurrency(rows);
    expect(b.get(1)).toBe(200);
    expect(b.get(2)).toBe(1000000);
  });

  it('هدیه و بخشیده با هم جمع می‌شوند', () => {
    expect(giftsByCurrency(rows).get(1)).toBe(130);
    expect(giftsByCurrency(rows).has(2)).toBe(false);
  });

  it('تسویه از بدهی بیشتر نمی‌شود (رواداریِ نیم‌سنت)', () => {
    expect(() => assertWithinBalance(200, '200.004')).not.toThrow();
    expect(() => assertWithinBalance(200, '200.01')).toThrow(MemberAccountError);
  });
});

describe('حسابِ اعضا — ورودی', () => {
  it('سهمِ عضو', () => {
    expect(shareOf('40', '50')).toBe('20.0000');
    expect(shareOf('33.33', 100)).toBe('33.3300');
  });

  it('مبلغ مثبت با حداکثر چهار رقمِ اعشار؛ ویرگولِ هزارگان پذیرفته می‌شود', () => {
    expect(parseAmount('1,200.5')).toBe('1200.5');
    expect(() => parseAmount('0')).toThrow(MemberAccountError);
    expect(() => parseAmount('-3')).toThrow(MemberAccountError);
    expect(() => parseAmount('1.23456')).toThrow(MemberAccountError);
  });

  it('درصد: خالی یعنی ۱۰۰؛ بیرون از ۱ تا ۱۰۰ رد می‌شود', () => {
    expect(parseShare('')).toBe('100');
    expect(parseShare('50')).toBe('50');
    expect(() => parseShare('0')).toThrow(MemberAccountError);
    expect(() => parseShare('120')).toThrow(MemberAccountError);
  });
});
