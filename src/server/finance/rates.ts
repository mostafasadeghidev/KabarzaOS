import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { currencies, exchangeRates } from '@/db/schema';
import type { RateSource } from '@/domain/currency/rates';

/**
 * نرخ‌های ارزِ تنظیمات + ارزِ پایه — منبعِ واحدِ همهٔ تبدیل‌ها.
 *
 * ⚠️ ماژولِ جدا و بی‌وابستگی: مخزنِ پروژه‌ها هم به آن نیاز دارد (جمعِ
 * هزینه‌های چندارزیِ کارت)، ولی `server/finance/service` از راهِ فایل‌ها به
 * همان مخزن برمی‌گشت و وارد کردنش حلقه می‌ساخت. `finance/service` همین را
 * دوباره صادر می‌کند، پس واردکننده‌های قبلی دست نخورده‌اند.
 */
export async function rateSource(): Promise<{ source: RateSource; baseCurrencyId: number }> {
  const [rows, base] = await Promise.all([
    db.select({
      fromCurrencyId: exchangeRates.fromCurrencyId,
      toCurrencyId: exchangeRates.toCurrencyId,
      rate: exchangeRates.rate,
      effectiveDate: exchangeRates.effectiveDate,
    }).from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.id)),
    db.select({ id: currencies.id }).from(currencies).where(eq(currencies.isDefault, true)),
  ]);

  const byPair = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.fromCurrencyId}:${r.toCurrencyId}`;
    if (!byPair.has(key)) byPair.set(key, r);
  }

  return {
    source: { find: (from, to) => byPair.get(`${from}:${to}`) ?? null },
    baseCurrencyId: base[0]?.id ?? 1,
  };
}
