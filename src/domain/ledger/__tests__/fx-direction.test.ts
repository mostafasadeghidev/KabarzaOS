import { describe, expect, it } from 'vitest';
import { rateFromAmounts, settledFromAmount } from '../form-rules';
import { trimRate } from '../../currency/rates';

/** جهتِ محاسبهٔ دوطرفهٔ نرخ — پورتِ JS ِ فرمِ حسابداری: مبلغ هرگز بازنویسی نمی‌شود. */
describe('نرخِ دوطرفه از مبلغ', () => {
  it('نرخ تایپ شد → معادل = مبلغ ÷ نرخ (گردِ شش رقم)', () => {
    expect(settledFromAmount(5200000, 52000)).toBe(100);
    expect(settledFromAmount(100, 3)).toBe(33.333333);
  });

  it('معادل تایپ شد → نرخ = مبلغ ÷ معادل', () => {
    expect(rateFromAmounts(5200000, 100)).toBe(52000);
  });

  it('⚠️ ورودیِ خالی/صفر هیچ‌چیز را بازنویسی نمی‌کند', () => {
    expect(settledFromAmount(0, 52000)).toBeNull();
    expect(settledFromAmount(100, 0)).toBeNull();
    expect(settledFromAmount(Number(''), 2)).toBeNull();
    expect(settledFromAmount(Number.NaN, 2)).toBeNull();
  });
});

describe('نمایشِ نرخ بدونِ صفرهای دنباله', () => {
  it('پورتِ rtrim(rtrim($r, "0"), ".")', () => {
    expect(trimRate('0.90000000')).toBe('0.9');
    expect(trimRate('52000.00000000')).toBe('52000');
    expect(trimRate('1')).toBe('1');
    expect(trimRate('0.00002000')).toBe('0.00002');
    expect(trimRate('0.00000000')).toBe('0');
  });
});
