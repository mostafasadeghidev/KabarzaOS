/**
 * هزینه‌های دوره‌ای — ترجمهٔ `Support\Recurring_Expenses`.
 *
 * یک هزینه یا **دوره‌ای** است (سررسیدش جلو می‌رود) یا **یک‌بار** (پس از پرداخت
 * بسته می‌شود). «پرداخت» یک ردیفِ خرجِ دفتر می‌نویسد و سررسید را جابه‌جا می‌کند.
 */

export const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const UNIT_LABELS: Record<IntervalUnit, string> = {
  day: 'روزانه',
  week: 'هفتگی',
  month: 'ماهانه',
  year: 'سالانه',
};

export type ExpenseKind = 'recurring' | 'once';

export const KIND_LABELS: Record<ExpenseKind, string> = {
  recurring: 'دوره‌ای',
  once: 'یک‌بار',
};

export function normalizeUnit(raw: string): IntervalUnit {
  return (INTERVAL_UNITS as readonly string[]).includes(raw) ? (raw as IntervalUnit) : 'month';
}

/**
 * سررسیدِ بعدی.
 *
 * ⚠️ افزودنِ ماه با «تهِ ماه» مشکل دارد: ۳۱ ژانویه + ۱ ماه در حسابِ ساده
 * می‌شود ۳ مارس. اینجا به آخرین روزِ ماهِ مقصد بریده می‌شود تا سررسیدِ
 * «۳۱ هر ماه» در ماه‌های کوتاه نپرد.
 */
export function computeNext(date: string, unit: IntervalUnit, count: number): string {
  const step = Math.max(1, Math.trunc(count));
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];

  if (unit === 'day' || unit === 'week') {
    const days = unit === 'week' ? step * 7 : step;
    const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }

  const monthsToAdd = unit === 'year' ? step * 12 : step;
  const total = (m - 1) + monthsToAdd;
  const targetYear = y + Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;

  // آخرین روزِ ماهِ مقصد — روزِ ۰ ماهِ بعد.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const day = Math.min(d, lastDay);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export class RecurringPayError extends Error {
  constructor(readonly code: 'already_paid' | 'not_found') {
    super(`recurring pay refused: ${code}`);
    this.name = 'RecurringPayError';
  }
}

export interface PayPlan {
  /** ردیفِ خرج نوشته شود؟ فقط وقتی حسابِ پرداخت انتخاب شده باشد. */
  bookLedger: boolean;
  /** پس از پرداخت: سررسیدِ نو، یا بستنِ هزینهٔ یک‌بار. */
  after: { type: 'reschedule'; nextDueDate: string } | { type: 'deactivate' };
}

/**
 * نقشهٔ «پرداخت».
 *
 * ⚠️ دو قاعده:
 * ۱. **بی‌اثریِ کلیکِ دوباره** — لینکِ پرداخت تاریخِ سررسیدی را که کاربر دیده
 * با خود می‌برد. اگر زمان‌بندی از آن گذشته باشد (دابل‌کلیک یا ارسالِ دوباره
 * پس از back)، این نوبت قبلاً پرداخت شده و کاری انجام نمی‌شود — نه اینکه
 * یک ردیفِ تکراری در دفتر بنویسد.
 * ۲. هزینهٔ **یک‌بار** پس از پرداخت بسته می‌شود، نه اینکه سررسیدش جلو برود.
 *
 * ⚠️ قفلِ دورهٔ مالی جدا و **پیش از** این بررسی می‌شود؛ آنجا سررسید هم جلو
 * نمی‌رود تا چیزی بی‌صدا گم نشود.
 */
export function planPay(
  expense: {
    kind: ExpenseKind;
    nextDueDate: string;
    intervalUnit: IntervalUnit;
    intervalCount: number;
    accountId: number | null;
  },
  expectedDue: string | null,
): PayPlan {
  if (expectedDue && expectedDue.slice(0, 10) !== expense.nextDueDate.slice(0, 10)) {
    throw new RecurringPayError('already_paid');
  }

  return {
    bookLedger: expense.accountId !== null,
    after: expense.kind === 'once'
      ? { type: 'deactivate' }
      : {
          type: 'reschedule',
          nextDueDate: computeNext(expense.nextDueDate, expense.intervalUnit, expense.intervalCount),
        },
  };
}

export type DueBucket = 'overdue' | 'week' | 'month' | 'next_month' | 'later';

/** برچسبِ سطل‌ها — همان چهار دستهٔ نسخهٔ قبلی. */
export const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'معوق (سررسید گذشته)',
  week: '۷ روز آینده',
  month: '۸ تا ۳۰ روز آینده (این ماه)',
  next_month: '۳۱ تا ۶۰ روز آینده (ماه آینده)',
  later: 'بعدتر',
};

/** سطلِ سررسید — پایهٔ گروه‌بندیِ فهرست. */
export function dueBucket(dueDate: string, today: string): DueBucket {
  const days = Math.floor(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return 'overdue';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  if (days <= 60) return 'next_month';
  return 'later';
}
