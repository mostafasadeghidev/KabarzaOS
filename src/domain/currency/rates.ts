/**
 * نرخِ ارز و تبدیل — پیاده‌سازیِ قواعدِ docs/rules/MONEY.md
 *
 * ⚠️ مهم‌ترین تفاوت با نسخهٔ قبلی: R-MONEY-06.
 * نسخهٔ قبلی وقتی نرخی پیدا نمی‌کرد **۱ برمی‌گرداند** — یعنی ۱۰۰ یورو و ۱۰۰ تومان
 * مساوی نمایش داده می‌شدند. اینجا `null` برمی‌گردانیم تا فراخوان مجبور به
 * تصمیم‌گیری شود و هیچ رقمِ گمراه‌کننده‌ای بی‌صدا تولید نشود.
 */

export type Rate = string;

export interface RateRow {
  fromCurrencyId: number;
  toCurrencyId: number;
  rate: Rate;
  effectiveDate: string;
}

/** منبعِ نرخ — دامنه به دیتابیس وابسته نیست، فقط به این قرارداد. */
export interface RateSource {
  /** جدیدترین نرخِ ثبت‌شده برای یک جفت، یا null. */
  find(from: number, to: number): RateRow | null;
}

/** تقسیمِ دقیقِ decimal با رشته (بدونِ خطای شناور). */
function divide(numerator: string, denominator: string, precision = 12): string {
  const scale = 10n ** BigInt(precision);
  const [ni = '0', nf = ''] = numerator.split('.');
  const [di = '0', df = ''] = denominator.split('.');
  const nFrac = nf.length;
  const dFrac = df.length;
  const n = BigInt(ni + nf);
  const d = BigInt(di + df);
  if (d === 0n) throw new Error('division by zero rate');
  // تراز کردنِ مقیاسِ اعشار دو طرف
  const adjust = 10n ** BigInt(Math.max(0, dFrac - nFrac));
  const adjustD = 10n ** BigInt(Math.max(0, nFrac - dFrac));
  const q = (n * adjust * scale) / (d * adjustD);
  const s = q.toString().padStart(precision + 1, '0');
  const int = s.slice(0, s.length - precision) || '0';
  const frac = s.slice(s.length - precision).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

/** ضربِ دقیقِ decimal. */
function multiply(a: string, b: string): string {
  const [ai = '0', af = ''] = a.replace('-', '').split('.');
  const [bi = '0', bf = ''] = b.replace('-', '').split('.');
  const negative = a.trim().startsWith('-') !== b.trim().startsWith('-');
  const product = BigInt(ai + af) * BigInt(bi + bf);
  const decimals = af.length + bf.length;
  const s = product.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals) || '0';
  const frac = decimals > 0 ? s.slice(s.length - decimals) : '';
  const out = frac ? `${int}.${frac}` : int;
  return negative && product !== 0n ? `-${out}` : out;
}

/**
 * R-MONEY-05 — ترتیبِ یافتنِ نرخ: مستقیم، بعد معکوس.
 * R-MONEY-07 — ارزِ یکسان همیشه نرخِ ۱.
 * R-MONEY-06 — اگر هیچ‌کدام نبود: **null**، نه ۱.
 */
export function findRate(source: RateSource, from: number, to: number): Rate | null {
  if (!from || !to) return null;
  if (from === to) return '1';

  const direct = source.find(from, to);
  if (direct) return direct.rate;

  const inverse = source.find(to, from);
  if (inverse && inverse.rate !== '0') return divide('1', inverse.rate);

  return null; // ← تفاوتِ کلیدی با نسخهٔ قبلی
}

/** R-MONEY-06 — آیا نرخِ واقعی وجود دارد؟ (برای نمایشِ «—» به‌جای رقمِ گمراه‌کننده) */
export function hasRate(source: RateSource, from: number, to: number): boolean {
  return findRate(source, from, to) !== null;
}

/**
 * تبدیلِ مبلغ. اگر نرخ نباشد `null` برمی‌گردد — فراخوان باید تصمیم بگیرد
 * («—» نشان بده یا خطا بده)، نه اینکه رقمِ اشتباه منتشر شود.
 */
export function convert(
  source: RateSource,
  amount: string,
  from: number,
  to: number,
): string | null {
  const rate = findRate(source, from, to);
  if (rate === null) return null;
  if (rate === '1') return amount;
  return multiply(amount, rate);
}

/**
 * R-LEDGER-03 — نرخِ واقعیِ یک تراکنش از مبلغِ واقعیِ رسیده محاسبه می‌شود،
 * نه از نرخِ بازار: rate = amountAccount / amount.
 * کارمزد و مالیاتِ انتقال این‌طور به‌صورتِ طبیعی ثبت می‌شود.
 */
export function effectiveRate(amount: string, amountAccount: string): Rate {
  if (amount === '0' || amount === '') return '1';
  return divide(amountAccount, amount);
}

export const __internal = { divide, multiply };
