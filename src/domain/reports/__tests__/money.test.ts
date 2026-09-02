import { describe, expect, it } from 'vitest';
import {
  isSettledFormer, perCurrencyLines, rateAgeDays, rateBanner, rateInfo, sumInBase,
} from '../money';

const EUR = 1, IRR = 2, USD = 3, GBP = 4;
const toBase = (amount: number, cid: number) => (cid === EUR ? amount : cid === IRR ? amount * 0.00002 : amount * 0.9);

describe('بدهیِ چندارزی — پورتِ member_rows', () => {
  it('⚠️ کف‌بندی به‌ازای هر ارز: اضافه‌پرداختِ یورویی بدهیِ تومانی را نمی‌خورد', () => {
    const lines = perCurrencyLines(
      new Map([[EUR, 1000], [IRR, 5_000_000]]),
      new Map([[EUR, 1200]]),
    );
    expect(lines).toEqual([
      { currencyId: EUR, agreed: 1000, paid: 1200, debt: 0 },
      { currencyId: IRR, agreed: 5_000_000, paid: 0, debt: 5_000_000 },
    ]);
    const total = sumInBase(lines, toBase);
    // ۵٬۰۰۰٬۰۰۰ × ۰٫۰۰۰۰۲ = ۱۰۰ یورو بدهی — نه (۱۰۰۰ + ۱۰۰) − ۱۲۰۰ = −۱۰۰.
    expect(total.debt).toBeCloseTo(100, 6);
    expect(total.agreed).toBeCloseTo(1100, 6);
    expect(total.paid).toBe(1200);
  });

  it('ارزی که فقط پرداختی دارد هم خط می‌گیرد؛ ترتیب بر پایهٔ شناسه', () => {
    const lines = perCurrencyLines(new Map([[USD, 100]]), new Map([[EUR, 50], [USD, 30]]));
    expect(lines.map((l) => l.currencyId)).toEqual([EUR, USD]);
    expect(lines[0]).toMatchObject({ agreed: 0, paid: 50, debt: 0 });
    expect(lines[1]).toMatchObject({ agreed: 100, paid: 30, debt: 70 });
  });

  it('عضوِ سابقِ تسویه‌شده پنهان می‌شود؛ فعال یا بدهکار می‌ماند', () => {
    const settled = perCurrencyLines(new Map([[EUR, 100]]), new Map([[EUR, 100]]));
    expect(isSettledFormer({ isFormer: true, lines: settled })).toBe(true);
    expect(isSettledFormer({ isFormer: false, lines: settled })).toBe(false);
    const owed = perCurrencyLines(new Map([[EUR, 100]]), new Map([[EUR, 40]]));
    expect(isSettledFormer({ isFormer: true, lines: owed })).toBe(false);
  });
});

describe('نوارِ نرخ‌ها — پورتِ rate_banner_html', () => {
  const rates = new Map<string, { rate: string; effectiveDate: string }>([
    [`${EUR}:${IRR}`, { rate: '52000', effectiveDate: '2026-09-01' }],
    [`${USD}:${EUR}`, { rate: '0.8', effectiveDate: '2026-08-01' }],
  ]);
  const find = (from: number, to: number) => rates.get(`${from}:${to}`) ?? null;
  const currencies = [
    { id: EUR, code: 'EUR', isActive: true },
    { id: IRR, code: 'IRR', isActive: true },
    { id: USD, code: 'USD', isActive: true },
    { id: GBP, code: 'GBP', isActive: true },
    { id: 9, code: 'OLD', isActive: false },
  ];

  it('نرخِ مستقیم، معکوس (۱/x)، کهنه (بیش از ۷ روز) و غایب', () => {
    const banner = rateBanner({ baseId: EUR, baseCode: 'EUR', currencies, find, today: '2026-09-02' });
    expect(banner.shown).toEqual(['1 EUR = 52000 IRR', '1 EUR = 1.25 USD']);
    expect(banner.stale).toEqual(['USD']);
    expect(banner.missing).toEqual(['GBP']);
    expect(banner.visible).toBe(true);
    expect(rateInfo(find, EUR, USD)).toMatchObject({ inverse: true });
  });

  it('نصبِ تک‌ارزی چیزی نمی‌گوید', () => {
    const banner = rateBanner({ baseId: EUR, baseCode: 'EUR', currencies: [currencies[0]!], find, today: '2026-09-02' });
    expect(banner.visible).toBe(false);
  });

  it('سنِ نرخ به روز', () => {
    expect(rateAgeDays('2026-08-26', '2026-09-02')).toBe(7);
    expect(rateAgeDays('2026-08-25', '2026-09-02')).toBe(8);
    expect(rateAgeDays('bad', '2026-09-02')).toBeNull();
  });
});
