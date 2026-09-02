import { convert, type RateSource } from '../currency/rates';

export interface EurCellRow {
  /** معادلِ تسویه‌شدهٔ دستی — واقعیتِ همان تراکنش. */
  amountSettled: string | null;
  settledCurrencyId: number | null;
  /** مبلغ در ارزِ حساب. */
  amountAccount: string;
  accountCurrencyId: number;
}

/**
 * خانهٔ «معادل یورو» در جدولِ دفتر — پورتِ `eur_cell()` ِ افزونه.
 *
 * ترتیب: معادلِ تسویه‌شدهٔ دستی (اگر یورو باشد یا نرخش معلوم) ← تبدیلِ نرخیِ
 * مبلغِ حساب ← و فقط وقتی هیچ راهی نیست `null` («—»).
 *
 * ⚠️ رقمِ منجمدِ زمانِ ثبت (`amount_eur`) اینجا نشان داده **نمی‌شود**: وقتی
 * نرخ نبود، صفر ذخیره شده و «۰» را به‌جای «نامعلوم» نشان می‌داد. جمع‌های
 * گزارشی همچنان از رقمِ منجمد می‌آیند (R-FISCAL-08)؛ این فقط نمایشِ ردیف است.
 */
export function eurCell(source: RateSource, row: EurCellRow, baseCurrencyId: number): string | null {
  const settled = row.amountSettled;
  if (settled !== null && settled !== '' && row.settledCurrencyId) {
    const viaSettled = convert(source, settled, row.settledCurrencyId, baseCurrencyId);
    if (viaSettled !== null) return viaSettled;
  }
  return convert(source, row.amountAccount, row.accountCurrencyId, baseCurrencyId);
}
