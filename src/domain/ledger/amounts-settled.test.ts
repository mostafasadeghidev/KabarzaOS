import { describe, it, expect } from 'vitest';
import { computeAmounts, withSettledEur } from './amounts';
import type { RateRow, RateSource } from '../currency/rates';

const EUR = 1, IRT = 2, USD = 3;

function source(rows: RateRow[]): RateSource {
  return { find: (f, t) => rows.find((r) => r.fromCurrencyId === f && r.toCurrencyId === t) ?? null };
}

const rates = source([
  { fromCurrencyId: EUR, toCurrencyId: IRT, rate: '20000', effectiveDate: '2026-01-01' },
]);
const scope = { baseCurrencyId: EUR, officeCurrencyId: EUR };

describe('withSettledEur — یوروی ردیف = عددی که از طلبِ عضو کم شد (۲.۲۵.۰)', () => {
  const twoMillion = computeAmounts(rates, {
    amount: '2000000', currencyId: IRT, accountCurrencyId: IRT, officeCurrencyId: EUR, baseCurrencyId: EUR,
  });

  it('بی‌عددِ کسر، همان یوروی نرخِ بازار می‌ماند', () => {
    expect(Number(withSettledEur(twoMillion, rates, { amount: '', currencyId: EUR }, scope).amountEur)).toBe(100);
  });

  it('با ۱۰۵ یورو کسر، یوروی ردیف ۱۰۵ است نه ۱۰۰', () => {
    const r = withSettledEur(twoMillion, rates, { amount: '105', currencyId: EUR }, scope);
    expect(r.amountEur).toBe('105');
    expect(r.amountOffice).toBe('105');
    expect(r.amountAccount).toBe('2000000');
  });

  it('نبودِ نرخِ تومان به یورو دیگر مانعِ ثبت نیست', () => {
    const noRate = computeAmounts(source([]), {
      amount: '2000000', currencyId: IRT, accountCurrencyId: IRT, officeCurrencyId: EUR, baseCurrencyId: EUR,
    });
    expect(noRate.missingRates).toContain(EUR);
    const r = withSettledEur(noRate, source([]), { amount: '105', currencyId: EUR }, scope);
    expect(r.missingRates).toEqual([]);
    expect(r.amountEur).toBe('105');
  });

  it('ارزِ قراردادِ بی‌نرخ (دلار) چیزی را عوض نمی‌کند', () => {
    const r = withSettledEur(twoMillion, rates, { amount: '110', currencyId: USD }, scope);
    expect(r).toEqual(twoMillion);
  });
});
