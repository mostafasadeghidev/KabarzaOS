import { trimRate } from '../currency/rates';

/**
 * پولِ چندارزیِ گزارش‌ها — پورتِ `Reports::member_rows` / `client_rows` و
 * `rate_banner_html` ِ افزونه.
 *
 * ⚠️ بدهی/طلب **به‌ازای هر ارز** کف‌بندی می‌شود (`max(0, ·)`) و جمعِ یورو حاصلِ
 * جمعِ همان کف‌ها پس از تبدیل است: اضافه‌پرداختِ یورویی نمی‌تواند بدهیِ
 * تومانی را «بخورد». پیش از این توافقی (چندارزی) منهای پرداختی (یوروی
 * منجمد) می‌شد — واحدها قاطی و نتیجه بی‌معنا.
 */

export interface CurrencyLine {
  currencyId: number;
  /** توافقی / صورتحساب‌شده در همان ارز. */
  agreed: number;
  paid: number;
  /** کف‌بندی‌شده: هرگز منفی نیست. */
  debt: number;
}

export function perCurrencyLines(
  agreedBy: ReadonlyMap<number, number>,
  paidBy: ReadonlyMap<number, number>,
): CurrencyLine[] {
  const ids = [...new Set([...agreedBy.keys(), ...paidBy.keys()])].sort((a, b) => a - b);
  return ids.map((currencyId) => {
    const agreed = agreedBy.get(currencyId) ?? 0;
    const paid = paidBy.get(currencyId) ?? 0;
    return { currencyId, agreed, paid, debt: Math.max(0, agreed - paid) };
  });
}

/** جمعِ سه رقم در ارزِ پایه — تبدیلِ هر خط جداگانه، بدهی از کف‌های خطی. */
export function sumInBase(
  lines: readonly CurrencyLine[],
  toBase: (amount: number, currencyId: number) => number,
): { agreed: number; paid: number; debt: number } {
  return lines.reduce(
    (acc, l) => ({
      agreed: acc.agreed + toBase(l.agreed, l.currencyId),
      paid: acc.paid + toBase(l.paid, l.currencyId),
      debt: acc.debt + toBase(l.debt, l.currencyId),
    }),
    { agreed: 0, paid: 0, debt: 0 },
  );
}

/**
 * پورتِ `without_settled_former`: عضوِ سابقی که هیچ بدهیِ خطی ندارد از فهرست
 * می‌رود — فقط نمایش؛ جمع‌های کلی همه را نگه می‌دارند. اعضای فعال همیشه می‌مانند.
 */
export function isSettledFormer(row: { isFormer: boolean; lines: readonly CurrencyLine[] }): boolean {
  if (!row.isFormer) return false;
  return row.lines.reduce((sum, l) => sum + l.debt, 0) < 0.005;
}

export const RATE_STALE_DAYS = 7;

export interface RateInfo {
  rate: string;
  effectiveDate: string;
}

export interface RateBannerInput {
  baseId: number;
  baseCode: string;
  currencies: ReadonlyArray<{ id: number; code: string; isActive: boolean }>;
  /** جدیدترین نرخِ ثبت‌شدهٔ یک جفت (مستقیم)، یا null. */
  find: (from: number, to: number) => RateInfo | null;
  /** امروز به شکلِ YYYY-MM-DD. */
  today: string;
}

export interface RateBanner {
  /** «1 EUR = 52000 IRR» به‌ازای هر ارزِ فعالِ غیرِپایه. */
  shown: string[];
  stale: string[];
  missing: string[];
  /** روی نصبِ تک‌ارزی چیزی برای گفتن نیست. */
  visible: boolean;
}

/** پورتِ `rate_info`: مستقیم، وگرنه معکوسِ ۱/x — هرگز ۱:۱ ِ ساختگی. */
export function rateInfo(
  find: RateBannerInput['find'],
  from: number,
  to: number,
): (RateInfo & { inverse: boolean }) | null {
  const direct = find(from, to);
  if (direct) return { ...direct, inverse: false };
  const inv = find(to, from);
  if (inv && Number(inv.rate) > 0) {
    return { rate: (1 / Number(inv.rate)).toFixed(8), effectiveDate: inv.effectiveDate, inverse: true };
  }
  return null;
}

/** پورتِ `rate_age_days`: روزهای کاملِ گذشته از تاریخِ نرخ، یا null. */
export function rateAgeDays(effectiveDate: string, today: string): number | null {
  const eff = Date.parse(effectiveDate);
  const now = Date.parse(today);
  if (!Number.isFinite(eff) || !Number.isFinite(now)) return null;
  return Math.floor((now - eff) / 86_400_000);
}

/**
 * نوارِ نرخ‌های گزارش — پورتِ `rate_banner_html`: نرخِ هر ارزِ فعال نسبت به
 * پایه، هشدارِ کهنگی (بیش از ۷ روز) و هشدارِ نبودِ نرخ.
 */
export function rateBanner(input: RateBannerInput): RateBanner {
  const shown: string[] = [];
  const stale: string[] = [];
  const missing: string[] = [];
  for (const c of input.currencies) {
    if (c.id === input.baseId || !c.isActive) continue;
    const info = rateInfo(input.find, input.baseId, c.id);
    if (!info) { missing.push(c.code); continue; }
    shown.push(`1 ${input.baseCode} = ${trimRate(Number(info.rate).toFixed(8))} ${c.code}`);
    const age = rateAgeDays(info.effectiveDate, input.today);
    if (age !== null && age > RATE_STALE_DAYS) stale.push(c.code);
  }
  return { shown, stale, missing, visible: shown.length > 0 || missing.length > 0 };
}
