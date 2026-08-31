/**
 * پولِ تیم — قواعدِ docs/rules/TEAM-MONEY.md
 *
 * این ماژول تعیین می‌کند به چه کسی چقدر پول داده شود.
 * سه گاردِ مستقلِ ضدِ پرداختِ دوباره دارد (R-TEAM-06 · R-TEAM-08 · R-TEAM-11)
 * که هر سه از باگ‌های واقعیِ نسخهٔ قبلی آمده‌اند.
 */

import { convert, type RateSource } from '../currency/rates';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'paid';

/**
 * R-TEAM-02 — آستانهٔ اپسیلون.
 * با نوعِ decimal دیگر لازم نیست، ولی تست و مفهومش می‌ماند: مبلغی که
 * «به‌اندازهٔ ناچیزی» کم است باید پرداختِ کامل حساب شود.
 */
const EPSILON = 0.001;

function num(v: string | null | undefined): number {
  return v === null || v === undefined || v === '' ? 0 : Number(v);
}

/**
 * R-TEAM-02 — وضعیتِ سه‌حالته با آستانه.
 * بدونِ اپسیلون، پروژه‌ای که کامل تسویه شده «۰.۰۰۰۰۰۱ باقی‌مانده» نشان می‌دهد
 * و هیچ‌وقت «تمام» نمی‌شود.
 */
export function paymentStatus(paid: string, totalDue: string): PaymentStatus {
  const p = num(paid);
  const due = num(totalDue);
  if (p <= 0) return 'unpaid';
  if (due > 0 && p + EPSILON >= due) return 'paid';
  return 'partial';
}

/** R-TEAM-03 — باقی‌مانده هیچ‌وقت منفی نیست (اضافه‌پرداخت ≠ طلبِ منفی). */
export function remaining(totalDue: string, paid: string): number {
  return Math.max(0, num(totalDue) - num(paid));
}

export interface ProjectSummary {
  price: string;
  billableExpenses: string;
  totalDue: number;
  paid: string;
  remaining: number;
  status: PaymentStatus;
}

/** R-TEAM-04 — بدهیِ کارفرما = قیمتِ پروژه + هزینه‌های قابلِ صورتحساب. */
export function summarizeProject(price: string, billableExpenses: string, paid: string): ProjectSummary {
  const totalDue = num(price) + num(billableExpenses);
  const due = String(totalDue);
  return {
    price,
    billableExpenses,
    totalDue,
    paid,
    remaining: remaining(due, paid),
    status: paymentStatus(paid, due),
  };
}

/* ------------------------------------------------------------------ *
 * R-TEAM-01 — مبلغِ تسویه‌شده بر مبلغِ اسمی مقدم است
 * ------------------------------------------------------------------ */

export interface PaymentRow {
  amount: string;
  currencyId: number;
  /** آنچه واقعاً تسویه شد — حقیقت است؛ amount فقط توافق است. */
  amountSettled?: string | null;
  settledCurrencyId?: number | null;
}

/**
 * ارزشِ یک ردیفِ پرداخت در ارزِ دلخواه.
 * ترتیب: تسویه‌شده در همان ارز ← تسویه‌شده با تبدیل ← مبلغِ اسمی با تبدیل.
 * نبودِ نرخ `null` می‌دهد (R-MONEY-06)، نه رقمِ گمراه‌کننده.
 */
export function rowValueIn(source: RateSource, row: PaymentRow, targetCurrencyId: number): string | null {
  const settled = row.amountSettled;
  if (settled !== null && settled !== undefined && settled !== '') {
    if (row.settledCurrencyId === targetCurrencyId) return settled;
    if (row.settledCurrencyId) return convert(source, settled, row.settledCurrencyId, targetCurrencyId);
  }
  return convert(source, row.amount, row.currencyId, targetCurrencyId);
}

/* ------------------------------------------------------------------ *
 * گاردهای درخواستِ پرداخت
 * ------------------------------------------------------------------ */

