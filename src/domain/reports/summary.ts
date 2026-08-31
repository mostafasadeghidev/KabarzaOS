/**
 * گزارش‌ها — ترجمهٔ `Support\Reports`.
 *
 * همهٔ اعداد در **ارزِ پایه** (یورو) جمع می‌شوند، از ستون‌های منجمدِ
 * `amount_eur` — نه با تبدیلِ دوباره (R-FISCAL-08).
 */

export interface OverallInput {
  /** ارزشِ پروژه‌ها به یورو. */
  totalValue: string;
  /** هزینه‌های قابلِ صورت‌حساب — به بدهیِ کارفرما اضافه می‌شوند. */
  billableExpenses: string;
  clientPaid: string;
  memberAgreed: string;
  memberPaid: string;
  projectCount: number;
  minutes: number;
}

export interface OverallSummary {
  projectCount: number;
  totalValue: string;
  expenses: string;
  clientPaid: string;
  clientDue: string;
  memberAgreed: string;
  memberPaid: string;
  memberDebt: string;
  minutes: number;
}

const n = (v: string) => Number(v || '0');
const fixed = (v: number) => v.toFixed(2);

/**
 * خلاصهٔ کلی.
 *
 * ⚠️ دو قاعده:
 *  ۱. **هزینه‌های قابلِ صورت‌حساب به بدهیِ کارفرما اضافه می‌شوند** — کارفرما
 *     هم بابتِ قیمتِ پروژه بدهکار است هم بابتِ هزینه‌هایی که برایش خرج شده.
 *  ۲. بدهی هرگز **منفی** نمی‌شود: پیش‌پرداختِ بیش از قیمت یعنی صفر بدهی، نه
 *     بدهیِ منفی که در جمعِ کل، بدهیِ پروژه‌های دیگر را می‌خورد.
 */
export function overallSummary(input: OverallInput): OverallSummary {
  const value = n(input.totalValue);
  const expenses = n(input.billableExpenses);
  const clientPaid = n(input.clientPaid);
  const memberAgreed = n(input.memberAgreed);
  const memberPaid = n(input.memberPaid);

  return {
    projectCount: input.projectCount,
    totalValue: fixed(value),
    expenses: fixed(expenses),
    clientPaid: fixed(clientPaid),
    clientDue: fixed(Math.max(0, value + expenses - clientPaid)),
    memberAgreed: fixed(memberAgreed),
    memberPaid: fixed(memberPaid),
    memberDebt: fixed(Math.max(0, memberAgreed - memberPaid)),
    minutes: input.minutes,
  };
}

/**
 * ⚠️ R-LEDGER-06 — ردیف‌های **انتقالِ داخلی** از گزارشِ درآمد/هزینه کنار
 * می‌روند.
 *
 * چرا: انتقالِ ۱۰۰۰ یورو از یک حساب به حسابِ دیگر، نه درآمد است نه هزینه —
 * پول از شرکت خارج نشده. شمردنش هزینه‌ها را دوبرابرِ واقعیت نشان می‌داد.
 */
export function isReportableExpense(row: { direction: string; transferGroup: string | null }): boolean {
  return row.direction === 'out' && !row.transferGroup;
}

export function isReportableIncome(row: { direction: string; transferGroup: string | null }): boolean {
  return row.direction === 'in' && !row.transferGroup;
}

/** مجموعِ ردیف‌های گزارش‌پذیر — با کنار گذاشتنِ انتقال‌ها. */
export function sumReportable(
  rows: Array<{ direction: string; transferGroup: string | null; amountEur: string }>,
  direction: 'in' | 'out',
): string {
  const keep = direction === 'out' ? isReportableExpense : isReportableIncome;
  return fixed(rows.filter(keep).reduce((sum, r) => sum + n(r.amountEur), 0));
}

/** ساعتِ کاری از دقیقه — «۱۲:۳۰». */
export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
