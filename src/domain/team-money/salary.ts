/**
 * حقوقِ ماهانه (۲.۵۰.۰) — مبلغِ ثابتی که عضو هر ماه بابتِ کارهای ثابتِ آژانس
 * می‌گیرد، جدا از دستمزدِ پروژه‌ها.
 *
 * ⚠️ حقوق **دوره‌ای** است، نه یک کلیدِ همیشگی: هر توقف دوره را می‌بندد و هر
 * ادامه دورهٔ تازه می‌سازد، تا معلوم بماند کدام ماه‌ها حقوق داشته و کدام نه.
 * ماه‌ها همیشه روزِ اولِ ماه‌اند (`YYYY-MM-01`).
 */

export interface SalaryPeriod {
  id: number;
  startMonth: string;
  endMonth: string | null;
  amount: string;
  currencyId: number;
  payDay: number;
}

/** `2026-04-17` یا `2026-04` → `2026-04-01`؛ ورودیِ نامعتبر خطا می‌دهد. */
export function monthOf(raw: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(raw.trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new SalaryError('invalid_month');
  return `${m[1]}-${m[2]}-01`;
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const year = y + Math.floor(m / 12);
  const mon = ((m % 12) + 12) % 12 + 1;
  return `${year}-${String(mon).padStart(2, '0')}-01`;
}

/** ماه‌های یک بازه، هر دو سر را شامل. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** دو دوره هم‌پوشانی دارند؟ — پایانِ خالی یعنی تا همیشه. */
export function overlaps(a: { startMonth: string; endMonth: string | null }, b: { startMonth: string; endMonth: string | null }): boolean {
  const aEnd = a.endMonth ?? '9999-12-01';
  const bEnd = b.endMonth ?? '9999-12-01';
  return a.startMonth <= bEnd && b.startMonth <= aEnd;
}

/** دوره‌ای که این ماه را می‌پوشاند. */
export function periodFor<T extends { startMonth: string; endMonth: string | null }>(periods: readonly T[], month: string): T | null {
  return periods.find((p) => p.startMonth <= month && (p.endMonth === null || month <= p.endMonth)) ?? null;
}

/**
 * ماه‌هایی که تا ماهِ جاری حقوق داشته‌اند — از همهٔ دوره‌ها، قدیمی‌ترین اول.
 * ⚠️ ماهِ آینده نمی‌آید: حقوقِ ماهِ بعد هنوز «بدهیِ» شرکت نیست.
 */
export function dueMonths<T extends SalaryPeriod>(periods: readonly T[], currentMonth: string): Array<{ month: string; period: T }> {
  const out: Array<{ month: string; period: T }> = [];
  for (const p of periods) {
    const last = p.endMonth !== null && p.endMonth < currentMonth ? p.endMonth : currentMonth;
    if (p.startMonth > last) continue;
    for (const month of monthsBetween(p.startMonth, last)) out.push({ month, period: p });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

/** پرداخت‌نشده و روزِ پرداختش گذشته؟ */
export function isOverdue(month: string, payDay: number, today: string): boolean {
  const due = `${month.slice(0, 8)}${String(payDay).padStart(2, '0')}`;
  return due < today;
}

/** خالص = پایه + پاداش − کسر − قسطِ قرض. */
export function netOf(base: string, bonus: string, deduction: string, installment: string): string {
  const n = Number(base) + Number(bonus) - Number(deduction) - Number(installment);
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

/** مبلغِ اختیاری (پاداش، کسر، قسط) — خالی یعنی صفر؛ منفی پذیرفته نیست. */
export function parseOptional(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim().replace(/,/g, '');
  if (text === '') return '0';
  if (!/^\d+(\.\d{1,4})?$/.test(text)) throw new SalaryError('invalid_amount');
  return text;
}

export function parsePayDay(raw: string | number | null | undefined): number {
  const n = Number(String(raw ?? '').trim() || '1');
  if (!Number.isInteger(n) || n < 1 || n > 28) throw new SalaryError('invalid_day');
  return n;
}

export class SalaryError extends Error {
  constructor(
    readonly code:
      | 'not_found' | 'invalid_amount' | 'invalid_day' | 'invalid_month' | 'overlap' | 'open_exists'
      | 'paid_outside' | 'has_payments' | 'already_paid' | 'not_due' | 'net_not_positive'
      | 'no_account' | 'not_member' | 'currency_locked',
  ) {
    super(`salary refused: ${code}`);
    this.name = 'SalaryError';
  }
}

export const SALARY_MESSAGES: Record<SalaryError['code'], string> = {
  not_found: 'حقوق پیدا نشد.',
  invalid_amount: 'مبلغ معتبر نیست.',
  invalid_day: 'روزِ پرداخت باید بینِ ۱ تا ۲۸ باشد.',
  invalid_month: 'ماه معتبر نیست.',
  overlap: 'این بازه با دورهٔ دیگری از حقوقِ همین عضو هم‌پوشانی دارد.',
  open_exists: 'این عضو همین حالا حقوقِ فعال دارد. اول آن را متوقف کنید.',
  paid_outside: 'برای ماه‌هایی بیرون از این بازه حقوق پرداخت شده است. اول آن پرداخت‌ها را حذف کنید.',
  has_payments: 'این دوره پرداخت دارد و حذف نمی‌شود. به‌جایش متوقفش کنید.',
  already_paid: 'حقوقِ این ماه قبلاً پرداخت شده است.',
  not_due: 'این ماه در هیچ دورهٔ حقوقی نیست.',
  net_not_positive: 'مبلغِ خالص باید بیشتر از صفر باشد.',
  no_account: 'حساب را انتخاب کنید.',
  not_member: 'این شخص عضوِ تیم نیست.',
  currency_locked: 'این دوره پرداخت دارد و ارزش عوض نمی‌شود.',
};
