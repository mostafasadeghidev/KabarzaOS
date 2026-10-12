'use client';

import { registerCurrencyDecimals } from '@/domain/money/money';

/**
 * ثبتِ اعشارِ ارزها در مرورگر (۲.۳۰.۲) — پیش از رندرِ فرزندان، تا `formatIn`
 * در همهٔ صفحه‌های کلاینت تنظیمِ «تعداد اعشار» را ببیند.
 */
export function CurrencyDecimals({ list, children }: {
  list: Array<{ code: string; decimals: number }>;
  children: React.ReactNode;
}) {
  registerCurrencyDecimals(list);
  return children;
}
