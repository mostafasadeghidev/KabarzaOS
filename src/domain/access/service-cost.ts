/**
 * هزینهٔ ماهانهٔ سرویس‌ها — از اشتراکِ متناظر در ماژولِ مالی.
 *
 * ⚠️ هیچ مبلغی در جدولِ سرویس ذخیره نمی‌شود: سرویس فقط به یک ردیفِ
 * `recurring_expenses` وصل است. دو منبعِ حقیقت برای یک مبلغ، فردا از هم دور
 * می‌افتند و کسی نمی‌فهمد کدام درست است.
 *
 * ⚠️ G2 — پول رشتهٔ decimal است، نه number. همهٔ حساب‌ها اینجا با `bigint`
 * روی مقیاسِ ۱۰⁴ (همان `numeric(20,4)` ِ دیتابیس) انجام می‌شود.
 */

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

const SCALE = 4;

/**
 * طولِ هر دوره به **ماه**، به‌صورتِ کسرِ دقیق تا تقسیمِ اعشاری نداشته باشیم.
 * ⚠️ ماهِ ۳۰ روزه یک قرارداد است، نه واقعیتِ تقویم: هدف مقایسه‌پذیریِ
 * اشتراک‌هاست، نه صورت‌حسابِ دقیق.
 */
const MONTHS_PER_UNIT: Record<IntervalUnit, [numerator: number, denominator: number]> = {
  day: [1, 30],
  week: [7, 30],
  month: [1, 1],
  year: [12, 1],
};

function toUnits(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const clean = trimmed.replace(/^[+-]/, '') || '0';
  const [intPart = '0', fracRaw = ''] = clean.split('.');
  const frac = (fracRaw + '0'.repeat(SCALE)).slice(0, SCALE);
  const units = BigInt((intPart || '0') + frac);
  return negative ? -units : units;
}

function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = (negative ? -units : units).toString().padStart(SCALE + 1, '0');
  const intPart = abs.slice(0, abs.length - SCALE);
  const frac = abs.slice(abs.length - SCALE);
  return `${negative ? '-' : ''}${intPart}.${frac}`;
}

/** تقسیمِ صحیحِ با گردکردنِ half-up — بریدن روی پول انحراف می‌سازد. */
function divideRound(numerator: bigint, denominator: bigint): bigint {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const q = (2n * a + b) / (2n * b);
  return negative ? -q : q;
}

/**
 * معادلِ ماهانهٔ یک اشتراک: مبلغ تقسیم بر طولِ دوره به ماه.
 *
 * ⚠️ چرا لازم است: اشتراکی که سالانه پرداخت می‌شود و اشتراکی که ماهانه،
 * در یک ستون جمع‌پذیر نیستند. بدونِ نرمال‌سازی، «هزینهٔ ماهانهٔ تیم» عددی
 * می‌شد که هیچ معنایی ندارد.
 */
export function monthlyEquivalent(
  amount: string,
  unit: IntervalUnit,
  intervalCount: number,
): string {
  const [num, den] = MONTHS_PER_UNIT[unit];
  // دورهٔ صفر یا منفی بی‌معناست؛ مثلِ «هر یک دوره» رفتار می‌کند.
  const count = BigInt(Math.max(1, Math.trunc(intervalCount) || 1));
  const units = toUnits(amount);
  return fromUnits(divideRound(units * BigInt(den), count * BigInt(num)));
}

/** سرانه — هزینهٔ ماهانه تقسیم بر شمارِ دسترسیِ باز. بی‌کاربر یعنی null. */
export function perUserCost(monthly: string, openUsers: number): string | null {
  if (openUsers <= 0) return null;
  return fromUnits(divideRound(toUnits(monthly), BigInt(openUsers)));
}

export interface CostRow {
  currencyId: number;
  monthly: string;
}

/**
 * جمعِ ماهانه به تفکیکِ **ارز**.
 *
 * ⚠️ عمداً به یک ارز تبدیل نمی‌شود: تبدیل نرخ می‌خواهد و نرخِ امروز، عددِ
 * دیروز را بی‌صدا عوض می‌کند. اینجا فقط گزارشِ ساده لازم است، نه ترازنامه.
 */
export function totalsByCurrency(rows: readonly CostRow[]): Map<number, string> {
  const sums = new Map<number, bigint>();
  for (const row of rows) {
    sums.set(row.currencyId, (sums.get(row.currencyId) ?? 0n) + toUnits(row.monthly));
  }
  return new Map([...sums].map(([id, units]) => [id, fromUnits(units)]));
}
