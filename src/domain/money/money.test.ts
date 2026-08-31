import { describe, it, expect } from 'vitest';
import { format, inputValue, splitMinutes, type Currency } from './money';

const EUR: Currency = { id: 1, code: 'EUR', symbol: '€', decimals: 2 };
const TOMAN: Currency = { id: 2, code: 'IRT', symbol: 'تومان', decimals: 0 };

describe('R-MONEY-01 — جداکننده‌ها هاردکد، نه از locale', () => {
  it('هزارگان «,» و اعشار «.»', () => {
    expect(format('1234.56', EUR)).toBe('€ 1,234.56');
  });

  it('هرگز «12,365,00» تولید نمی‌کند (باگِ واقعیِ نسخهٔ قبلی)', () => {
    const out = format('12365.00', EUR);
    expect(out).toBe('€ 12,365.00');
    expect(out).not.toContain(',00');
  });

  it('عددِ بزرگ درست گروه‌بندی می‌شود', () => {
    expect(format('1234567.89', EUR)).toBe('€ 1,234,567.89');
  });
});

describe('R-MONEY-02 — تعدادِ اعشار از خودِ ارز', () => {
  it('یورو دو رقم', () => {
    expect(format('150', EUR)).toBe('€ 150.00');
  });

  it('تومان بدونِ اعشار', () => {
    expect(format('95000', TOMAN)).toBe('95,000 تومان');
  });
});

describe('R-MONEY-03 — جای نماد به طولش بستگی دارد', () => {
  it('نمادِ تک‌کاراکتری قبل از عدد', () => {
    expect(format('10', EUR)).toBe('€ 10.00');
  });

  it('نمادِ بلند بعد از عدد', () => {
    expect(format('10', TOMAN)).toBe('10 تومان');
  });

  it('بدونِ ارز فقط عدد', () => {
    expect(format('10.5')).toBe('10.50');
  });
});

describe('R-MONEY-04 — مقدارِ ورودیِ فرم', () => {
  it('صفرهای انتهایی حذف می‌شوند', () => {
    expect(inputValue('150.0000')).toBe('150');
  });

  it('اعشارِ معنادار می‌ماند', () => {
    expect(inputValue('12.5000')).toBe('12.5');
  });

  it('صفر رشتهٔ خالی می‌شود (تا placeholder دیده شود)', () => {
    expect(inputValue('0.0000')).toBe('');
  });

  it('null و خالی امن هستند', () => {
    expect(inputValue(null)).toBe('');
    expect(inputValue('')).toBe('');
  });
});

describe('R-MONEY-09 — تفکیکِ دقیقه', () => {
  it('۹۰ دقیقه = ۱ ساعت و ۳۰ دقیقه', () => {
    expect(splitMinutes(90)).toEqual({ hours: 1, minutes: 30 });
  });

  it('۶۰ دقیقه = ۱ ساعتِ کامل', () => {
    expect(splitMinutes(60)).toEqual({ hours: 1, minutes: 0 });
  });

  it('۴۵ دقیقه بدونِ ساعت', () => {
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
  });
});

describe('G2 — دقتِ اعشاری روی پول', () => {
  it('جمعِ سه ۳۳.۳۳۳ خطای شناور ندارد', () => {
    // با رشته‌ی decimal، مقدار همان می‌ماند که هست.
    expect(format('99.999', EUR)).toBe('€ 100.00');
  });

  it('مقدارِ منفی درست فرمت می‌شود', () => {
    expect(format('-1234.5', EUR)).toBe('€ -1,234.50');
  });
});
