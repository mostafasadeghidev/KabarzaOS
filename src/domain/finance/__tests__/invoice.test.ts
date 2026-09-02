import { describe, expect, it } from 'vitest';
import { invoiceNumber, invoiceTotals, isIssuable, issuerName } from '../invoice';

describe('شمارهٔ فاکتور', () => {
  it('⚠️ پایدار است — همان پروژه همیشه همان شماره', () => {
    // وگرنه کارفرما دو سند با دو شماره برای یک بدهی می‌گیرد.
    expect(invoiceNumber(7)).toBe('INV-00007');
    expect(invoiceNumber(7)).toBe(invoiceNumber(7));
  });

  it('شناسهٔ بزرگ کوتاه نمی‌شود', () => {
    expect(invoiceNumber(1234567)).toBe('INV-1234567');
  });

  it('ورودیِ نامعتبر شماره را خراب نمی‌کند', () => {
    expect(invoiceNumber(-3)).toBe('INV-00000');
  });
});

describe('جمع‌های فاکتور', () => {
  it('⚠️ مجموع = قیمت + هزینه‌های قابلِ بازپرداخت', () => {
    const t = invoiceTotals({ price: '1000', billableExpenses: '250', paid: '400' });
    expect(t.totalDue).toBe('1250.00');
    expect(t.remaining).toBe('850.00');
  });

  it('بدونِ هزینه، مجموع همان قیمت است', () => {
    expect(invoiceTotals({ price: '1000', billableExpenses: '0', paid: '0' }).totalDue)
      .toBe('1000.00');
  });

  it('⚠️ پرداختِ بیش از بدهی، ماندهٔ منفی نمی‌سازد', () => {
    const t = invoiceTotals({ price: '1000', billableExpenses: '0', paid: '1500' });
    expect(t.remaining).toBe('0.00');
    expect(t.paid).toBe('1500.00');
  });
});

describe('صادرشدن', () => {
  it('فاکتورِ بدونِ کارفرما یا بدونِ مبلغ صادر نمی‌شود', () => {
    expect(isIssuable({ hasClient: false, totalDue: '500' })).toBe(false);
    expect(isIssuable({ hasClient: true, totalDue: '0' })).toBe(false);
    expect(isIssuable({ hasClient: true, totalDue: '500' })).toBe(true);
  });

  it('نامِ صادرکننده هرگز خالی نمی‌ماند', () => {
    expect(issuerName('کبرزا', 'برند')).toBe('کبرزا');
    expect(issuerName('  ', 'برند')).toBe('برند');
    expect(issuerName('', '')).toBe('');
  });
});
