import { describe, expect, it } from 'vitest';
import { billableFromTags, effectiveRateOf, showsEquivalent } from './form-rules';

/** R-FORM-08 — روشن‌تر کردنِ مبلغ‌ها (۲.۲۴.۰). */
describe('showsEquivalent', () => {
  const base = { projectId: 1, entryCurrencyId: 1, settledCurrencyId: 1, hasSettled: false, pickedUnit: false };
  it('ارزِ مبلغ = ارزِ قرارداد: لازم نیست', () => {
    expect(showsEquivalent(base)).toBe(false);
  });
  it('ارزِ متفاوت: لازم است', () => {
    expect(showsEquivalent({ ...base, entryCurrencyId: 3 })).toBe(true);
  });
  it('بی‌پروژه هرگز؛ معادلِ موجود یا کارکردِ انتخاب‌شده همیشه', () => {
    expect(showsEquivalent({ ...base, projectId: null, entryCurrencyId: 3 })).toBe(false);
    expect(showsEquivalent({ ...base, hasSettled: true })).toBe(true);
    expect(showsEquivalent({ ...base, pickedUnit: true })).toBe(true);
  });
});

describe('effectiveRateOf', () => {
  it('۱۰۰ یورو و ۹٬۱۰۰٬۰۰۰ تومان = ۹۱٬۰۰۰', () => {
    expect(effectiveRateOf(100, 9_100_000)).toBe(91_000);
  });
  it('ورودیِ نامعتبر null', () => {
    expect(effectiveRateOf(0, 100)).toBeNull();
    expect(effectiveRateOf(100, 0)).toBeNull();
    expect(effectiveRateOf(Number.NaN, 5)).toBeNull();
  });
});

describe('billableFromTags', () => {
  const cats = [{ id: 1, billable: true }, { id: 2 }, { id: 3, billable: false }];
  it('فقط دستهٔ علامت‌خورده', () => {
    expect(billableFromTags([2, 3], cats)).toBe(false);
    expect(billableFromTags([2, 1], cats)).toBe(true);
    expect(billableFromTags([], cats)).toBe(false);
  });
});
