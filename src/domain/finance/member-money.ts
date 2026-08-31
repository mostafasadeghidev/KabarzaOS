/**
 * پولِ عضو از نگاهِ **خودِ عضو** — کارکردِ تعدادی و درخواستِ پرداخت.
 *
 * منبع: `Support\Unit_Entries` · `Support\Payment_Requests` ·
 *.
 */

/* ------------------------------------------------------------------ *
 * کارکردِ تعدادی
 * ------------------------------------------------------------------ */

export const UNIT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  requested: 'درخواست‌شده',
  paid: 'پرداخت‌شده',
};

/**
 * مبلغِ یک ردیفِ کارکرد = تعداد × نرخِ هر واحدِ عضو.
 *
 * ⚠️ نرخ از عضویتِ همان عضو در همان پروژه می‌آید. اگر نرخ ثبت نشده باشد
 * مبلغ صفر است — نه خطا: ردیف ثبت می‌شود و حسابدار بعداً مبلغ را می‌گذارد.
 * پول به‌صورتِ **رشته** حساب می‌شود تا اعشار خراب نشود (R-MONEY).
 */
export function unitAmount(quantity: number, unitRate: string | null): string {
  const rate = Number(unitRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return '0.0000';
  return (Math.max(0, Math.trunc(quantity)) * rate).toFixed(4);
}

/** تعدادِ معتبر — کمتر از یک بی‌معناست. */
export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1;
}

/**
 * آیا این ردیفِ کارکرد قابلِ حذف است؟
 * ⚠️ ردیفِ **پرداخت‌شده** هرگز — سندِ مالیِ انجام‌شده است.
 */
export function canDeleteUnit(status: string, isFrozen: boolean): boolean {
  return status !== 'paid' && !isFrozen;
}

/* ------------------------------------------------------------------ *
 * درخواستِ پرداخت
 * ------------------------------------------------------------------ */

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار بررسی',
  approved: 'تأییدشده',
  rejected: 'ردشده',
  paid: 'پرداخت‌شده',
};

/** درخواستِ «باز» یعنی هنوز پولش نرفته ولی رزرو شده. */
export const OPEN_STATUSES = ['pending', 'approved'] as const;

export function isOpenRequest(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * مبلغی که عضو **الان** می‌تواند درخواست کند.
 *
 * ⚠️ مانده منهای درخواست‌های بازِ قبلی. بدونِ کسرِ درخواست‌های باز، عضو
 * می‌توانست یک بدهی را چند بار درخواست کند و در نهایت دو برابر بگیرد.
 * هرگز منفی نمی‌شود.
 */
export function availableToRequest(remaining: string, outstanding: string): string {
  const value = Number(remaining) - Number(outstanding);
  return (value > 0 ? value : 0).toFixed(4);
}

export type RequestRejection =
  | 'amount_invalid'
  | 'exceeds_available'
  | 'already_open';

export const REQUEST_MESSAGES: Record<RequestRejection, string> = {
  amount_invalid: 'مبلغ معتبر نیست.',
  exceeds_available: 'مبلغ از باقی‌ماندهٔ قابلِ درخواست بیشتر است.',
  already_open: 'برای این ردیف درخواستِ بازی وجود دارد.',
};

/**
 * اعتبارسنجیِ درخواستِ پرداخت.
 * `null` یعنی مجاز است.
 */
export function validateRequest(input: {
  amount: string;
  available: string;
  hasOpenForUnit?: boolean;
}): RequestRejection | null {
  if (input.hasOpenForUnit) return 'already_open';

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'amount_invalid';
  // مقایسه با تلورانسِ یک ده‌هزارم تا خطای اعشارِ شناور مانع نشود.
  if (amount - Number(input.available) > 0.0001) return 'exceeds_available';
  return null;
}

/**
 * آیا این درخواست را می‌شود لغو کرد؟
 * ⚠️ فقط درخواستِ **در انتظارِ بررسی**؛ تأییدشده دیگر تصمیمِ حسابدار است و
 * پس‌گرفتنش یعنی دور زدنِ او.
 */
export function canCancelRequest(status: string): boolean {
  return status === 'pending';
}

/**
 * آیا این درخواست بایگانی‌شده است؟ — تصمیم‌گرفته‌شده‌ای که تاریخِ تصمیمش
 * داخلِ دورهٔ قفل افتاده.
 *
 * ⚠️ از خودِ تاریخِ قفل مشتق می‌شود، نه از پرچمی ذخیره‌شده؛ پس با بازکردنِ
 * دوره خودبه‌خود برمی‌گردد — دقیقاً مثلِ نمای حسابداری.
 */
export function isArchivedRequest(
  row: { status: string; decidedAt: string | null },
  lockDate: string | null,
): boolean {
  if (!lockDate) return false;
  if (row.status !== 'paid' && row.status !== 'rejected') return false;
  const decided = (row.decidedAt ?? '').slice(0, 10);
  return decided !== '' && decided <= lockDate;
}