export interface RequestRow {
  id: number;
  amount: string;
  status: RequestStatus;
  unitEntryId?: number | null;
}

/**
 * ⚠️ گاردِ ۱ — R-TEAM-06: ادعای دوباره.
 * فقط درخواست‌های «باز» سقف را مصرف می‌کنند:
 *  - paid     → قبلاً در پرداختِ واقعی منعکس شده
 *  - rejected → اصلاً به حساب نمی‌آید
 *  - pending/approved → ادعای زندهٔ روی ماندهٔ باقی‌مانده
 *
 * بدونِ این، عضو می‌تواند سه بار برای یک کار درخواست بدهد و هر سه تأیید شود.
 */
export function outstandingTotal(requests: RequestRow[]): number {
  return requests
    .filter((r) => r.status === 'pending' || r.status === 'approved')
    .reduce((sum, r) => sum + num(r.amount), 0);
}

/** حداکثر مبلغی که عضو می‌تواند تازه درخواست کند. */
export function requestableAmount(balance: string, requests: RequestRow[]): number {
  return Math.max(0, num(balance) - outstandingTotal(requests));
}

export class RequestValidationError extends Error {
  constructor(readonly code: 'amount' | 'exceeds_balance' | 'unit_already_requested') {
    super(`payment request invalid: ${code}`);
    this.name = 'RequestValidationError';
  }
}

/**
 * گاردِ ۲ — R-TEAM-09: هر ردیفِ کارِ تعدادی فقط یک درخواستِ باز دارد.
 */
export function assertRequestAllowed(
  amount: string,
  balance: string,
  existing: RequestRow[],
  unitEntryId?: number | null,
): void {
  if (num(amount) <= 0) throw new RequestValidationError('amount');

  if (unitEntryId) {
    const open = existing.some(
      (r) => r.unitEntryId === unitEntryId && (r.status === 'pending' || r.status === 'approved'),
    );
    if (open) throw new RequestValidationError('unit_already_requested');
  }

  if (num(amount) > requestableAmount(balance, existing) + EPSILON) {
    throw new RequestValidationError('exceeds_balance');
  }
}

export interface MarkPaidResult {
  status: RequestStatus;
  ledgerId: number;
  /** R-TEAM-08 — ردیفِ کارِ تعدادی هم با همین تراکنش بسته می‌شود. */
  closesUnitEntryId: number | null;
}

/**
 * گاردِ ۳ — R-TEAM-07 و R-TEAM-10.
 * درخواستِ ردشده هرگز پرداخت نمی‌شود؛ و «پرداخت‌شده» بدونِ تراکنشِ بانکیِ
 * واقعی معنا ندارد (این حلقه، پولِ تیم را با دفترکل هم‌خوان نگه می‌دارد).
 */
export function markPaid(request: RequestRow, ledgerId: number): MarkPaidResult | null {
  if (request.status === 'rejected') return null; // R-TEAM-07 — بی‌صدا رد می‌شود
  if (!ledgerId) throw new RequestValidationError('amount');
  return {
    status: 'paid',
    ledgerId,
    closesUnitEntryId: request.unitEntryId ?? null,
  };
}

/**
 * R-TEAM-11 — کارهای پرداخت‌نشده نباید درخواست‌های باز را تکرار کنند.
 * کامنتِ نسخهٔ قبلی صریح می‌گوید «ریسکِ پرداختِ دوباره».
 */
export function unpaidWorkExcludingRequested<T extends { id: number }>(
  unitEntries: T[],
  requests: RequestRow[],
): T[] {
  const claimed = new Set(
    requests
      .filter((r) => r.status === 'pending' || r.status === 'approved')
      .map((r) => r.unitEntryId)
      .filter((id): id is number => typeof id === 'number'),
  );
  return unitEntries.filter((e) => !claimed.has(e.id));
}
