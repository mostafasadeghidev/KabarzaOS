/**
 * پول و ارز — پیاده‌سازیِ قواعدِ docs/rules/MONEY.md
 *
 * G2: پول به‌صورتِ رشتهٔ decimal نگه داشته می‌شود، نه number.
 * جمع و ضربِ اعشاریِ JS روی پول ممنوع است.
 */

export type Money = string;

export interface Currency {
  id: number;
  code: string;
  symbol: string;
  /** R-MONEY-02 — تعدادِ اعشار از خودِ ارز می‌آید (تومان = ۰). */
  decimals: number;
}

/**
 * تبدیلِ امنِ رشته به عددِ صحیحِ ریز-واحد.
 * ⚠️ رقم‌های اضافه **گرد** می‌شوند (half-up)، نه بریده — هم‌رفتار با نسخهٔ قبلی.
 * بریدن یعنی ۹۹.۹۹۹ می‌شود ۹۹.۹۹ و در جمعِ پول انحراف می‌سازد.
 */
function toUnits(value: Money, decimals: number): bigint {
  const negative = value.trim().startsWith('-');
  const clean = value.trim().replace(/^[+-]/, '');
  const [intPart = '0', fracRaw = ''] = clean.split('.');
  const padded = fracRaw + '0'.repeat(decimals + 1);
  const kept = padded.slice(0, decimals);
  const nextDigit = padded.charAt(decimals);
  let units = BigInt((intPart || '0') + (decimals > 0 ? kept : ''));
  if (nextDigit >= '5') units += 1n; // گردکردنِ half-up
  return negative ? -units : units;
}

function fromUnits(units: bigint, decimals: number): Money {
  const negative = units < 0n;
  const abs = (negative ? -units : units).toString().padStart(decimals + 1, '0');
  const intPart = abs.slice(0, abs.length - decimals) || '0';
  const frac = decimals > 0 ? '.' + abs.slice(abs.length - decimals) : '';
  return (negative ? '-' : '') + intPart + frac;
}

/**
 * R-MONEY-01 — جداکننده‌ها هاردکد هستند، نه از locale.
 * بعضی localeها هزارگان و اعشار را یکسان می‌کنند و «12,365,00» تولید می‌شود
 * که قابلِ تفسیرِ اشتباه است. این یک باگِ واقعی در نسخهٔ قبلی بود.
 *
 * R-MONEY-03 — نمادِ بیش از ۲ کاراکتر بعد از عدد؛ تک‌نمادی قبل از عدد.
 */
export function format(amount: Money, currency?: Currency): string {
  const decimals = currency?.decimals ?? 2;
  const units = toUnits(amount, decimals);
  const plain = fromUnits(units, decimals);
  const negative = plain.startsWith('-');
  const [intPart = '0', frac] = plain.replace('-', '').split('.');

  // هزارگان همیشه «,» و اعشار همیشه «.» — مستقل از زبانِ سایت.
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = (negative ? '-' : '') + grouped + (frac ? '.' + frac : '');

  const symbol = currency?.symbol ?? '';
  if (symbol === '') return number;
  return [...symbol].length > 2 ? `${number} ${symbol}` : `${symbol} ${number}`;
}

/**
 * R-MONEY-04 — مقدارِ ورودیِ فرم صفرهای انتهایی ندارد؛ صفر → رشتهٔ خالی
 * (تا placeholder دیده شود).
 */
export function inputValue(stored: Money | null | undefined): string {
  if (stored === null || stored === undefined || stored === '') return '';
  const trimmed = stored.replace(/0+$/, '').replace(/\.$/, '');
  const normalized = trimmed === '' || trimmed === '-' ? '0' : trimmed;
  if (toUnits(normalized, 4) === 0n) return '';
  return normalized;
}

/**
 * R-MONEY-09 — دقیقه به «ساعت/دقیقه». ساعتِ صفر نمایش داده نمی‌شود.
 * برچسب‌ها بیرون از دامنه ترجمه می‌شوند.
 */
export function splitMinutes(minutes: number): { hours: number; minutes: number } {
  const total = Math.trunc(minutes);
  return { hours: Math.trunc(total / 60), minutes: total % 60 };
}
