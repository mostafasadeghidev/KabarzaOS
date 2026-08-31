import { describe, it, expect } from 'vitest';
import { computeAmounts, validateTransfer, buildTransferLegs, TransferValidationError , validateEntry, LedgerValidationError, type EntryDraft } from './amounts';
import type { RateRow, RateSource } from '../currency/rates';

const EUR = 1, IRT = 2, USD = 3;

function source(rows: RateRow[]): RateSource {
  return { find: (f, t) => rows.find((r) => r.fromCurrencyId === f && r.toCurrencyId === t) ?? null };
}

const rates = source([
  { fromCurrencyId: EUR, toCurrencyId: IRT, rate: '1000000', effectiveDate: '2026-01-01' },
]);

const base = {
  amount: '100',
  currencyId: EUR,
  accountCurrencyId: EUR,
  officeCurrencyId: EUR,
  baseCurrencyId: EUR,
};

describe('چهار مبلغِ ذخیره‌شده', () => {
  it('ارزِ یکسان: همه برابر و نرخ ۱', () => {
    const r = computeAmounts(rates, base);
    expect(r.amountAccount).toBe('100');
    expect(r.amountEur).toBe('100');
    expect(r.exchangeRate).toBe('1');
    expect(r.missingRates).toEqual([]);
  });

  it('حسابِ تومانی: مبلغِ حساب تبدیل می‌شود', () => {
    const r = computeAmounts(rates, { ...base, accountCurrencyId: IRT, officeCurrencyId: IRT });
    expect(r.amountAccount).toBe('100000000');
    expect(r.amountEur).toBe('100'); // پایه یورو می‌ماند
  });
});

describe('R-LEDGER-03 — ⚠️ مبلغِ واقعیِ رسیده بر نرخِ بازار مقدم است', () => {
  it('کارمزدِ انتقال در نرخِ ذخیره‌شده منعکس می‌شود', () => {
    // نرخِ بازار ۱٬۰۰۰٬۰۰۰ است ولی فقط ۹۵٬۰۰۰٬۰۰۰ رسید
    const r = computeAmounts(rates, {
      ...base,
      accountCurrencyId: IRT,
      officeCurrencyId: IRT,
      amountAccountOverride: '95000000',
    });
    expect(r.amountAccount).toBe('95000000');
    // نرخِ ذخیره‌شده = ۹۵٬۰۰۰٬۰۰۰ / ۱۰۰
    expect(r.exchangeRate).toBe('950000');
  });

  it('حقیقت آن چیزی است که در حساب نشسته، نه نرخِ بازار', () => {
    const withOverride = computeAmounts(rates, {
      ...base, accountCurrencyId: IRT, officeCurrencyId: IRT, amountAccountOverride: '95000000',
    });
    const marketRate = computeAmounts(rates, { ...base, accountCurrencyId: IRT, officeCurrencyId: IRT });
    expect(withOverride.amountAccount).not.toBe(marketRate.amountAccount);
  });
});

describe('R-MONEY-06 — نبودِ نرخ بی‌صدا ۱ نمی‌شود', () => {
  it('ارزِ بدونِ نرخ در missingRates گزارش می‌شود', () => {
    const r = computeAmounts(rates, { ...base, accountCurrencyId: USD, officeCurrencyId: USD, baseCurrencyId: USD });
    expect(r.missingRates).toContain(USD);
  });

  it('در نسخهٔ قبلی اینجا بی‌صدا ۱۰۰ دلار ثبت می‌شد', () => {
    const r = computeAmounts(rates, { ...base, accountCurrencyId: USD, officeCurrencyId: EUR, baseCurrencyId: EUR });
    expect(r.missingRates.length).toBeGreaterThan(0);
  });
});

