import { describe, it, expect } from 'vitest';
import { findRate, hasRate, convert, effectiveRate, type RateRow, type RateSource } from './rates';

const EUR = 1, IRT = 2, USD = 3;

/** منبعِ نرخِ درون‌حافظه‌ای برای تست. */
function source(rows: RateRow[]): RateSource {
  return {
    find: (from, to) =>
      rows.filter((r) => r.fromCurrencyId === from && r.toCurrencyId === to)
        .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0] ?? null,
  };
}

const eurToIrt: RateRow = { fromCurrencyId: EUR, toCurrencyId: IRT, rate: '1000000', effectiveDate: '2026-01-01' };

describe('R-MONEY-05 — مستقیم، بعد معکوس', () => {
  it('نرخِ مستقیم پیدا می‌شود', () => {
    expect(findRate(source([eurToIrt]), EUR, IRT)).toBe('1000000');
  });

  it('نرخِ معکوس محاسبه می‌شود وقتی فقط یک جهت ذخیره شده', () => {
    expect(findRate(source([eurToIrt]), IRT, EUR)).toBe('0.000001');
  });

  it('جدیدترین تاریخ برنده است', () => {
    const rows = [
      eurToIrt,
      { fromCurrencyId: EUR, toCurrencyId: IRT, rate: '1200000', effectiveDate: '2026-06-01' },
    ];
    expect(findRate(source(rows), EUR, IRT)).toBe('1200000');
  });
});

describe('R-MONEY-06 — ⚠️ نرخِ ناموجود null است، نه ۱ (اصلاحِ ضدالگوی نسخهٔ قبلی)', () => {
  it('جفتِ بدونِ نرخ null برمی‌گرداند', () => {
    expect(findRate(source([eurToIrt]), EUR, USD)).toBeNull();
  });

  it('در نسخهٔ قبلی اینجا ۱ برمی‌گشت و ۱۰۰ یورو = ۱۰۰ دلار نمایش داده می‌شد', () => {
    const rate = findRate(source([]), EUR, USD);
    expect(rate).not.toBe('1');
    expect(rate).toBeNull();
  });

  it('hasRate تفاوت را روشن می‌کند', () => {
    const s = source([eurToIrt]);
    expect(hasRate(s, EUR, IRT)).toBe(true);
    expect(hasRate(s, EUR, USD)).toBe(false);
  });

  it('convert بدونِ نرخ null می‌دهد تا رقمِ گمراه‌کننده منتشر نشود', () => {
    expect(convert(source([]), '100', EUR, USD)).toBeNull();
  });
});

describe('R-MONEY-07 — ارزِ یکسان', () => {
  it('نرخِ ۱ و بدونِ نیاز به منبع', () => {
    expect(findRate(source([]), EUR, EUR)).toBe('1');
  });

  it('تبدیل مبلغ را دست‌نخورده برمی‌گرداند', () => {
    expect(convert(source([]), '250.75', EUR, EUR)).toBe('250.75');
  });

  it('ارزِ صفر/نامعتبر null است', () => {
    expect(findRate(source([]), 0, EUR)).toBeNull();
  });
});

describe('تبدیل با دقتِ decimal', () => {
  it('یورو به تومان بدونِ خطای شناور', () => {
    expect(convert(source([eurToIrt]), '2.5', EUR, IRT)).toBe('2500000.0');
  });

  it('تبدیلِ معکوس', () => {
    expect(convert(source([eurToIrt]), '1000000', IRT, EUR)).toBe('1.000000');
  });
});

describe('R-LEDGER-03 — نرخِ واقعی از مبلغِ رسیده، نه نرخِ بازار', () => {
  it('کارمزدِ انتقال در نرخِ ذخیره‌شده منعکس می‌شود', () => {
    // ۱۰۰ یورو خارج شد، ۹۵٬۰۰۰٬۰۰۰ تومان رسید (نرخِ بازار ۱٬۰۰۰٬۰۰۰ بود)
    expect(effectiveRate('100', '95000000')).toBe('950000');
  });

  it('بدونِ اختلاف، نرخ همان می‌ماند', () => {
    expect(effectiveRate('100', '100')).toBe('1');
  });

  it('مبلغِ صفر امن است', () => {
    expect(effectiveRate('0', '0')).toBe('1');
  });
});
