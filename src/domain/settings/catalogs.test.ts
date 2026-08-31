import { describe, it, expect } from 'vitest';
import {
  assertCurrencyDeletable, assertName, assertRateValid, assertTagDeletable,
  catalogMessage, CatalogError, planSetDefaultCurrency,
} from './catalogs';

describe('R-SET-01 — حذفِ ارز', () => {
  it('⚠️ ارزِ پیش‌فرض حذف نمی‌شود', () => {
    // پایهٔ گزارشِ بین‌ارزی است؛ با حذفش تبدیل‌ها بی‌مبنا می‌شدند.
    expect(() => assertCurrencyDeletable({ isDefault: true, usageCount: 0 }))
      .toThrow(CatalogError);
  });

  it('⚠️ ارزِ در حالِ استفاده هم حذف نمی‌شود', () => {
    expect(() => assertCurrencyDeletable({ isDefault: false, usageCount: 3 }))
      .toThrow(CatalogError);
  });

  it('ارزِ بلااستفاده و غیرِ پیش‌فرض حذف می‌شود', () => {
    expect(() => assertCurrencyDeletable({ isDefault: false, usageCount: 0 })).not.toThrow();
  });

  it('پیامِ هر خطا همان رشتهٔ نسخهٔ قبلی است', () => {
    expect(catalogMessage('default_currency')).toBe('ارز پیش‌فرض قابل حذف نیست.');
  });
});

describe('R-SET-02 — ارزِ پیش‌فرض یکتاست', () => {
  it('⚠️ پیش از نشاندنِ جدید، پرچمِ همه پاک می‌شود', () => {
    // وگرنه دو ارز هم‌زمان پیش‌فرض می‌شدند و مبنای گزارش قطعی نبود.
    expect(planSetDefaultCurrency(5)).toEqual({ clearAll: true, setId: 5, alsoActivate: true });
  });
});

describe('R-SET-03 — نرخِ تبدیل', () => {
  it('⚠️ نرخِ ارز به خودش رد می‌شود', () => {
    expect(() => assertRateValid(1, 1, '1')).toThrow(CatalogError);
  });

  it('⚠️ نرخِ صفر یا منفی رد می‌شود', () => {
    expect(() => assertRateValid(1, 2, '0')).toThrow(CatalogError);
    expect(() => assertRateValid(1, 2, '-1')).toThrow(CatalogError);
    expect(() => assertRateValid(1, 2, 'الف')).toThrow(CatalogError);
  });

  it('نرخِ معتبر با دقتِ بالا پذیرفته می‌شود', () => {
    expect(() => assertRateValid(1, 2, '0.00012345')).not.toThrow();
    expect(() => assertRateValid(2, 1, '58500')).not.toThrow();
  });
});

describe('R-SET-04 — حذفِ تگ', () => {
  it('⚠️ تگِ در حالِ استفاده حذف نمی‌شود', () => {
    // حذفِ یک وضعیتِ پروژه، کارت‌ها را بی‌صدا از تبِ خودشان می‌انداخت.
    expect(() => assertTagDeletable(1)).toThrow(CatalogError);
  });

  it('تگِ بلااستفاده حذف می‌شود', () => {
    expect(() => assertTagDeletable(0)).not.toThrow();
  });
});

describe('نام', () => {
  it('نامِ خالی یا فقط فاصله رد می‌شود', () => {
    expect(() => assertName(' ')).toThrow(CatalogError);
    expect(() => assertName('')).toThrow(CatalogError);
  });

  it('فاصله‌های اضافه بریده می‌شوند', () => {
    expect(assertName(' دفتر تهران ')).toBe('دفتر تهران');
  });
});
