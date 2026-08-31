import { describe, it, expect } from 'vitest';
import {
  paymentStatus, remaining, summarizeProject, rowValueIn,
  outstandingTotal, requestableAmount, assertRequestAllowed,
  markPaid, unpaidWorkExcludingRequested, RequestValidationError,
  type RequestRow,
} from './payments';
import type { RateRow, RateSource } from '../currency/rates';

const EUR = 1, USD = 2;
const rates: RateSource = {
  find: (f, t) => {
    const rows: RateRow[] = [{ fromCurrencyId: USD, toCurrencyId: EUR, rate: '0.9', effectiveDate: '2026-01-01' }];
    return rows.find((r) => r.fromCurrencyId === f && r.toCurrencyId === t) ?? null;
  },
};

describe('R-TEAM-02 — وضعیتِ سه‌حالته با اپسیلون', () => {
  it('بدونِ پرداخت', () => expect(paymentStatus('0', '1000')).toBe('unpaid'));
  it('پرداختِ ناقص', () => expect(paymentStatus('400', '1000')).toBe('partial'));
  it('پرداختِ کامل', () => expect(paymentStatus('1000', '1000')).toBe('paid'));

  it('⚠️ جمعِ اعشاری نباید مانعِ «تمام‌شدن» شود', () => {
    // سه پرداختِ ۳۳.۳۳۳ در برابرِ ۱۰۰
    const paid = 33.333 * 3; // 99.999
    expect(paymentStatus(String(paid), '100')).toBe('paid');
  });
});

describe('R-TEAM-03 — باقی‌مانده هیچ‌وقت منفی نیست', () => {
  it('اضافه‌پرداخت صفر می‌شود، نه منفی', () => {
    expect(remaining('100', '120')).toBe(0);
  });
  it('باقی‌ماندهٔ عادی', () => expect(remaining('100', '40')).toBe(60));
});

describe('R-TEAM-04 — بدهیِ کارفرما = قیمت + هزینهٔ قابلِ صورتحساب', () => {
  it('هزینهٔ قابلِ صورتحساب به بدهی اضافه می‌شود', () => {
    const s = summarizeProject('1000', '200', '0');
    expect(s.totalDue).toBe(1200);
    expect(s.status).toBe('unpaid');
  });

  it('پرداختِ کاملِ قیمت ولی نه هزینه‌ها = ناقص', () => {
    expect(summarizeProject('1000', '200', '1000').status).toBe('partial');
  });
});

describe('R-TEAM-01 — ⚠️ مبلغِ تسویه‌شده بر مبلغِ اسمی مقدم است', () => {
  it('تسویه‌شده در همان ارز مستقیم برمی‌گردد', () => {
    expect(rowValueIn(rates, { amount: '100', currencyId: EUR, amountSettled: '95', settledCurrencyId: EUR }, EUR)).toBe('95');
  });

  it('بدونِ تسویه، مبلغِ اسمی استفاده می‌شود', () => {
    expect(rowValueIn(rates, { amount: '100', currencyId: EUR }, EUR)).toBe('100');
  });

  it('تسویه‌شده در ارزِ دیگر تبدیل می‌شود', () => {
    expect(rowValueIn(rates, { amount: '100', currencyId: EUR, amountSettled: '100', settledCurrencyId: USD }, EUR)).toBe('90.0');
  });
});

describe('⚠️ گاردِ ۱ — R-TEAM-06: ادعای دوباره', () => {
  const reqs: RequestRow[] = [
    { id: 1, amount: '80', status: 'pending' },
    { id: 2, amount: '50', status: 'paid' },      // قبلاً پرداخت شده
    { id: 3, amount: '30', status: 'rejected' },  // به حساب نمی‌آید
  ];

  it('فقط درخواست‌های باز سقف را مصرف می‌کنند', () => {
    expect(outstandingTotal(reqs)).toBe(80);
  });

  it('سقفِ درخواستِ جدید = مانده منهای ادعاهای باز', () => {
    expect(requestableAmount('100', reqs)).toBe(20);
  });

  it('درخواستِ بیش از سقف رد می‌شود', () => {
    expect(() => assertRequestAllowed('50', '100', reqs)).toThrow(RequestValidationError);
  });

  it('درخواستِ داخلِ سقف مجاز است', () => {
    expect(() => assertRequestAllowed('20', '100', reqs)).not.toThrow();
  });

  it('بدونِ این گارد، سه درخواست برای یک کار همه تأیید می‌شدند', () => {
    const balance = '100';
    expect(() => assertRequestAllowed('100', balance, [{ id: 1, amount: '100', status: 'approved' }]))
      .toThrow(RequestValidationError);
  });
});

describe('⚠️ گاردِ ۲ — R-TEAM-09: هر واحد فقط یک درخواستِ باز', () => {
  it('درخواستِ دوم برای همان واحد رد می‌شود', () => {
    const existing: RequestRow[] = [{ id: 1, amount: '10', status: 'pending', unitEntryId: 7 }];
    expect(() => assertRequestAllowed('10', '1000', existing, 7)).toThrow(RequestValidationError);
  });

  it('واحدِ دیگر مجاز است', () => {
    const existing: RequestRow[] = [{ id: 1, amount: '10', status: 'pending', unitEntryId: 7 }];
    expect(() => assertRequestAllowed('10', '1000', existing, 8)).not.toThrow();
  });

  it('درخواستِ ردشده مانع نیست', () => {
    const existing: RequestRow[] = [{ id: 1, amount: '10', status: 'rejected', unitEntryId: 7 }];
    expect(() => assertRequestAllowed('10', '1000', existing, 7)).not.toThrow();
  });
});

describe('⚠️ گاردِ ۳ — R-TEAM-07/08/10: پرداخت', () => {
  it('درخواستِ ردشده هرگز پرداخت نمی‌شود', () => {
    expect(markPaid({ id: 1, amount: '100', status: 'rejected' }, 55)).toBeNull();
  });

  it('پرداخت همیشه به تراکنشِ بانکی وصل است', () => {
    const r = markPaid({ id: 1, amount: '100', status: 'approved' }, 55);
    expect(r?.status).toBe('paid');
    expect(r?.ledgerId).toBe(55);
  });

  it('R-TEAM-08 — پرداخت، ردیفِ کارِ تعدادی را هم می‌بندد', () => {
    const r = markPaid({ id: 1, amount: '100', status: 'approved', unitEntryId: 42 }, 55);
    expect(r?.closesUnitEntryId).toBe(42);
  });

  it('بدونِ تراکنش، پرداخت رد می‌شود', () => {
    expect(() => markPaid({ id: 1, amount: '100', status: 'approved' }, 0)).toThrow(RequestValidationError);
  });
});

describe('R-TEAM-11 — کارِ پرداخت‌نشده نباید در دو فهرست بیاید', () => {
  const entries = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('واحدِ دارای درخواستِ باز از فهرست حذف می‌شود', () => {
    const reqs: RequestRow[] = [{ id: 9, amount: '10', status: 'pending', unitEntryId: 2 }];
    expect(unpaidWorkExcludingRequested(entries, reqs).map((e) => e.id)).toEqual([1, 3]);
  });

  it('درخواستِ پرداخت‌شده یا ردشده واحد را پنهان نمی‌کند', () => {
    const reqs: RequestRow[] = [
      { id: 9, amount: '10', status: 'paid', unitEntryId: 2 },
      { id: 10, amount: '10', status: 'rejected', unitEntryId: 3 },
    ];
    expect(unpaidWorkExcludingRequested(entries, reqs).map((e) => e.id)).toEqual([1, 2, 3]);
  });
});
