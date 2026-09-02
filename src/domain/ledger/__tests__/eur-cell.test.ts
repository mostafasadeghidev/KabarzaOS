import { describe, expect, it } from 'vitest';
import type { RateRow, RateSource } from '../../currency/rates';
import { eurCell } from '../eur-cell';

const EUR = 1, USD = 2, IRR = 3, GBP = 4;
function source(rows: RateRow[]): RateSource {
  return { find: (f, t) => rows.find((r) => r.fromCurrencyId === f && r.toCurrencyId === t) ?? null };
}
const rates = source([
  { fromCurrencyId: USD, toCurrencyId: EUR, rate: '0.9', effectiveDate: '2026-01-01' },
  { fromCurrencyId: IRR, toCurrencyId: EUR, rate: '0.00002', effectiveDate: '2026-01-01' },
]);

describe('خانهٔ «معادل یورو» — پورتِ eur_cell()', () => {
  it('معادلِ تسویه‌شدهٔ دستی مقدم است: یورو همان، ارزِ دیگر با نرخ', () => {
    expect(eurCell(rates, { amountSettled: '80', settledCurrencyId: EUR, amountAccount: '5000000', accountCurrencyId: IRR }, EUR)).toBe('80');
    expect(eurCell(rates, { amountSettled: '100', settledCurrencyId: USD, amountAccount: '5000000', accountCurrencyId: IRR }, EUR)).toBe('90.0');
  });

  it('بی‌تسویه: تبدیلِ نرخیِ مبلغِ حساب (نرخِ معکوس هم می‌شمارد)', () => {
    expect(eurCell(rates, { amountSettled: null, settledCurrencyId: null, amountAccount: '5000000', accountCurrencyId: IRR }, EUR)).toBe('100.00000');
    // EUR→USD از معکوسِ USD→EUR.
    expect(Number(eurCell(rates, { amountSettled: null, settledCurrencyId: null, amountAccount: '90', accountCurrencyId: EUR }, USD))).toBeCloseTo(100, 6);
  });

  it('⚠️ وقتی هیچ راهی نیست «—» (null) — نه ۱:۱ ِ ساختگی و نه صفرِ منجمد', () => {
    expect(eurCell(rates, { amountSettled: null, settledCurrencyId: null, amountAccount: '40', accountCurrencyId: GBP }, EUR)).toBeNull();
    // تسویه در ارزِ بی‌نرخ → به مبلغِ حساب برمی‌گردد.
    expect(eurCell(rates, { amountSettled: '30', settledCurrencyId: GBP, amountAccount: '100', accountCurrencyId: USD }, EUR)).toBe('90.0');
  });
});
