import { describe, it, expect } from 'vitest';
import { monthlyEquivalent, perUserCost, totalsByCurrency } from './service-cost';

describe('معادلِ ماهانهٔ اشتراک', () => {
  it('اشتراکِ ماهانه خودش است', () => {
    expect(monthlyEquivalent('25.0000', 'month', 1)).toBe('25.0000');
  });

  it('⚠️ سالانه تقسیم بر ۱۲ می‌شود — وگرنه ستونِ جمع بی‌معنا بود', () => {
    expect(monthlyEquivalent('240.0000', 'year', 1)).toBe('20.0000');
  });

  it('دورهٔ چندتایی هم حساب می‌شود', () => {
    // هر ۳ ماه ۳۰ یورو → ماهی ۱۰
    expect(monthlyEquivalent('30.0000', 'month', 3)).toBe('10.0000');
    // هر ۲ سال ۲۴۰ → ماهی ۱۰
    expect(monthlyEquivalent('240.0000', 'year', 2)).toBe('10.0000');
  });

  it('هفته و روز با ماهِ ۳۰ روزه سنجیده می‌شوند', () => {
    expect(monthlyEquivalent('7.0000', 'week', 1)).toBe('30.0000');
    expect(monthlyEquivalent('1.0000', 'day', 1)).toBe('30.0000');
  });

  it('⚠️ گردکردن half-up است، نه بریدن', () => {
    // ۱۰ تقسیم بر ۳ = ۳.۳۳۳۳۳… → ۳.۳۳۳۳
    expect(monthlyEquivalent('10.0000', 'month', 3)).toBe('3.3333');
    // ۲۰ تقسیم بر ۳ = ۶.۶۶۶۶۶… → ۶.۶۶۶۷ (بریدن ۶.۶۶۶۶ می‌داد)
    expect(monthlyEquivalent('20.0000', 'month', 3)).toBe('6.6667');
  });

  it('دورهٔ صفر یا خراب مثلِ «هر یک دوره» رفتار می‌کند، نه تقسیم بر صفر', () => {
    expect(monthlyEquivalent('12.0000', 'month', 0)).toBe('12.0000');
    expect(monthlyEquivalent('12.0000', 'year', Number.NaN)).toBe('1.0000');
  });

  it('ورودیِ بی‌اعشار هم درست خوانده می‌شود', () => {
    expect(monthlyEquivalent('120', 'year', 1)).toBe('10.0000');
  });
});

describe('سرانه', () => {
  it('هزینه تقسیم بر شمارِ دسترسیِ باز', () => {
    expect(perUserCost('30.0000', 3)).toBe('10.0000');
  });

  it('⚠️ بی‌کاربر null است، نه صفر — تقسیم بر صفر معنا ندارد', () => {
    expect(perUserCost('30.0000', 0)).toBeNull();
    expect(perUserCost('30.0000', -1)).toBeNull();
  });
});

describe('جمعِ ماهانه به تفکیکِ ارز', () => {
  it('هر ارز جدا جمع می‌شود', () => {
    const totals = totalsByCurrency([
      { currencyId: 1, monthly: '20.0000' },
      { currencyId: 1, monthly: '5.5000' },
      { currencyId: 2, monthly: '100.0000' },
    ]);
    expect(totals.get(1)).toBe('25.5000');
    expect(totals.get(2)).toBe('100.0000');
  });

  it('⚠️ ارزها با هم جمع نمی‌شوند — تبدیل نرخ می‌خواهد', () => {
    const totals = totalsByCurrency([
      { currencyId: 1, monthly: '20.0000' },
      { currencyId: 2, monthly: '20.0000' },
    ]);
    expect(totals.size).toBe(2);
  });

  it('فهرستِ خالی نقشهٔ خالی می‌دهد', () => {
    expect(totalsByCurrency([]).size).toBe(0);
  });
});
