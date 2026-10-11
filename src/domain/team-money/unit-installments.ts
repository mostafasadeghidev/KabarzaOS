/**
 * پرداختِ چندقسطیِ ردیفِ کارکرد (۲.۲۵.۰).
 *
 * هر ردیف «مبلغ» و «پرداخت‌شده» دارد؛ مانده = مبلغ − پرداخت‌شده. هر قسط به ردیفِ
 * دفترِ خودش وصل است. `status` همان سه حالتِ قبلی می‌ماند:
 *  · paid      — کلِ مبلغ رسیده
 *  · requested — درخواستِ باز دارد
 *  · unpaid    — بقیه؛ اگر پرداخت‌شده > ۰ باشد در نمایش «بخشی پرداخت‌شده» است
 * ⚠️ «بخشی پرداخت‌شده» وضعیتِ ذخیره‌شده نیست — همهٔ فهرست‌ها و گزارش‌هایی که
 * روی `status = 'unpaid'` کار می‌کنند دست نخورده‌اند و فقط مبلغشان «مانده» شد.
 */

/** گردکردنِ پولِ چهاررقمی — جمعِ قسط‌ها با خطای شناور «مانده»ٔ ۰٫۰۰۰۰۰۱ نسازد. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function unitRemaining(amount: string | number, paid: string | number): number {
  return Math.max(0, round4(Number(amount) - Number(paid)));
}

/**
 * پرداخت‌شدهٔ مؤثر: ردیفِ «paid» همیشه کامل است، حتی اگر `paid_amount` ندارد
 * (ردیفی که مسیرِ قدیمی یا دادهٔ واردشده مستقیم «پرداخت‌شده» کرده).
 */
export function unitPaidOf(status: string, amount: string | number, paid: string | number): number {
  return status === 'paid' ? Number(amount) : Math.min(Number(amount), Number(paid));
}

export type UnitPayStatus = 'unpaid' | 'requested' | 'paid';

/** وضعیتِ پرداختِ ردیف از روی جمعِ قسط‌ها. ردیفِ بی‌مبلغ هرگز «پرداخت‌شده» نمی‌شود. */
export function unitPayStatus(amount: string | number, paid: string | number, hasOpenRequest: boolean): UnitPayStatus {
  if (Number(amount) > 0 && unitRemaining(amount, paid) === 0) return 'paid';
  return hasOpenRequest ? 'requested' : 'unpaid';
}

/** برچسبِ نمایشی — «بخشی پرداخت‌شده» فقط در نمایش وجود دارد. */
export function unitPayLabel(status: UnitPayStatus, paid: string | number): 'paid' | 'requested' | 'partial' | 'unpaid' {
  if (status === 'paid' || status === 'requested') return status;
  return Number(paid) > 0 ? 'partial' : 'unpaid';
}

export class UnitInstallmentError extends Error {
  constructor(readonly code: 'nothing_left' | 'part_invalid' | 'part_too_big') {
    super(`unit installment refused: ${code}`);
    this.name = 'UnitInstallmentError';
  }
}

/**
 * مبلغِ این قسط. خالی ← کلِ مانده. ⚠️ بیشتر از مانده پذیرفته نمی‌شود — اضافه‌پرداخت
 * باید جدا (پیش‌پرداخت/طلبِ پروژهٔ دیگر) ثبت شود، نه بی‌صدا روی این ردیف.
 */
export function installmentPart(
  input: string | null | undefined,
  amount: string | number,
  paid: string | number,
): string {
  const remaining = unitRemaining(amount, paid);
  if (!(remaining > 0)) throw new UnitInstallmentError('nothing_left');
  const raw = (input ?? '').trim();
  if (raw === '') return remaining.toFixed(4);
  const part = Number(raw);
  if (!Number.isFinite(part) || part <= 0) throw new UnitInstallmentError('part_invalid');
  // ⚠️ رواداریِ گردکردن: ۱۰۵٫۲۶ در برابرِ ماندهٔ ۱۰۵٫۲۶۰۰۱.
  if (round4(part) > remaining + 0.005) throw new UnitInstallmentError('part_too_big');
  return round4(Math.min(part, remaining)).toFixed(4);
}

/** پیامِ کاربر برای هر کدِ خطا. */
export const INSTALLMENT_MESSAGES: Record<UnitInstallmentError['code'], string> = {
  nothing_left: 'این کارکرد مانده‌ای برای پرداخت ندارد.',
  part_invalid: 'مبلغِ قسط معتبر نیست.',
  part_too_big: 'مبلغِ قسط از ماندهٔ این کارکرد بیشتر است.',
};