describe('R-LEDGER-05 — گاردهای انتقال', () => {
  const ok = { fromAccountId: 1, toAccountId: 2, fromAmount: '100', toAmount: '95', entryDate: '2026-05-01' };

  it('انتقالِ معتبر رد نمی‌شود', () => {
    expect(() => validateTransfer(ok)).not.toThrow();
  });

  it('حسابِ مبدأ یا مقصدِ خالی رد می‌شود', () => {
    expect(() => validateTransfer({ ...ok, fromAccountId: 0 })).toThrow(TransferValidationError);
    expect(() => validateTransfer({ ...ok, toAccountId: 0 })).toThrow(TransferValidationError);
  });

  it('مبدأ و مقصدِ یکسان رد می‌شود', () => {
    expect(() => validateTransfer({ ...ok, toAccountId: 1 })).toThrow(TransferValidationError);
  });

  it('هر دو مبلغ اجباری‌اند — سیستم حدس نمی‌زند', () => {
    expect(() => validateTransfer({ ...ok, fromAmount: '0' })).toThrow(TransferValidationError);
    expect(() => validateTransfer({ ...ok, toAmount: '0' })).toThrow(TransferValidationError);
    expect(() => validateTransfer({ ...ok, toAmount: '-5' })).toThrow(TransferValidationError);
  });
});

describe('R-LEDGER-04 — انتقال دو لِگِ لینک‌شده است', () => {
  const input = { fromAccountId: 1, toAccountId: 2, fromAmount: '100', toAmount: '95000000', entryDate: '2026-05-01' };

  it('دو لِگ با گروهِ مشترک می‌سازد', () => {
    const [out, inn] = buildTransferLegs(input, 'tr_abc');
    expect(out.direction).toBe('out');
    expect(inn.direction).toBe('in');
    expect(out.transferGroup).toBe(inn.transferGroup);
  });

  it('هر لِگ مبلغِ خودش را در ارزِ حسابِ خودش دارد', () => {
    const [out, inn] = buildTransferLegs(input, 'tr_abc');
    expect(out.amount).toBe('100'); // آنچه خارج شد
    expect(inn.amount).toBe('95000000'); // آنچه واقعاً رسید
  });

  it('هر لِگ به حسابِ طرفِ مقابل اشاره می‌کند', () => {
    const [out, inn] = buildTransferLegs(input, 'tr_abc');
    expect(out.counterpartAccountId).toBe(2);
    expect(inn.counterpartAccountId).toBe(1);
  });

  it('انتقالِ نامعتبر اصلاً لِگ نمی‌سازد', () => {
    expect(() => buildTransferLegs({ ...input, toAccountId: 1 }, 'tr_x')).toThrow(TransferValidationError);
  });
});

describe('R-LEDGER-12 — ردیفِ پروژه‌ای بدونِ توضیحات ثبت نمی‌شود', () => {
  const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
    amount: '100', accountId: 1, projectId: null, description: '', ...over,
  });

  it('ردیفِ بی‌پروژه توضیحات لازم ندارد', () => {
    expect(() => validateEntry(draft())).not.toThrow();
  });

  it('⚠️ ردیفِ پروژه‌ای بدونِ توضیحات رد می‌شود', () => {
    // نامِ پروژه عکسِ لحظه‌ای است؛ با حذفِ پروژه فقط توضیحات می‌ماند.
    expect(() => validateEntry(draft({ projectId: 7 }))).toThrow(LedgerValidationError);
    expect(() => validateEntry(draft({ projectId: 7, description: ' ' })))
      .toThrow(LedgerValidationError);
  });

  it('با توضیحات ثبت می‌شود', () => {
    expect(() => validateEntry(draft({ projectId: 7, description: 'پیش‌پرداخت' }))).not.toThrow();
  });

  it('مبلغِ صفر یا نامعتبر رد می‌شود', () => {
    expect(() => validateEntry(draft({ amount: '0' }))).toThrow(LedgerValidationError);
    expect(() => validateEntry(draft({ amount: 'الف' }))).toThrow(LedgerValidationError);
    expect(() => validateEntry(draft({ amount: '-5' }))).toThrow(LedgerValidationError);
  });

  it('بدونِ حساب ثبت نمی‌شود', () => {
    expect(() => validateEntry(draft({ accountId: null }))).toThrow(LedgerValidationError);
  });
});
